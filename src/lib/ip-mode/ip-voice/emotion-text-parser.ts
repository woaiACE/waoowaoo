/**
 * IP 角色模式 — 情感文本解析器
 *
 * 将带有情感标记的剧本段落转换为 TTS 可消费的情感注释。
 * 优先使用 IpScreenplaySegment 上已有的 emotionTag，
 * 缺失时可后续扩展调用 LLM 从上下文推断。
 */

import type { EmotionAnnotatedSegment, EmotionTag } from '../types'

const STAGE_DIRECTION_EMOTION_MAP: Record<string, EmotionTag> = {
  '微笑': 'happy',
  '笑': 'happy',
  '大笑': 'happy',
  '哭': 'sad',
  '流泪': 'sad',
  '悲伤': 'sad',
  '愤怒': 'angry',
  '怒': 'angry',
  '咆哮': 'angry',
  '恐惧': 'fearful',
  '害怕': 'fearful',
  '惊讶': 'surprised',
  '震惊': 'surprised',
  '厌恶': 'disgusted',
}

/**
 * 从剧本段落数据解析情感注释
 */
export function parseEmotionFromSegment(params: {
  content: string
  emotionTag?: EmotionTag | string | null
  emotionIntensity?: number | null
  stageDirection?: string | null
}): EmotionAnnotatedSegment {
  let emotion: EmotionTag = 'neutral'
  let intensity = 0.5

  // 优先使用显式标注
  if (params.emotionTag) {
    emotion = params.emotionTag as EmotionTag
    intensity = params.emotionIntensity ?? 0.6
  }
  // 其次从舞台指示中推断
  else if (params.stageDirection) {
    for (const [keyword, mappedEmotion] of Object.entries(STAGE_DIRECTION_EMOTION_MAP)) {
      if (params.stageDirection.includes(keyword)) {
        emotion = mappedEmotion
        intensity = 0.5
        break
      }
    }
  }

  return {
    text: params.content,
    emotion,
    intensity,
  }
}

/**
 * 将情感标签转换为 TTS emotion prompt 字符串
 */
export function emotionTagToPrompt(emotion: EmotionTag, intensity: number): string {
  const intensityWord = intensity > 0.7 ? 'very ' : intensity > 0.4 ? '' : 'slightly '

  const emotionPromptMap: Record<EmotionTag, string> = {
    neutral: 'calm and neutral tone',
    happy: `${intensityWord}happy and cheerful tone`,
    sad: `${intensityWord}sad and melancholic tone`,
    angry: `${intensityWord}angry and forceful tone`,
    fearful: `${intensityWord}fearful and trembling tone`,
    surprised: `${intensityWord}surprised and excited tone`,
    disgusted: `${intensityWord}disgusted and repulsed tone`,
  }

  return emotionPromptMap[emotion] || 'neutral tone'
}
