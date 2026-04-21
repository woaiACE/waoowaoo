import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive, getUserModels, toSignedUrlIfCos } from '@/lib/workers/utils'
import { generateCleanImageToStorage } from './image-task-handler-shared'
import { addCharacterPromptSuffix, addLocationPromptSuffix, addPropPromptSuffix, CHARACTER_ASSET_IMAGE_RATIO, LOCATION_IMAGE_RATIO, PROP_IMAGE_RATIO } from '@/lib/constants'
import type { TaskJobData } from '@/lib/task/types'
import type { CharacterProfileData } from '@/types/character-profile'

/**
 * 从 profileData JSON 字符串中提取 body_proportion（体型比例）
 * profileData 早于图像生成和音色设计存在，是体型信息的正确来源
 */
function extractBodyProportionFromProfile(profileData: string | null | undefined): string {
  if (!profileData) return ''
  try {
    const parsed = JSON.parse(profileData) as CharacterProfileData
    return typeof parsed.body_proportion === 'string' ? parsed.body_proportion.trim() : ''
  } catch {
    return ''
  }
}

/**
 * LXT 资产 AI 图像生成 Worker Handler
 *
 * Payload: { assetId }
 * 完成后写回 LxtProjectAsset.imageUrl（签名后的临时 URL）
 */
export async function handleLxtAssetImageTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const userId = job.data.userId

  const assetId = typeof payload.assetId === 'string' ? payload.assetId.trim() : ''
  if (!assetId) throw new Error('lxt_asset_image: assetId is required')

  await reportTaskProgress(job, 10, {
    stage: 'lxt_asset_image_start',
    stageLabel: '开始生成形象图',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_asset_image_start')

  const asset = await prisma.lxtProjectAsset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      name: true,
      kind: true,
      description: true,
      summary: true,
      profileData: true,
    },
  })
  if (!asset) throw new Error(`LXT asset not found: ${assetId}`)

  const userModels = await getUserModels(userId)

  // 根据资产类型选择模型和 prompt 后缀
  let modelId: string | null
  let aspectRatio: string
  let rawPrompt: string
  let finalPrompt: string

  if (asset.kind === 'character') {
    modelId = userModels.characterModel ?? null
    aspectRatio = CHARACTER_ASSET_IMAGE_RATIO
    const baseDesc = asset.description?.trim() || asset.summary?.trim() || asset.name
    // body_proportion 在档案分析阶段（analyze-assets）就已确定，早于图像生成和音色推理
    // 不依赖 voicePrompt，避免音色推理尚未完成时体型信息缺失
    const bodyProportion = extractBodyProportionFromProfile(asset.profileData)
    rawPrompt = bodyProportion ? `${bodyProportion}，${baseDesc}` : baseDesc
    finalPrompt = addCharacterPromptSuffix(rawPrompt)
  } else if (asset.kind === 'location') {
    modelId = userModels.locationModel ?? null
    aspectRatio = LOCATION_IMAGE_RATIO
    rawPrompt = asset.description?.trim() || asset.summary?.trim() || asset.name
    finalPrompt = addLocationPromptSuffix(rawPrompt)
  } else {
    // prop
    modelId = userModels.locationModel ?? null
    aspectRatio = PROP_IMAGE_RATIO
    rawPrompt = asset.description?.trim() || asset.summary?.trim() || asset.name
    finalPrompt = addPropPromptSuffix(rawPrompt)
  }

  if (!modelId) {
    throw new Error(`Image model not configured for kind=${asset.kind}`)
  }

  await reportTaskProgress(job, 30, {
    stage: 'lxt_asset_image_generate',
    stageLabel: '生成图像中…',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_asset_image_generate')

  const cosKey = await generateCleanImageToStorage({
    job,
    userId,
    modelId,
    prompt: finalPrompt,
    targetId: assetId,
    keyPrefix: 'lxt/asset-images',
    options: { aspectRatio },
  })

  await reportTaskProgress(job, 90, {
    stage: 'lxt_asset_image_persist',
    stageLabel: '保存图像',
    displayMode: 'detail',
  })

  const signedUrl = toSignedUrlIfCos(cosKey, 72 * 3600)

  const slotIndex = typeof payload.slotIndex === 'number' ? payload.slotIndex : undefined

  if (slotIndex !== undefined) {
    // Multi-slot: atomically update imageUrls array at the given slot
    await prisma.$transaction(async (tx) => {
      const current = await tx.lxtProjectAsset.findUnique({
        where: { id: assetId },
        select: { imageUrls: true },
      })
      const urls: (string | null)[] = current?.imageUrls
        ? (JSON.parse(current.imageUrls) as (string | null)[])
        : []
      while (urls.length <= slotIndex) urls.push(null)
      urls[slotIndex] = signedUrl
      const updateData: Record<string, unknown> = { imageUrls: JSON.stringify(urls) }
      // Slot 0 sets the primary imageUrl too
      if (slotIndex === 0) updateData.imageUrl = signedUrl
      await tx.lxtProjectAsset.update({ where: { id: assetId }, data: updateData })
    })
  } else {
    await prisma.lxtProjectAsset.update({
      where: { id: assetId },
      data: { imageUrl: signedUrl },
    })
  }

  return { success: true, assetId, imageUrl: signedUrl, slotIndex }
}
