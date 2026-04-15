import { prisma } from '@/lib/prisma'
import { removeLocationPromptSuffix } from '@/lib/constants'
import type { StoryToScriptClipCandidate } from '@/lib/novel-promotion/story-to-script/orchestrator'
import { seedProjectLocationBackedImageSlots } from '@/lib/assets/services/location-backed-assets'
import { normalizeLocationAvailableSlots } from '@/lib/location-available-slots'
import { resolvePropVisualDescription } from '@/lib/assets/prop-description'
import { resolveCharacterByEmbedding, type EmbedConfig, type CharacterIndexEntry } from '@/lib/embedding/character-index'
import type { VectorEntry } from '@/lib/embedding/cosine'

/** embedding 预计算结果表（事务外预建，供事务内使用，避免 HTTP 在 tx 里占锁） */
export type CharacterPreResolvedMap = Map<string, CharacterIndexEntry>

export type AnyObj = Record<string, unknown>

export function parseEffort(value: unknown): 'minimal' | 'low' | 'medium' | 'high' | null {
  if (value === 'minimal' || value === 'low' || value === 'medium' || value === 'high') return value
  return null
}

export function parseTemperature(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.7
  return Math.max(0, Math.min(2, value))
}

export function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

export function resolveClipRecordId(clipMap: Map<string, string>, clipId: string): string | null {
  return clipMap.get(clipId) || null
}

type CharacterCreateDb = {
  novelPromotionCharacter: typeof prisma.novelPromotionCharacter
}

type LocationCreateDb = {
  novelPromotionLocation: typeof prisma.novelPromotionLocation
  locationImage: typeof prisma.locationImage
}

type ClipPersistDb = {
  novelPromotionClip: typeof prisma.novelPromotionClip
}

/** 已有角色信息：id 用于 upsert，hasProfile 为 true 表示已有完整视觉档案（有介绍），false 表示仅名字存根 */
export type ExistingCharacterEntry = { id: string; hasProfile: boolean }

export async function persistAnalyzedCharacters(params: {
  projectInternalId: string
  existingNames: Map<string, ExistingCharacterEntry>
  analyzedCharacters: Record<string, unknown>[]
  db?: CharacterCreateDb
  /** embedding 配置；null 表示未配置，降级到纯字符串匹配 */
  embedConfig?: EmbedConfig | null
  /** 已构建的角色向量索引 */
  characterEmbeddingIndex?: VectorEntry<CharacterIndexEntry>[]
  /**
   * 事务外预计算的 embedding 映射表（key = candidateName.toLowerCase()）。
   * 优先于实时 HTTP 调用，适用于 prisma.$transaction 场景。
   */
  preResolvedMap?: CharacterPreResolvedMap
}) {
  const created: Array<{ id: string; name: string }> = []
  const db = params.db ?? prisma

  for (const item of params.analyzedCharacters) {
    const name = asString(item.name).trim()
    if (!name) continue
    const key = name.toLowerCase()
    const existing = params.existingNames.get(key)

    const profileData = {
      role_level: item.role_level,
      archetype: item.archetype,
      personality_tags: toStringArray(item.personality_tags),
      era_period: item.era_period,
      social_class: item.social_class,
      occupation: item.occupation,
      costume_tier: item.costume_tier,
      suggested_colors: toStringArray(item.suggested_colors),
      primary_identifier: item.primary_identifier,
      visual_keywords: toStringArray(item.visual_keywords),
      gender: item.gender,
      age_range: item.age_range,
    }

    if (existing) {
      // 已有完整档案 → 跳过（避免覆盖用户已确认的档案）
      if (existing.hasProfile) continue
      // 仅名字存根 → upsert 视觉档案
      await db.novelPromotionCharacter.update({
        where: { id: existing.id },
        data: {
          aliases: JSON.stringify(toStringArray(item.aliases)),
          introduction: asString(item.introduction) || null,
          profileData: JSON.stringify(profileData),
        },
      })
      // 标记为已完善，防止同批次重复 upsert
      existing.hasProfile = true
      continue
    }

    // 字符串未命中 → embedding 语义兜底
    // 优先查事务外预计算表（tx 安全），无预计算表时 fallback 到实时 HTTP（仅非 tx 路径）
    const embedConfig = params.embedConfig ?? null
    const embeddingIndex = params.characterEmbeddingIndex ?? []
    let resolved: CharacterIndexEntry | null = params.preResolvedMap?.get(key) ?? null
    if (!resolved && embedConfig && embeddingIndex.length > 0) {
      const introduction = asString(item.introduction)
      const candidateText = introduction ? `${name}。${introduction.slice(0, 200)}` : name
      resolved = await resolveCharacterByEmbedding(candidateText, embeddingIndex, embedConfig)
    }
    if (resolved) {
      // 语义命中 → 把新名字注册为 alias，如有 profile 则升级
      const resolvedEntry = params.existingNames.get(resolved.name.toLowerCase())
      if (resolvedEntry) {
        if (!resolvedEntry.hasProfile) {
          // 合并 aliases 并去重，避免写入重复别名
          const mergedAliases = [...resolved.aliases, name].filter(
            (a, i, arr) => arr.findIndex((x) => x.toLowerCase() === a.toLowerCase()) === i,
          )
          await db.novelPromotionCharacter.update({
            where: { id: resolvedEntry.id },
            data: {
              aliases: JSON.stringify(mergedAliases),
              introduction: asString(item.introduction) || null,
              profileData: JSON.stringify(profileData),
            },
          })
          resolvedEntry.hasProfile = true
        }
        // 让后续同批次直接命中
        params.existingNames.set(key, resolvedEntry)
        continue
      }
    }

    const createdRow = await db.novelPromotionCharacter.create({
      data: {
        novelPromotionProjectId: params.projectInternalId,
        name,
        aliases: JSON.stringify(toStringArray(item.aliases)),
        introduction: asString(item.introduction) || null,
        profileData: JSON.stringify(profileData),
        profileConfirmed: false,
      },
      select: {
        id: true,
        name: true,
      },
    })

    params.existingNames.set(key, { id: createdRow.id, hasProfile: true })
    created.push(createdRow)
  }

  return created
}

