import { prisma } from '@/lib/prisma'
import { removeLocationPromptSuffix } from '@/lib/constants'
import {
  isInvalidLocation,
  readText,
  toStringArray,
  type AnalyzeGlobalCharactersData,
  type AnalyzeGlobalLocationsData,
  type AnalyzeGlobalPropsData,
  type CharacterBrief,
  type CharacterRelationItem,
} from './analyze-global-parse'
import { resolveCharacterByEmbedding, type EmbedConfig, type CharacterIndexEntry } from '@/lib/embedding/character-index'
import type { VectorEntry } from '@/lib/embedding/cosine'
import { seedProjectLocationBackedImageSlots } from '@/lib/assets/services/location-backed-assets'
import { normalizeLocationAvailableSlots } from '@/lib/location-available-slots'
import { resolvePropVisualDescription } from '@/lib/assets/prop-description'

export type AnalyzeGlobalStats = {
  totalChunks: number
  processedChunks: number
  newCharacters: number
  updatedCharacters: number
  newLocations: number
  newProps: number
  skippedCharacters: number
  skippedLocations: number
  skippedProps: number
}

export function createAnalyzeGlobalStats(totalChunks: number): AnalyzeGlobalStats {
  return {
    totalChunks,
    processedChunks: 0,
    newCharacters: 0,
    updatedCharacters: 0,
    newLocations: 0,
    newProps: 0,
    skippedCharacters: 0,
    skippedLocations: 0,
    skippedProps: 0,
  }
}

