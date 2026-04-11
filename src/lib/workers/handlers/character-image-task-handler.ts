import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { createScopedLogger } from '@/lib/logging/core'
import { CHARACTER_ASSET_IMAGE_RATIO, addCharacterPromptSuffix, getArtStylePrompt, getArtStyleNegativePrompt, isArtStyleValue, PRIMARY_APPEARANCE_INDEX, isArkModelKey, isGeminiCompatibleModelKey, convertNegativeToPositivePrompt, type ArtStyleValue } from '@/lib/constants'
import { getColorGradePromptKeywords } from '@/lib/color-grade-presets'
import { type TaskJobData } from '@/lib/task/types'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import { reportTaskProgress } from '../shared'
import {
  assertTaskActive,
  getProjectModels,
  toSignedUrlIfCos,
} from '../utils'
import { normalizeReferenceImagesForGeneration } from '@/lib/media/outbound-image'
import {
  AnyObj,
  generateProjectLabeledImageToStorage,
  parseImageUrls,
  parseJsonStringArray,
  pickFirstString,
} from './image-task-handler-shared'

function resolvePayloadArtStyle(payload: AnyObj): ArtStyleValue | undefined {
  if (!Object.prototype.hasOwnProperty.call(payload, 'artStyle')) return undefined
  const parsedArtStyle = typeof payload.artStyle === 'string' ? payload.artStyle.trim() : ''
  if (!isArtStyleValue(parsedArtStyle)) {
    throw new Error('Invalid artStyle in IMAGE_CHARACTER payload')
  }
  return parsedArtStyle
}

interface CharacterAppearanceRecord {
  id: string
  characterId: string
  appearanceIndex: number
  descriptions: string | null
  description: string | null
  imageUrls: string | null
  selectedIndex: number | null
  imageUrl: string | null
  changeReason: string | null
}

interface CharacterAppearanceWithCharacter extends CharacterAppearanceRecord {
  character: {
    name: string
  }
}

interface CharacterRecord {
  id: string
  name: string
  appearances: CharacterAppearanceRecord[]
}

interface PrimaryAppearanceRecord {
  imageUrl: string | null
  imageUrls: string | null
}

interface CharacterImageDb {
  characterAppearance: {
    findUnique(args: Record<string, unknown>): Promise<CharacterAppearanceWithCharacter | null>
    findFirst(args: Record<string, unknown>): Promise<PrimaryAppearanceRecord | null>
    update(args: Record<string, unknown>): Promise<unknown>
  }
  novelPromotionCharacter: {
    findUnique(args: Record<string, unknown>): Promise<CharacterRecord | null>
  }
}

