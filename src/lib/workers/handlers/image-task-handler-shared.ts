import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { type TaskJobData } from '@/lib/task/types'
import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import {
  resolveImageSourceFromGeneration,
  toSignedUrlIfCos,
  uploadImageSourceToCos,
  withLabelBar,
} from '../utils'
import { resolveCharacterByEmbedding, type EmbedConfig, type CharacterIndexEntry } from '@/lib/embedding/character-index'
import type { VectorEntry } from '@/lib/embedding/cosine'

export type AnyObj = Record<string, unknown>

interface CharacterAppearanceLike {
  appearanceIndex?: number
  changeReason: string | null
  description?: string | null
  descriptions?: string | null
  imageUrls: string | null
  imageUrl: string | null
  selectedIndex: number | null
  bibleLocked?: boolean // 🔒 Character Bible 锁定，锁定后作为阶段6参考图强约束来源
}

interface CharacterLike {
  id: string
  name: string
  aliases?: string | null
  introduction?: string | null
  appearances?: CharacterAppearanceLike[]
}

interface LocationImageLike {
  description?: string | null
  availableSlots?: string | null
  imageIndex?: number
  isSelected: boolean
  imageUrl: string | null
}

interface LocationLike {
  name: string
  images?: LocationImageLike[]
}

interface NovelProjectData {
  videoRatio?: string | null
  colorGradePreset?: string | null
  characters?: CharacterLike[]
  locations?: LocationLike[]
}

interface PanelLike {
  sketchImageUrl?: string | null
  characters?: string | null
  location?: string | null
}

export interface PanelCharacterReference {
  name: string
  appearance?: string
  slot?: string
}

interface NovelDataDb {
  novelPromotionProject: {
    findUnique(args: Record<string, unknown>): Promise<NovelProjectData | null>
  }
}

export function parseJsonStringArray(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

export function parseImageUrls(value: string | null | undefined, fieldName: string): string[] {
  return decodeImageUrlsFromDb(value, fieldName)
}

export function clampCount(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

export function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

async function generateImageToStorage(params: {
  job: Job<TaskJobData>
  userId: string
  modelId: string
  prompt: string
  targetId: string
  keyPrefix: string
  options?: {
    referenceImages?: string[]
    aspectRatio?: string
    size?: string
    negativePrompt?: string  // 画风负向提示词，透传给支持 negative_prompt 的提供商
  }
  label?: string
}) {
  const source = await resolveImageSourceFromGeneration(params.job, {
    userId: params.userId,
    modelId: params.modelId,
    prompt: params.prompt,
    options: params.options,
  })

  const uploadSource = params.label
    ? await withLabelBar(source, params.label)
    : source
  const cosKey = await uploadImageSourceToCos(uploadSource, params.keyPrefix, params.targetId)
  return cosKey
}

export async function generateCleanImageToStorage(params: {
  job: Job<TaskJobData>
  userId: string
  modelId: string
  prompt: string
  targetId: string
  keyPrefix: string
  options?: {
    referenceImages?: string[]
    aspectRatio?: string
    size?: string
    negativePrompt?: string
  }
}) {
  return await generateImageToStorage(params)
}

export async function generateProjectLabeledImageToStorage(params: {
  job: Job<TaskJobData>
  userId: string
  modelId: string
  prompt: string
  label: string
  targetId: string
  keyPrefix: string
  options?: {
    referenceImages?: string[]
    aspectRatio?: string
    size?: string
    negativePrompt?: string  // 画风负向提示词，透传给支持 negative_prompt 的提供商
  }
}) {
  return await generateImageToStorage(params)
}

export async function resolveNovelData(projectId: string) {
  const db = prisma as unknown as NovelDataDb
  const data = await db.novelPromotionProject.findUnique({
    where: { projectId },
    include: {
      characters: { include: { appearances: { orderBy: { appearanceIndex: 'asc' } } } },
      locations: { include: { images: { orderBy: { imageIndex: 'asc' } } } },
    },
  })

  if (!data) {
    throw new Error(`NovelPromotionProject not found: ${projectId}`)
  }

  return data
}

export function parsePanelCharacterReferences(value: string | null | undefined): PanelCharacterReference[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item: unknown) => {
        if (typeof item === 'string') return { name: item }
        if (!item || typeof item !== 'object') return null
        const candidate = item as { name?: unknown; appearance?: unknown; slot?: unknown }
        if (typeof candidate.name === 'string') {
          return {
            name: candidate.name,
            appearance: typeof candidate.appearance === 'string' ? candidate.appearance : undefined,
            slot: typeof candidate.slot === 'string' ? candidate.slot : undefined,
          }
        }
        return null
      })
      .filter(Boolean) as PanelCharacterReference[]
  } catch {
    return []
  }
}

/**
 * 按角色名查找角色（支持别名匹配）
 * 优先级：1. 精确全名匹配  2. 按 '/' 拆分后别名精确匹配
 * 例：引用名 "顾娘子" 可匹配角色 "顾娘子/顾盼之"
 */
