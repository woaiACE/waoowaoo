/**
 * IP 角色模式 — 结构化剧本段落解析器
 *
 * 接收 LLM 输出的 JSON 结构化剧本，解析并持久化为 IpScreenplaySegment 记录。
 */

import { prisma } from '@/lib/prisma'
import type { IpSegmentType, EmotionTag } from '../types'

export interface RawSegmentFromLLM {
  type: IpSegmentType
  content: string
  characterId?: string
  emotion?: EmotionTag
  emotionIntensity?: number
  stageDirection?: string
}

const VALID_SEGMENT_TYPES = new Set<string>([
  'scene_desc', 'dialogue', 'action', 'narration', 'transition',
])

const VALID_EMOTIONS = new Set<string>([
  'neutral', 'happy', 'sad', 'angry', 'fearful', 'surprised', 'disgusted',
])

/**
 * 验证并清洗 LLM 返回的段落数据
 */
export function validateSegment(raw: unknown): RawSegmentFromLLM | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  const type = typeof obj.type === 'string' ? obj.type : ''
  if (!VALID_SEGMENT_TYPES.has(type)) return null

  const content = typeof obj.content === 'string' ? obj.content.trim() : ''
  if (!content) return null

  const result: RawSegmentFromLLM = {
    type: type as IpSegmentType,
    content,
  }

  if (typeof obj.characterId === 'string' && obj.characterId.trim()) {
    result.characterId = obj.characterId.trim()
  }

  if (typeof obj.emotion === 'string' && VALID_EMOTIONS.has(obj.emotion)) {
    result.emotion = obj.emotion as EmotionTag
  }

  if (typeof obj.emotionIntensity === 'number' && obj.emotionIntensity >= 0 && obj.emotionIntensity <= 1) {
    result.emotionIntensity = obj.emotionIntensity
  }

  if (typeof obj.stageDirection === 'string' && obj.stageDirection.trim()) {
    result.stageDirection = obj.stageDirection.trim()
  }

  return result
}

/**
 * 解析 LLM 输出的 JSON 数组为有效段落列表
 */
export function parseLLMSegments(jsonText: string): RawSegmentFromLLM[] {
  // 尝试提取 JSON 数组（LLM 可能包裹在 markdown code block 中）
  let cleanText = jsonText.trim()
  const codeBlockMatch = /```(?:json)?\s*\n?([\s\S]*?)\n?```/.exec(cleanText)
  if (codeBlockMatch) {
    cleanText = codeBlockMatch[1].trim()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(cleanText)
  } catch {
    throw new Error('Failed to parse LLM output as JSON')
  }

  if (!Array.isArray(parsed)) {
    throw new Error('LLM output is not a JSON array')
  }

  const segments: RawSegmentFromLLM[] = []
  for (const item of parsed) {
    const validated = validateSegment(item)
    if (validated) {
      segments.push(validated)
    }
  }

  return segments
}

/**
 * 将解析后的段落持久化到 IpScreenplaySegment 表
 * 先删除该 clip 的旧段落，再批量写入
 */
export async function persistSegments(params: {
  projectId: string
  episodeId?: string | null
  clipId: string
  segments: RawSegmentFromLLM[]
  castingMap: Record<string, string>
}) {
  const { projectId, episodeId, clipId, segments, castingMap } = params

  // 删除旧数据
  await prisma.ipScreenplaySegment.deleteMany({
    where: { projectId, clipId },
  })

  // 批量创建
  const createData = segments.map((seg, index) => {
    const ipCastingId = seg.characterId ? (castingMap[seg.characterId] ?? null) : null

    return {
      projectId,
      episodeId: episodeId ?? null,
      clipId,
      segmentIndex: index,
      segmentType: seg.type,
      content: seg.content,
      ipCharacterId: seg.characterId ?? null,
      ipCastingId,
      emotionTag: seg.emotion ?? null,
      emotionIntensity: seg.emotionIntensity ?? null,
      stageDirection: seg.stageDirection ?? null,
    }
  })

  await prisma.ipScreenplaySegment.createMany({ data: createData })

  return { count: createData.length }
}

/**
 * 获取指定 clip 的结构化剧本段落
 */
export async function getSegmentsByClip(projectId: string, clipId: string) {
  return prisma.ipScreenplaySegment.findMany({
    where: { projectId, clipId },
    include: {
      ipCharacter: { select: { id: true, name: true } },
    },
    orderBy: { segmentIndex: 'asc' },
  })
}
