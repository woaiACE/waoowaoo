import { logInfo as _ulogInfo } from '@/lib/logging/core'

export interface VoiceDesignInput {
  voicePrompt: string
  previewText: string
  preferredName?: string
  language?: 'zh' | 'en'
}

export interface VoiceDesignResult {
  success: boolean
  voiceId?: string
  audioBase64?: string
  error?: string
}

function resolveMinimaxEndpoint(baseUrl: string | undefined, path: string): string {
  const base = (baseUrl || 'https://api.vectorengine.ai').replace(/\/+$/, '')
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}

export async function createMinimaxVoiceDesign(
  input: VoiceDesignInput,
  apiKey: string,
  baseUrl?: string,
): Promise<VoiceDesignResult> {
  if (!apiKey) {
    return {
      success: false,
      error: '请配置 Minimax API Key',
    }
  }

  const endpoint = resolveMinimaxEndpoint(baseUrl, '/minimax/v1/voice_design')
  const voiceIdPrefix = input.preferredName || 'custom_voice'
  const uniqueVoiceId = `${voiceIdPrefix}_${Math.random().toString(36).substring(2, 9)}`

  const requestBody = {
    prompt: input.voicePrompt,
    preview_text: input.previewText,
    voice_id: uniqueVoiceId,
    aigc_watermark: false,
  }

  _ulogInfo(`[Minimax] Sending voice design request to ${endpoint}`)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      let errorText = response.statusText
      try {
        const errJson = await response.json()
        errorText = errJson.base_resp?.status_msg || errJson.message || JSON.stringify(errJson)
      } catch {
        errorText = await response.text()
      }
      return {
        success: false,
        error: `Minimax Voice Design 失败 (${response.status}): ${errorText}`,
      }
    }

    const json = await response.json()
    if (json.base_resp?.status_code !== 0 && json.base_resp?.status_code !== undefined) {
      return {
        success: false,
        error: `Minimax Voice Design 失败: ${json.base_resp.status_msg}`,
      }
    }

    // audio stream is returned as hex string in the data array, according to standard Minimax format,
    // though the VectorEngine wrapper might return it similarly. Let's decode it.
    let audioBase64: string | undefined

    if (json.data && Array.isArray(json.data) && json.data.length > 0) {
      const audioHex = json.data[0].audio
      if (typeof audioHex === 'string' && audioHex) {
        audioBase64 = Buffer.from(audioHex, 'hex').toString('base64')
      }
    } else if (json.data && typeof json.data.audio === 'string') {
        const audioHex = json.data.audio
        audioBase64 = Buffer.from(audioHex, 'hex').toString('base64')
    }

    return {
      success: true,
      voiceId: uniqueVoiceId,
      audioBase64,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: `Minimax Voice Design 异常: ${message}`,
    }
  }
}
