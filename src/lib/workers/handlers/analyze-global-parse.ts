import { safeParseJsonObject } from '@/lib/json-repair'

export const CHUNK_SIZE = 3000
const INVALID_LOCATION_KEYWORDS = ['幻想', '抽象', '无明确', '空间锚点', '未说明', '不明确']

export type CharacterBrief = {
  id: string
  name: string
  aliases: string[]
  introduction: string
}

export type CharacterRelationItem = {
  from: string
  to: string
  type: string
  direction?: string
  description?: string
}

function normalizeRelationshipItem(item: Record<string, unknown>): CharacterRelationItem | null {
  const from = readText(item.from ?? item.from_name).trim()
  const to = readText(item.to ?? item.to_name).trim()
  const type = readText(item.type ?? item.relation_type).trim()
  const direction = readText(item.direction).trim()
  const description = readText(item.description).trim()

  if (!from || !to) return null
  return {
    from,
    to,
    type: type || '其他',
    direction: direction || 'unidirectional',
    description: description || undefined,
  }
}

export type AnalyzeGlobalCharactersData = {
  new_characters?: Array<Record<string, unknown>>
  updated_characters?: Array<Record<string, unknown>>
  characters?: Array<Record<string, unknown>>
  relationships?: CharacterRelationItem[]
}

export type AnalyzeGlobalLocationsData = {
  locations?: Array<Record<string, unknown>>
}

export type AnalyzeGlobalPropsData = {
  props?: Array<Record<string, unknown>>
}

export function chunkContent(text: string, maxSize = CHUNK_SIZE): string[] {
  const chunks: string[] = []
  const paragraphs = text.split(/\n\n+/)
  let current = ''

  for (const p of paragraphs) {
    if (current.length + p.length + 2 > maxSize) {
      if (current.trim()) chunks.push(current.trim())
      current = p
    } else {
      current += (current ? '\n\n' : '') + p
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

export function parseJsonResponse(responseText: string): Record<string, unknown> {
  return safeParseJsonObject(responseText)
}

export function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => readText(item).trim()).filter(Boolean)
}

export function parseAliases(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return toStringArray(parsed)
  } catch {
    return []
  }
}

export function buildCharactersLibInfo(characters: CharacterBrief[]): string {
  if (characters.length === 0) return '暂无已有角色'
  return characters
    .map((c, i) => {
      const aliasStr = c.aliases.length > 0 ? `别名：${c.aliases.join('、')}` : '别名：无'
      const introStr = c.introduction ? `介绍：${c.introduction}` : '介绍：暂无'
      return `${i + 1}. ${c.name}\n   ${aliasStr}\n   ${introStr}`
    })
    .join('\n\n')
}

export function isInvalidLocation(name: string, summary: string): boolean {
  return INVALID_LOCATION_KEYWORDS.some((keyword) => name.includes(keyword) || summary.includes(keyword))
}

export function safeParseCharactersResponse(responseText: string): AnalyzeGlobalCharactersData {
  try {
    const parsed = parseJsonResponse(responseText) as AnalyzeGlobalCharactersData
    if (!parsed.new_characters && Array.isArray(parsed.characters)) {
      parsed.new_characters = parsed.characters
    }
    const rawRelationships = Array.isArray(parsed.relationships) ? parsed.relationships : []
    parsed.relationships = rawRelationships
      .map((item) => (item && typeof item === 'object' ? normalizeRelationshipItem(item as Record<string, unknown>) : null))
      .filter((item): item is CharacterRelationItem => item !== null)
    return parsed
  } catch {
    return {}
  }
}

export function safeParseLocationsResponse(responseText: string): AnalyzeGlobalLocationsData {
  try {
    return parseJsonResponse(responseText) as AnalyzeGlobalLocationsData
  } catch {
    return {}
  }
}

export function safeParsePropsResponse(responseText: string): AnalyzeGlobalPropsData {
  try {
    return parseJsonResponse(responseText) as AnalyzeGlobalPropsData
  } catch {
    return {}
  }
}