export async function handleCharacterImageTask(job: Job<TaskJobData>) {
  const db = prisma as unknown as CharacterImageDb
  const payload = (job.data.payload || {}) as AnyObj
  const projectId = job.data.projectId
  const userId = job.data.userId
  const logger = createScopedLogger({
    module: 'worker.character-image',
    action: 'character_image_generate',
    taskId: job.data.taskId,
    projectId,
    userId,
  })
  const models = await getProjectModels(projectId, userId)
  const modelId = models.characterModel
  if (!modelId) throw new Error('Character model not configured')

  const appearanceId = pickFirstString(job.data.targetId, payload.appearanceId)
  let appearance: CharacterAppearanceRecord | null = null
  let characterName = '角色'

  if (appearanceId) {
    const appearanceWithCharacter = await db.characterAppearance.findUnique({
      where: { id: appearanceId },
      include: { character: true },
    })
    if (appearanceWithCharacter) {
      appearance = appearanceWithCharacter
      characterName = appearanceWithCharacter.character.name
    }
  }

  const characterId = typeof payload.id === 'string' ? payload.id : null
  if (!appearance && characterId) {
    const character = await db.novelPromotionCharacter.findUnique({
      where: { id: characterId },
      include: { appearances: { orderBy: { appearanceIndex: 'asc' } } },
    })
    appearance = character?.appearances?.[0] || null
    if (character && appearance) {
      characterName = character.name
    }
  }

  if (!appearance) throw new Error('Character appearance not found')

  const payloadArtStyle = resolvePayloadArtStyle(payload)
  const effectiveArtStyleId = payloadArtStyle ?? models.artStyle
  const artStyleBase = getArtStylePrompt(effectiveArtStyleId, job.data.locale)
  const colorKeywords = getColorGradePromptKeywords(models.colorGradePreset ?? 'auto')
  const artStyle = colorKeywords ? `${artStyleBase}, ${colorKeywords}` : artStyleBase
  const artStyleNegativePrompt = getArtStyleNegativePrompt(effectiveArtStyleId)
  const isArkModel = isArkModelKey(modelId)
  const isNativeNegativeUnsupported = isArkModel || isGeminiCompatibleModelKey(modelId)
  // Ark 豆包和 Gemini 兼容模型均不支持 negative_prompt，预先将负向词转换为正向约束备用
  const positiveNegativeFallback = isNativeNegativeUnsupported && artStyleNegativePrompt
    ? convertNegativeToPositivePrompt(artStyleNegativePrompt)
    : null
  const descriptions = parseJsonStringArray(appearance.descriptions)
  const baseDescriptions = descriptions.length > 0 ? descriptions : [appearance.description || '']

  // 子形象（不是主形象）生成时，引用主形象图片保持一致性
  // 主形象：若来源于全局资产库，注入全局形象图作为像素级视觉约束
  const primaryReferenceInputs: string[] = []
  if (appearance.appearanceIndex > PRIMARY_APPEARANCE_INDEX) {
    const primaryAppearance = await db.characterAppearance.findFirst({
      where: {
        characterId: appearance.characterId,
        appearanceIndex: PRIMARY_APPEARANCE_INDEX,
      },
      select: { imageUrl: true, imageUrls: true },
    })
    if (primaryAppearance) {
      const primaryMainUrl = primaryAppearance.imageUrl
        ? toSignedUrlIfCos(primaryAppearance.imageUrl, 3600)
        : null
      if (primaryMainUrl) {
        primaryReferenceInputs.push(primaryMainUrl)
      }
    }
  } else {
    // 主形象初次生成：若角色从全局资产库复制而来，取全局形象的首个 appearance 图片作为参考
    const sourceChar = await prisma.novelPromotionCharacter.findUnique({
      where: { id: appearance.characterId },
      select: { sourceGlobalCharacterId: true },
    })
    if (sourceChar?.sourceGlobalCharacterId) {
      const globalAppearance = await prisma.globalCharacterAppearance.findFirst({
        where: {
          characterId: sourceChar.sourceGlobalCharacterId,
          appearanceIndex: PRIMARY_APPEARANCE_INDEX,
        },
        select: { imageUrl: true },
      })
      const globalImageUrl = globalAppearance?.imageUrl
      if (globalImageUrl) {
        const signedGlobalImageUrl = toSignedUrlIfCos(globalImageUrl, 3600)
        if (signedGlobalImageUrl) {
          primaryReferenceInputs.push(signedGlobalImageUrl)
          logger.info({ message: 'global character reference image injected', details: { sourceGlobalCharacterId: sourceChar.sourceGlobalCharacterId } })
        }
      }
    }
  }
  const primaryReferenceImages = await normalizeReferenceImagesForGeneration(primaryReferenceInputs)

  const singleIndex = payload.imageIndex ?? payload.descriptionIndex
  const count = normalizeImageGenerationCount('character', payload.count)
  const indexes = singleIndex !== undefined
    ? [Number(singleIndex)]
    : Array.from({ length: count }, (_value, index) => index)

  const imageUrls = parseImageUrls(appearance.imageUrls, 'characterAppearance.imageUrls')
  const nextImageUrls = [...imageUrls]
  const label = `${characterName} - ${appearance.changeReason || '形象'}`

  for (let i = 0; i < indexes.length; i++) {
    const index = indexes[i]
    const raw = baseDescriptions[index] || baseDescriptions[0]
    const basePrompt = artStyle ? `${addCharacterPromptSuffix(raw)}，${artStyle}` : addCharacterPromptSuffix(raw)
    const prompt = positiveNegativeFallback ? `${basePrompt}，${positiveNegativeFallback}` : basePrompt
    logger.info({ message: 'character image prompt resolved', details: { index, promptText: prompt, isArkModel } })

    await reportTaskProgress(job, 15 + Math.floor((i / Math.max(indexes.length, 1)) * 55), {
      stage: 'generate_character_image',
      index,
    })

    const imageKey = await generateProjectLabeledImageToStorage({
      job,
      userId,
      modelId,
      prompt,
      label,
      targetId: `${appearance.id}-${index}`,
      keyPrefix: 'character',
      options: {
        referenceImages: primaryReferenceImages.length > 0 ? primaryReferenceImages : undefined,
        aspectRatio: CHARACTER_ASSET_IMAGE_RATIO,
        negativePrompt: isNativeNegativeUnsupported ? undefined : artStyleNegativePrompt,
      },
    })

    while (nextImageUrls.length <= index) {
      nextImageUrls.push('')
    }
    nextImageUrls[index] = imageKey
  }

  const selectedIndex = appearance.selectedIndex
  const fallbackMain = nextImageUrls.find((url) => typeof url === 'string' && url) || appearance.imageUrl
  const mainImage = selectedIndex !== null && selectedIndex !== undefined && nextImageUrls[selectedIndex]
    ? nextImageUrls[selectedIndex]
    : fallbackMain

  await assertTaskActive(job, 'persist_character_image')
  await db.characterAppearance.update({
    where: { id: appearance.id },
    data: {
      imageUrls: encodeImageUrls(nextImageUrls),
      imageUrl: mainImage || null,
    },
  })

  return {
    appearanceId: appearance.id,
    imageCount: nextImageUrls.filter(Boolean).length,
    imageUrl: mainImage || null,
  }
}