export async function persistAnalyzedLocations(params: {
  projectInternalId: string
  existingNames: Set<string>
  analyzedLocations: Record<string, unknown>[]
  db?: LocationCreateDb
}) {
  const created: Array<{ id: string; name: string }> = []
  const invalidKeywords = ['幻想', '抽象', '无明确', '空间锚点', '未说明', '不明确']
  const db = params.db ?? prisma

  for (const item of params.analyzedLocations) {
    const name = asString(item.name).trim()
    if (!name) continue

    const descriptions = toStringArray(item.descriptions)
    const mergedDescriptions = descriptions.length > 0
      ? descriptions
      : (asString(item.description) ? [asString(item.description)] : [])

    const firstDescription = mergedDescriptions[0] || ''
    const isInvalid = invalidKeywords.some((keyword) =>
      name.includes(keyword) || firstDescription.includes(keyword),
    )
    if (isInvalid) continue

    const key = name.toLowerCase()
    if (params.existingNames.has(key)) continue

    const location = await db.novelPromotionLocation.create({
      data: {
        novelPromotionProjectId: params.projectInternalId,
        name,
        summary: asString(item.summary) || null,
      },
      select: {
        id: true,
        name: true,
      },
    })

    const cleanDescriptions = mergedDescriptions.map((desc) => removeLocationPromptSuffix(desc || ''))
    const availableSlots = normalizeLocationAvailableSlots(item.available_slots)
    await seedProjectLocationBackedImageSlots({
      locationId: location.id,
      descriptions: cleanDescriptions,
      fallbackDescription: asString(item.summary) || name,
      availableSlots,
      locationImageModel: db.locationImage,
    })

    params.existingNames.add(key)
    created.push(location)
  }

  return created
}

export async function persistAnalyzedProps(params: {
  projectInternalId: string
  existingNames: Set<string>
  analyzedProps: Record<string, unknown>[]
  db?: LocationCreateDb
}) {
  const created: Array<{ id: string; name: string }> = []
  const db = params.db ?? prisma

  for (const item of params.analyzedProps) {
    const name = asString(item.name).trim()
    const summary = asString(item.summary).trim()
    const description = resolvePropVisualDescription({
      name,
      summary,
      description: asString(item.description).trim(),
    })
    if (!name || !summary || !description) continue

    const key = name.toLowerCase()
    if (params.existingNames.has(key)) continue

    const prop = await db.novelPromotionLocation.create({
      data: {
        novelPromotionProjectId: params.projectInternalId,
        name,
        summary,
        assetKind: 'prop',
      },
      select: {
        id: true,
        name: true,
      },
    })
    await seedProjectLocationBackedImageSlots({
      locationId: prop.id,
      descriptions: [description],
      fallbackDescription: description,
      availableSlots: [],
      locationImageModel: db.locationImage,
    })

    params.existingNames.add(key)
    created.push(prop)
  }

  return created
}

export async function persistClips(params: {
  episodeId: string
  clipList: StoryToScriptClipCandidate[]
  db?: ClipPersistDb
}) {
  const db = params.db ?? prisma
  const clipModel = db.novelPromotionClip as unknown as {
    update: (args: { where: { id: string }; data: Record<string, unknown>; select: { id: true } }) => Promise<{ id: string }>
    create: (args: { data: Record<string, unknown>; select: { id: true } }) => Promise<{ id: string }>
    findMany: typeof db.novelPromotionClip.findMany
    deleteMany: typeof db.novelPromotionClip.deleteMany
  }
  const existing = await clipModel.findMany({
    where: { episodeId: params.episodeId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  const createdClips: Array<{ id: string; clipKey: string }> = []
  for (let index = 0; index < params.clipList.length; index += 1) {
    const clip = params.clipList[index]
    const target = existing[index]
    if (target) {
      const updated = await clipModel.update({
        where: { id: target.id },
        data: {
          startText: clip.startText,
          endText: clip.endText,
          summary: clip.summary,
          location: clip.location,
          characters: clip.characters.length > 0 ? JSON.stringify(clip.characters) : null,
          props: clip.props.length > 0 ? JSON.stringify(clip.props) : null,
          content: clip.content,
        },
        select: {
          id: true,
        },
      })
      createdClips.push({ id: updated.id, clipKey: clip.id })
      continue
    }

    const created = await clipModel.create({
      data: {
        episodeId: params.episodeId,
        startText: clip.startText,
        endText: clip.endText,
        summary: clip.summary,
        location: clip.location,
        characters: clip.characters.length > 0 ? JSON.stringify(clip.characters) : null,
        props: clip.props.length > 0 ? JSON.stringify(clip.props) : null,
        content: clip.content,
      },
      select: {
        id: true,
      },
    })
    createdClips.push({ id: created.id, clipKey: clip.id })
  }

  const staleClipIds = existing.slice(params.clipList.length).map((item) => item.id)
  if (staleClipIds.length > 0) {
    await clipModel.deleteMany({
      where: {
        id: {
          in: staleClipIds,
        },
      },
    })
  }

  return createdClips
}
