import { logInfo as _ulogInfo } from '@/lib/logging/core'

/**
 * qwen-voice-design 支持的结构化参数（嵌入 voice_prompt 中的 JSON 块）
 *
 * 格式：[标签名称]{...参数JSON...}
 * 示例：[角色音色]{"timbre":"温暖厚重的女中音","pitch_base":"200","speed_ratio":"0.9"}
 *
 * 参数说明：
 * - timbre          : 音色主体描述（自然语言，如「温暖厚重的女中音，带鼻腔共鸣」）
 * - tone_color      : 频谱特征描述（如「低频丰富，中频温暖，高频柔和不刺耳」）
 * - pitch_base      : 基准音调（Hz）。女声参考：165-255，男声参考：85-180
 * - pitch_range     : 音调变化范围，格式 "min-max"（如 "180-260"）
 * - speed_ratio     : 语速比例，0.5~2.0，1.0 为正常速度（如 "0.9" 偏慢）
 * - stability       : 声音稳定性，0~1，越高越稳定（如 "0.85"）
 * - emotion_intensity: 情绪表达强度，0~1（如 "0.6"）
 * - identity_lock   : 是否锁定声纹（"true"/"false"），锁定后 TTS 一致性更强
 * - seed            : 随机种子，固定种子可复现相同声音（如 "4521"）
 *
 * LLM 推理提示词示例（供 lxt-asset-voice-design 任务使用）：
 *   [角色音色]{
 *     "timbre": "温暖厚重的女中音，带有明显的鼻腔共鸣，声音沉稳慈爱，语速中等偏慢",
 *     "tone_color": "低频丰富，中频温暖，高频柔和不刺耳，整体听感如厚实的绒布",
 *     "pitch_base": "220",
 *     "pitch_range": "180-260",
 *     "speed_ratio": "0.9",
 *     "stability": "0.85",
 *     "emotion_intensity": "0.6",
 *     "identity_lock": "true",
 *     "seed": "4521"
 *   }
 */
export interface VoiceDesignStructuredParams {
  timbre?: string
  tone_color?: string
  pitch_base?: string
  pitch_range?: string
  speed_ratio?: string
  stability?: string
  emotion_intensity?: string
  identity_lock?: string
  seed?: string
  body_scale?: string  // 体型规模提示词（从音调推导，用于图像生成前缀）
}

/**
 * 将结构化参数序列化为 voice_prompt 的 JSON 块格式
 * @param label 标签名称，如 "角色音色"
 * @param params 结构化参数
 * @param naturalLanguagePrefix 自然语言前缀（可选）
 */
export function serializeVoicePromptWithParams(
  label: string,
  params: VoiceDesignStructuredParams,
  naturalLanguagePrefix?: string,
): string {
  const jsonBlock = `[${label}]${JSON.stringify(params)}`
  return naturalLanguagePrefix ? `${naturalLanguagePrefix}\n${jsonBlock}` : jsonBlock
}

export interface VoiceDesignInput {
  voicePrompt: string
  previewText: string
  preferredName?: string
  language?: 'zh' | 'en'
}

export interface VoiceDesignResult {
  success: boolean
  voiceId?: string
  targetModel?: string
  audioBase64?: string
  sampleRate?: number
  responseFormat?: string
  usageCount?: number
  requestId?: string
  error?: string
  errorCode?: string
}

export async function createVoiceDesign(
  input: VoiceDesignInput,
  apiKey: string,
): Promise<VoiceDesignResult> {
  if (!apiKey) {
    return {
      success: false,
      error: '请配置阿里百炼 API Key',
    }
  }

  const requestBody = {
    model: 'qwen-voice-design',
    input: {
      action: 'create',
      target_model: 'qwen3-tts-vd-2026-01-26',
      voice_prompt: input.voicePrompt,
      preview_text: input.previewText,
      preferred_name: input.preferredName || 'custom_voice',
      language: input.language || 'zh',
    },
    parameters: {
      sample_rate: 24000,
      response_format: 'wav',
    },
  }

  _ulogInfo('[VoiceDesign] 请求体:', JSON.stringify(requestBody, null, 2))

  try {
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    const data = await response.json() as {
      output?: {
        voice?: string
        target_model?: string
        preview_audio?: {
          data?: string
          sample_rate?: number
          response_format?: string
        }
      }
      usage?: { count?: number }
      request_id?: string
      code?: string
      message?: string
    }

    if (response.ok && data.output) {
      return {
        success: true,
        voiceId: data.output.voice,
        targetModel: data.output.target_model,
        audioBase64: data.output.preview_audio?.data,
        sampleRate: data.output.preview_audio?.sample_rate,
        responseFormat: data.output.preview_audio?.response_format,
        usageCount: data.usage?.count,
        requestId: data.request_id,
      }
    }

    return {
      success: false,
      error: data.message || '声音设计 API 调用失败',
      errorCode: data.code,
      requestId: data.request_id,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '网络请求失败'
    return {
      success: false,
      error: message || '网络请求失败',
    }
  }
}

export function validateVoicePrompt(voicePrompt: string): { valid: boolean; error?: string } {
  if (!voicePrompt || voicePrompt.trim().length === 0) {
    return { valid: false, error: '声音提示词不能为空' }
  }
  if (voicePrompt.length > 500) {
    return { valid: false, error: '声音提示词不能超过500个字符' }
  }
  return { valid: true }
}

export function validatePreviewText(previewText: string): { valid: boolean; error?: string } {
  if (!previewText || previewText.trim().length === 0) {
    return { valid: false, error: '预览文本不能为空' }
  }
  if (previewText.length < 5) {
    return { valid: false, error: '预览文本至少需要5个字符' }
  }
  if (previewText.length > 200) {
    return { valid: false, error: '预览文本不能超过200个字符' }
  }
  return { valid: true }
}
