/**
 * IP 角色模式 — 核心类型定义
 */

// ==================== IP 角色资产 ====================

export type IpCharacterStatus = 'draft' | 'active' | 'archived'
export type IpSourceType = 'manual' | 'upgraded' | 'ai-generated'

export interface IpCharacterFaceDescriptor {
  /** 面部特征自然语言描述 */
  summary: string
  /** 关键特征标签 */
  tags: string[]
  /** 性别特征 */
  genderPresentation?: string
  /** 年龄估算 */
  estimatedAge?: string
  /** 发色 */
  hairColor?: string
  /** 眼睛颜色 */
  eyeColor?: string
  /** 肤色 */
  skinTone?: string
  /** 其他显著特征 */
  distinctiveFeatures?: string[]
}

export interface IpVoiceEmotionConfig {
  /** 默认情感 */
  defaultEmotion: string
  /** 默认强度 0-1 */
  defaultStrength: number
  /** 情感到 TTS prompt 的映射 */
  emotionPromptMap?: Record<string, string>
}

// ==================== 形态预设 ====================

export interface CreateIpVariantInput {
  variantName: string
  costumeDescription?: string
  hairstyleDescription?: string
  accessoryDescription?: string
  environmentHint?: string
  isDefault?: boolean
}

// ==================== 选角 ====================

export interface CreateIpCastingInput {
  globalCharacterId: string
  appearanceIndex?: number
  castRole?: string
  personalityOverride?: string
  speakingStyleOverride?: string
}

// ==================== 剧本段落 ====================

export type IpSegmentType = 'scene_desc' | 'dialogue' | 'action' | 'narration' | 'transition'

export type EmotionTag = 'neutral' | 'happy' | 'sad' | 'angry' | 'fearful' | 'surprised' | 'disgusted'

export interface IpScreenplaySegmentData {
  segmentType: IpSegmentType
  content: string
  globalCharacterId?: string
  emotionTag?: EmotionTag
  emotionIntensity?: number
  stageDirection?: string
}

// ==================== 情感解析 ====================

export interface EmotionAnnotatedSegment {
  text: string
  emotion: EmotionTag
  intensity: number
  pauseBefore?: number
  emphasis?: string[]
}

// ==================== 特征解耦 ====================

export interface DecomposedPrompt {
  /** 不可变层 (最高优先级, 来自 IP 资产) */
  immutableFeatures: {
    faceDescription: string
    bodyArchetype: string
  }
  /** 可变层 (来自当前剧本 prompt 或 variant 预设) */
  mutableFeatures: {
    costume: string
    hairstyle: string
    accessories: string
    environment: string
  }
  /** 剧本层 (来自当前分镜) */
  sceneContext: {
    action: string
    emotion: string
    cameraAngle: string
    lighting: string
  }
}

// ==================== 参考图集 ====================

export type RefSheetType = 'turnaround' | 'expression' | 'pose' | 'detail'
export type RefSheetStatus = 'pending' | 'generating' | 'completed' | 'failed'
