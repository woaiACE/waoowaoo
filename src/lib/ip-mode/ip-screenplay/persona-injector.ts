/**
 * IP 角色模式 — 人设上下文注入器
 *
 * 将选角的 IP 角色人设数据构建为 LLM prompt 上下文，
 * 供 IP 剧本改写引擎使用。
 */

import { prisma } from '@/lib/prisma'

export interface PersonaContext {
  /** 完整的人设上下文文本 (可直接注入 prompt) */
  personaText: string
  /** 角色 ID 到名称的映射 */
  characterMap: Record<string, string>
  /** 选角数量 */
  castingCount: number
}

/**
 * 收集项目中所有 IP 选角的人设数据，构建注入上下文
 */
export async function buildPersonaContext(projectId: string): Promise<PersonaContext> {
  const castings = await prisma.ipCasting.findMany({
    where: { projectId },
    include: {
      ipCharacter: true,
      ipVariant: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  if (castings.length === 0) {
    return {
      personaText: '',
      characterMap: {},
      castingCount: 0,
    }
  }

  const characterMap: Record<string, string> = {}
  const sections: string[] = []

  for (const casting of castings) {
    const char = casting.ipCharacter
    characterMap[char.id] = char.name

    const personality = casting.personalityOverride ?? char.personality ?? ''
    const speakingStyle = casting.speakingStyleOverride ?? char.speakingStyle ?? ''
    const backstory = char.backstory ?? ''
    const castRole = casting.castRole ?? ''

    const section = [
      `【角色：${char.name}】（IP角色ID: ${char.id}）`,
      castRole ? `- 在本剧中扮演：${castRole}` : '',
      char.gender ? `- 性别：${char.gender}` : '',
      char.ageRange ? `- 年龄段：${char.ageRange}` : '',
      personality ? `- 性格：${personality}` : '',
      backstory ? `- 背景：${backstory}` : '',
      speakingStyle ? `- 说话风格：${speakingStyle}` : '',
    ].filter(Boolean).join('\n')

    sections.push(section)
  }

  return {
    personaText: sections.join('\n\n---\n\n'),
    characterMap,
    castingCount: castings.length,
  }
}

/**
 * 构建角色列表简述 (用于 segment parser prompt)
 */
export function buildCastingListText(characterMap: Record<string, string>): string {
  return Object.entries(characterMap)
    .map(([id, name]) => `- ${name} (ID: ${id})`)
    .join('\n')
}