export function findCharacterByName<T extends { name: string }>(characters: T[], referenceName: string): T | undefined {
  const refLower = referenceName.toLowerCase().trim()
  if (!refLower) return undefined

  // 优先级 1：精确全名匹配
  const exact = characters.find((c) => c.name.toLowerCase().trim() === refLower)
  if (exact) return exact

  // 优先级 2：别名匹配 — 按 '/' 拆分后任一别名精确匹配
  const refAliases = refLower.split('/').map((s) => s.trim()).filter(Boolean)
  for (const character of characters) {
    const charAliases = character.name.toLowerCase().split('/').map((s) => s.trim()).filter(Boolean)
    const hasOverlap = refAliases.some((refAlias) => charAliases.includes(refAlias))
    if (hasOverlap) return character
  }

  return undefined
}

/**
 * findCharacterByName 的 async 升级版，字符串未命中时走 embedding 语义兜底。
 * T 需包含 id 字段以便从向量索引结果回溯到原对象。
 * config 为 null 或索引为空时等价于原版同步函数。
 */
export async function findCharacterByNameWithEmbedding<T extends { name: string; id: string }>(
  characters: T[],
  referenceName: string,
  index: VectorEntry<CharacterIndexEntry>[],
  config: EmbedConfig | null,
): Promise<T | undefined> {
  const syncResult = findCharacterByName(characters, referenceName)
  if (syncResult) return syncResult as T

  if (!config || index.length === 0) return undefined
  const resolved = await resolveCharacterByEmbedding(referenceName, index, config, 0.78)
  if (!resolved) return undefined
  return characters.find((c) => c.id === resolved.id)
}

/**
 * 将 panel.characters JSON 中的角色称谓预归一化到数据库主名。
 * 字符串精确/别名已能命中的保持不变，未命中时走 embedding 语义查找（阈值 0.78）。
 * config 为 null 或索引为空时直接返回原始 JSON（零副作用）。
 */
export async function normalizePanelCharacterRefs(
  panelCharactersJson: string | null | undefined,
  characters: CharacterLike[],
  index: VectorEntry<CharacterIndexEntry>[],
  config: EmbedConfig | null,
): Promise<string | null> {
  if (!config || index.length === 0) return panelCharactersJson ?? null
  const refs = parsePanelCharacterReferences(panelCharactersJson)
  if (refs.length === 0) return panelCharactersJson ?? null

  let changed = false
  const normalized: PanelCharacterReference[] = []
  for (const ref of refs) {
    const alreadyHit = findCharacterByName(characters, ref.name)
    if (alreadyHit) {
      normalized.push(ref)
      continue
    }
    const resolved = await resolveCharacterByEmbedding(ref.name, index, config, 0.78)
    if (resolved) {
      changed = true
      normalized.push({ ...ref, name: resolved.name })
    } else {
      normalized.push(ref)
    }
  }
  return changed ? JSON.stringify(normalized) : (panelCharactersJson ?? null)
}

export async function collectPanelReferenceImages(projectData: NovelProjectData, panel: PanelLike) {
  const refs: string[] = []

  const sketch = toSignedUrlIfCos(panel.sketchImageUrl, 3600)
  if (sketch) refs.push(sketch)

  const panelCharacters = parsePanelCharacterReferences(panel.characters)
  for (const item of panelCharacters) {
    const character = findCharacterByName(projectData.characters || [], item.name)
    if (!character) continue

    const appearances = character.appearances || []
    // 🔒 如果有已锁定的 Bible 形象，优先用它（较 item.appearance 指定和默认第0个优先级更高）
    const lockedAppearance = appearances.find((a) => a.bibleLocked && a.imageUrl)
    let appearance = lockedAppearance || appearances[0]
    if (!lockedAppearance && item.appearance) {
      const matched = appearances.find((a) => (a.changeReason || '').toLowerCase() === item.appearance!.toLowerCase())
      if (matched) appearance = matched
    }

    if (!appearance) continue

    const imageUrls = parseImageUrls(appearance.imageUrls, 'characterAppearance.imageUrls')
    const selectedIndex = appearance.selectedIndex
    const selectedUrl = selectedIndex !== null && selectedIndex !== undefined ? imageUrls[selectedIndex] : null
    const key = selectedUrl || imageUrls[0] || appearance.imageUrl
    const signed = toSignedUrlIfCos(key, 3600)
    if (signed) refs.push(signed)
  }

  if (panel.location) {
    const location = (projectData.locations || []).find((loc) => loc.name.toLowerCase() === panel.location!.toLowerCase())
    if (location) {
      const images = location.images || []
      const selected = images.find((img) => img.isSelected) || images[0]
      const signed = toSignedUrlIfCos(selected?.imageUrl, 3600)
      if (signed) refs.push(signed)
    }
  }

  return refs
}
