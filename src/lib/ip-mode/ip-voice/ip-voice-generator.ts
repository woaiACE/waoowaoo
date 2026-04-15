/**
 * IP 角色模式 — IP 语音生成器
 *
 * 在常规 TTS 管线基础上，附加 IP 角色的音色自动匹配和情感参数。
 * 底层复用 src/lib/voice/generate-voice-line.ts，不修改原有代码。
 */

import { prisma } from '@/lib/prisma'
import { parseEmotionFromSegment, emotionTagToPrompt } from './emotion-text-parser'
import type { EmotionTag } from '../types'

export interface IpVoiceLineParams {
  projectId: string
  episodeId: string
  segmentId: string
  audioModel?: string
}

/**
 * 通过 IpScreenplaySegment 获取完整的 IP 语音生成上下文
 */
export async function resolveIpVoiceContext(segmentId: string) {
  const segment = await prisma.ipScreenplaySegment.findUnique({
    where: { id: segmentId },
    include: {
      ipCharacter: true,
      ipCasting: {
        include: { ipCharacter: true },
      },
    },
  })

  if (!segment) throw new Error(`IP screenplay segment not found: ${segmentId}`)

  const ipCharacter = segment.ipCasting?.ipCharacter ?? segment.ipCharacter
  if (!ipCharacter) throw new Error(`No IP character associated with segment: ${segmentId}`)

  // 解析情感
  const emotionData = parseEmotionFromSegment({
    content: segment.content,
    emotionTag: segment.emotionTag as EmotionTag | null,
    emotionIntensity: segment.emotionIntensity,
    stageDirection: segment.stageDirection,
  })

  const emotionPrompt = emotionTagToPrompt(emotionData.emotion, emotionData.intensity)

  return {
    segment,
    ipCharacter,
    voiceId: ipCharacter.voiceId,
    voiceType: ipCharacter.voiceType,
    customVoiceUrl: ipCharacter.customVoiceUrl,
    emotionPrompt,
    emotionStrength: emotionData.intensity,
    text: segment.content,
  }
}
