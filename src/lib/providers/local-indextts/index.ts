import { createHash } from 'node:crypto'
import type { VoiceDesignInput, VoiceDesignResult } from '@/lib/providers/bailian/voice-design'

/**
 * 本地 IndexTTS2 HTTP API 提供者
 *
 * 需要先在本地启动 IndexTTS2 API 服务器:
 *   .\start-tts.ps1 -Mode api
 *
 * 环境变量:
 *   INDEXTTS_ENDPOINT  — API 服务器地址，默认 http://localhost:7861
 */

function getEndpoint(override?: string): string {
  const raw = override?.trim() || (process.env.INDEXTTS_ENDPOINT ?? 'http://localhost:7861')
  const normalized = raw.replace(/\/$/, '')
  return normalized.endsWith('/v1') ? normalized.slice(0, -3) : normalized
}

function getWavDurationFromBuffer(buffer: Buffer): number {
  try {
    const riff = buffer.slice(0, 4).toString('ascii')
    if (riff !== 'RIFF') return Math.round((buffer.length * 8) / 128)

    const byteRate = buffer.readUInt32LE(28)
    let offset = 12
    let dataSize = 0
    while (offset < buffer.length - 8) {
      const chunkId = buffer.slice(offset, offset + 4).toString('ascii')
      const chunkSize = buffer.readUInt32LE(offset + 4)
      if (chunkId === 'data') { dataSize = chunkSize; break }
      offset += 8 + chunkSize
    }
    if (dataSize > 0 && byteRate > 0) return Math.round((dataSize / byteRate) * 1000)
    return Math.round((buffer.length * 8) / 128)
  } catch {
    return Math.round((buffer.length * 8) / 128)
  }
}

/**
 * 调用本地 IndexTTS2 API 合成语音
 *
 * @param text            要合成的文本
 * @param referenceAudioUrl  参考音频 URL（支持 http URL 或 data: URI）
 *                           服务器将自动下载或解析 base64
 * @returns audioData + audioDuration(ms)
 */
export async function synthesizeWithLocalIndexTTS(params: {
  text: string
  referenceAudioUrl?: string
  voiceToken?: string
  endpoint?: string
}): Promise<{ audioData: Buffer; audioDuration: number }> {
  const endpoint = getEndpoint(params.endpoint)

  let voice: string
  if (typeof params.voiceToken === 'string' && params.voiceToken.trim()) {
    voice = params.voiceToken.trim()
  } else if (typeof params.referenceAudioUrl === 'string' && params.referenceAudioUrl.trim()) {
    const referenceAudioUrl = params.referenceAudioUrl.trim()
    if (referenceAudioUrl.startsWith('http://') || referenceAudioUrl.startsWith('https://')) {
      voice = referenceAudioUrl
    } else {
      const refRes = await fetch(referenceAudioUrl)
      if (!refRes.ok) {
        throw new Error(`无法下载参考音频: ${refRes.status} ${referenceAudioUrl}`)
      }
      const refBytes = Buffer.from(await refRes.arrayBuffer())
      voice = refBytes.toString('base64')
    }
  } else {
    throw new Error('LOCAL_INDEXTTS_VOICE_REQUIRED')
  }

  const response = await fetch(`${endpoint}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'indextts',
      input: params.text,
      voice,
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`LOCAL_INDEXTTS_FAILED(${response.status}): ${errText}`)
  }

  const audioData = Buffer.from(await response.arrayBuffer())
  return {
    audioData,
    audioDuration: getWavDurationFromBuffer(audioData),
  }
}

export async function createLocalVoiceDesign(
  input: VoiceDesignInput,
  endpoint?: string,
): Promise<VoiceDesignResult> {
  try {
    const generated = await synthesizeWithLocalIndexTTS({
      text: input.previewText,
      voiceToken: input.voicePrompt || input.preferredName || 'default',
      endpoint,
    })
    const voiceId = `local_${createHash('sha1')
      .update(`${input.preferredName || 'voice'}:${input.voicePrompt}:${input.previewText}`)
      .digest('hex')
      .slice(0, 12)}`

    return {
      success: true,
      voiceId,
      targetModel: 'local-indextts',
      audioBase64: generated.audioData.toString('base64'),
      sampleRate: 24000,
      responseFormat: 'wav',
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'LOCAL_VOICE_DESIGN_FAILED',
    }
  }
}