export async function persistAnalyzeGlobalChunk(params: {
  projectInternalId: string
  charactersData: AnalyzeGlobalCharactersData
  locationsData: AnalyzeGlobalLocationsData
  propsData: AnalyzeGlobalPropsData
  existingCharacters: CharacterBrief[]
  existingCharacterNames: string[]
  existingLocationNames: string[]
  existingLocationInfo: string[]
  existingPropNames: string[]
  stats: AnalyzeGlobalStats
  /** embedding 配置；null 表示未配置，降级到纯字符串匹配 */
  embedConfig?: EmbedConfig | null
  /** 已构建的角色向量索引（任务入口处一次性构建后传入） */
  characterEmbeddingIndex?: VectorEntry<CharacterIndexEntry>[]
}) {
  for (const char of params.charactersData.new_characters || []) {
    const name = readText(char.name).trim()
    const aliases = toStringArray(char.aliases)
    if (!name) continue

    const nameExists = params.existingCharacterNames.some((item) => item.toLowerCase() === name.toLowerCase())
    const aliasExists = aliases.some((alias) =>
      params.existingCharacterNames.some((item) => item.toLowerCase() === alias.toLowerCase()),
    )
    if (nameExists || aliasExists) {
      params.stats.skippedCharacters += 1
      // 顺便把本次新 alias 合并到已有角色，让后续 chunk 字符串匹配命中率更高
      if (params.embedConfig && aliases.length > 0) {
        // 按名称或别名交集定位已有角色（aliasExists 命中时 name 未必相等）
        const existingChar = params.existingCharacters.find((c) => {
          if (c.name.toLowerCase() === name.toLowerCase()) return true
          if (aliases.some((a) => c.name.toLowerCase() === a.toLowerCase())) return true
          if (c.aliases.some((ea) => ea.toLowerCase() === name.toLowerCase())) return true
          return c.aliases.some((ea) => aliases.some((a) => ea.toLowerCase() === a.toLowerCase()))
        })
        if (existingChar) {
          const newAliases = aliases.filter(
            (a) => !existingChar.aliases.some((ea) => ea.toLowerCase() === a.toLowerCase()),
          )
          if (newAliases.length > 0) {
            await prisma.novelPromotionCharacter.update({
              where: { id: existingChar.id },
              data: { aliases: JSON.stringify([...existingChar.aliases, ...newAliases]) },
            })
            existingChar.aliases.push(...newAliases)
            params.existingCharacterNames.push(...newAliases)
          }
        }
      }
      continue
    }

    // 第二道防线：字符串未命中时走 embedding 语义向量兜底
    const embedConfig = params.embedConfig ?? null
    const embeddingIndex = params.characterEmbeddingIndex ?? []
    if (embedConfig && embeddingIndex.length > 0) {
      const introduction = readText(char.introduction).trim()
      const candidateText = introduction
        ? `${name}，${aliases.join('/')}。${introduction.slice(0, 200)}`
        : `${name}，${aliases.join('/')}`

      const resolved = await resolveCharacterByEmbedding(candidateText, embeddingIndex, embedConfig, 0.82)
      if (resolved) {
        // 语义命中 → 不创建新记录，把当前名字/alias 并入已有角色
        params.stats.skippedCharacters += 1
        const mergeAliases = [name, ...aliases].filter(
          (a) =>
            !resolved.aliases.some((ea) => ea.toLowerCase() === a.toLowerCase()) &&
            a.toLowerCase() !== resolved.name.toLowerCase(),
        )
        if (mergeAliases.length > 0) {
          await prisma.novelPromotionCharacter.update({
            where: { id: resolved.id },
            data: { aliases: JSON.stringify([...resolved.aliases, ...mergeAliases]) },
          })
          resolved.aliases.push(...mergeAliases)
          params.existingCharacterNames.push(...mergeAliases)
        }
        continue
      }
    }

    try {
      const profileData = {
        role_level: char.role_level,
        archetype: char.archetype,
        personality_tags: toStringArray(char.personality_tags),
        era_period: char.era_period,
        social_class: char.social_class,
        occupation: char.occupation,
        costume_tier: char.costume_tier,
        suggested_colors: toStringArray(char.suggested_colors),
        primary_identifier: char.primary_identifier,
        visual_keywords: toStringArray(char.visual_keywords),
        gender: char.gender,
        age_range: char.age_range,
      }

      const created = await prisma.novelPromotionCharacter.create({
        data: {
          novelPromotionProjectId: params.projectInternalId,
          name,
          aliases: JSON.stringify(aliases),
          introduction: readText(char.introduction),
          profileData: JSON.stringify(profileData),
          profileConfirmed: false,
        },
        select: {
          id: true,
        },
      })

      params.existingCharacters.push({
        id: created.id,
        name,
        aliases,
        introduction: readText(char.introduction),
      })
      params.existingCharacterNames.push(name, ...aliases)
      params.stats.newCharacters += 1
    } catch {
      params.stats.skippedCharacters += 1
    }
  }

  for (const update of params.charactersData.updated_characters || []) {
    const targetName = readText(update.name).trim()
    if (!targetName) continue
    const existing = params.existingCharacters.find((item) => item.name.toLowerCase() === targetName.toLowerCase())
    if (!existing) continue

    try {
      const updateData: Record<string, unknown> = {}
      const updatedIntroduction = readText(update.updated_introduction).trim()
      if (updatedIntroduction) {
        updateData.introduction = updatedIntroduction
        existing.introduction = updatedIntroduction
      }

      const updatedAliases = toStringArray(update.updated_aliases)
      if (updatedAliases.length > 0) {
        const newAliases = updatedAliases.filter(
          (item) => !existing.aliases.some((alias) => alias.toLowerCase() === item.toLowerCase()),
        )
        if (newAliases.length > 0) {
          const merged = [...existing.aliases, ...newAliases]
          updateData.aliases = JSON.stringify(merged)
          existing.aliases = merged
          params.existingCharacterNames.push(...newAliases)
        }
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.novelPromotionCharacter.update({
          where: { id: existing.id },
          data: updateData,
        })
        params.stats.updatedCharacters += 1
      }
    } catch {
      // skip failed update
    }
  }

  for (const loc of params.locationsData.locations || []) {
    const name = readText(loc.name).trim()
    const summary = readText(loc.summary)
    if (!name) continue
    if (isInvalidLocation(name, summary)) {
      params.stats.skippedLocations += 1
      continue
    }

    const exists = params.existingLocationNames.some((item) => item.toLowerCase() === name.toLowerCase())
    if (exists) {
      params.stats.skippedLocations += 1
      continue
    }

    try {
      const descriptionsRaw = Array.isArray(loc.descriptions)
        ? (loc.descriptions as unknown[])
        : (readText(loc.description) ? [readText(loc.description)] : [])
      const descriptions = descriptionsRaw.map((item) => readText(item)).filter(Boolean)
      const cleanDescriptions = descriptions.map((item) => removeLocationPromptSuffix(item))
      const availableSlots = normalizeLocationAvailableSlots(loc.available_slots)

      const created = await prisma.novelPromotionLocation.create({
        data: {
          novelPromotionProjectId: params.projectInternalId,
          name,
          summary: summary || null,
        },
        select: {
          id: true,
        },
      })

      await seedProjectLocationBackedImageSlots({
        locationId: created.id,
        descriptions: cleanDescriptions,
        fallbackDescription: summary || name,
        availableSlots,
      })

      params.existingLocationNames.push(name)
      params.existingLocationInfo.push(summary ? `${name}(${summary})` : name)
      params.stats.newLocations += 1
    } catch {
      params.stats.skippedLocations += 1
    }
  }

  for (const prop of params.propsData.props || []) {
    const name = readText(prop.name).trim()
    const summary = readText(prop.summary).trim()
    const description = resolvePropVisualDescription({
      name,
      summary,
      description: readText(prop.description).trim(),
    })
    if (!name || !summary || !description) {
      params.stats.skippedProps += 1
      continue
    }

    const exists = params.existingPropNames.some((item) => item.toLowerCase() === name.toLowerCase())
    if (exists) {
      params.stats.skippedProps += 1
      continue
    }

    try {
      const created = await prisma.novelPromotionLocation.create({
        data: {
          novelPromotionProjectId: params.projectInternalId,
          name,
          summary,
          assetKind: 'prop',
        },
      })
      await seedProjectLocationBackedImageSlots({
        locationId: created.id,
        descriptions: [description],
        fallbackDescription: description,
        availableSlots: [],
      })
      params.existingPropNames.push(name)
      params.stats.newProps += 1
    } catch {
      params.stats.skippedProps += 1
    }
  }
}

export async function upsertCharacterRelations(params: {
  projectInternalId: string
  relationships: CharacterRelationItem[]
  existingCharacterNames: string[]
}) {
  if (!params.relationships || params.relationships.length === 0) return

  const normalizedNameSet = new Set(params.existingCharacterNames.map((name) => name.toLowerCase()))

  for (const rel of params.relationships) {
    const from = readText(rel.from).trim()
    const to = readText(rel.to).trim()
    if (!from || !to || from === to) continue

    // 仅保留在当前项目角色库中存在的关系边，避免孤立关系记录。
    if (!normalizedNameSet.has(from.toLowerCase()) || !normalizedNameSet.has(to.toLowerCase())) {
      continue
    }

    const relationType = readText(rel.type ?? '').trim() || '其他'
    const rawDirection = readText(rel.direction ?? '').trim().toLowerCase()
    const direction = rawDirection === 'bidirectional' ? 'bidirectional' : 'unidirectional'
    const description = readText(rel.description ?? '').trim() || null

    try {
      await prisma.characterRelation.upsert({
        where: {
          novelPromotionProjectId_fromName_toName: {
            novelPromotionProjectId: params.projectInternalId,
            fromName: from,
            toName: to,
          },
        },
        create: {
          novelPromotionProjectId: params.projectInternalId,
          fromName: from,
          toName: to,
          relationType,
          direction,
          description,
        },
        update: {
          relationType,
          direction,
          description,
        },
      })
    } catch {
      // skip failed upsert silently
    }
  }
}
