import { logInfo as _ulogInfo } from '@/lib/logging/core'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface MinimaxTTSInput {
  text: string
  voiceId: string
  modelId?: string
  emotion?: string | null
  speed?: number
  pitch?: number
  vol?: number
}

export interface MinimaxTTSResult {
  success: boolean
  audioData?: Buffer
  error?: string
}

function resolveMinimaxEndpoint(baseUrl: string | undefined, path: string): string {
  const base = (baseUrl || 'https://api.vectorengine.ai').replace(/\/+$/, '')
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}

export interface MinimaxBaseResponse {
  base_resp?: {
    status_code?: number
    status_msg?: string
  }
  task_id?: string
  status?: string | number
  task_status?: string | number
  file_id?: string
  audio?: string
  file_url?: string
  data?: {
    audio?: string
    file_id?: string
  } | Array<{ audio?: string }>
}

function decodeMinimaxAudio(json: MinimaxBaseResponse): Buffer | null {
  try {
    if (json.data && !Array.isArray(json.data) && json.data.audio && typeof json.data.audio === 'string') {
      const isHex = /^[0-9a-fA-F]+$/.test(json.data.audio)
      return isHex ? Buffer.from(json.data.audio, 'hex') : Buffer.from(json.data.audio, 'base64')
    } else if (json.audio && typeof json.audio === 'string') {
      const isHex = /^[0-9a-fA-F]+$/.test(json.audio)
      return isHex ? Buffer.from(json.audio, 'hex') : Buffer.from(json.audio, 'base64')
    }
    return null
  } catch {
    return null
  }
}

async function synthesizeSync(
  input: MinimaxTTSInput,
  apiKey: string,
  baseUrl?: string,
): Promise<MinimaxTTSResult> {
  const endpoint = resolveMinimaxEndpoint(baseUrl, '/minimax/v1/t2a_v2')

  const requestBody = {
    model: input.modelId || 'speech-2.6-turbo',
    text: input.text,
    voice_setting: {
      voice_id: input.voiceId,
      speed: input.speed ?? 1.0,
      vol: input.vol ?? 1.0,
      pitch: input.pitch ?? 0,
      ...(input.emotion ? { emotion: input.emotion } : {}),
    },
  }

  _ulogInfo(`[Minimax] Sending sync TTS request to ${endpoint}`)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Minimax Sync TTS 失败 (${response.status}): ${errorText}`)
  }

  const json = (await response.json()) as MinimaxBaseResponse
  if (json.base_resp?.status_code !== 0 && json.base_resp?.status_code !== undefined) {
    throw new Error(`Minimax Sync TTS 失败: ${json.base_resp.status_msg}`)
  }

  const audioData = decodeMinimaxAudio(json)
  if (!audioData) {
    throw new Error('Minimax Sync TTS 返回了无效的音频数据')
  }

  return { success: true, audioData }
}

async function synthesizeAsync(
  input: MinimaxTTSInput,
  apiKey: string,
  baseUrl?: string,
): Promise<MinimaxTTSResult> {
  const submitEndpoint = resolveMinimaxEndpoint(baseUrl, '/minimax/v1/t2a_async_v2')
  const queryEndpoint = resolveMinimaxEndpoint(baseUrl, '/minimax/v1/query/speech_task_v2')

  const requestBody = {
    model: input.modelId || 'speech-2.6-turbo',
    text: input.text,
    voice_setting: {
      voice_id: input.voiceId,
      speed: input.speed ?? 1.0,
      vol: input.vol ?? 1.0,
      pitch: input.pitch ?? 0,
      ...(input.emotion ? { emotion: input.emotion } : {}),
    },
  }

  _ulogInfo(`[Minimax] Sending async TTS request to ${submitEndpoint}`)
  const submitResponse = await fetch(submitEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text()
    throw new Error(`Minimax Async TTS 失败 (${submitResponse.status}): ${errorText}`)
  }

  const submitJson = (await submitResponse.json()) as MinimaxBaseResponse
  if (submitJson.base_resp?.status_code !== 0 && submitJson.base_resp?.status_code !== undefined) {
    throw new Error(`Minimax Async TTS 失败: ${submitJson.base_resp.status_msg}`)
  }

  const taskId = submitJson.task_id
  if (!taskId) {
    throw new Error('Minimax Async TTS 没有返回 task_id')
  }

  _ulogInfo(`[Minimax] Task ID received: ${taskId}. Starting to poll...`)

  // Polling loop
  const maxRetries = 60 // 2 minutes max with 2s interval
  let retries = 0

  while (retries < maxRetries) {
    await delay(2000)
    retries++

    const queryUrl = `${queryEndpoint}?task_id=${taskId}`
    const queryResponse = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!queryResponse.ok) {
      const errorText = await queryResponse.text()
      throw new Error(`Minimax Async Query 失败 (${queryResponse.status}): ${errorText}`)
    }

    const queryJson = (await queryResponse.json()) as MinimaxBaseResponse
    if (queryJson.base_resp?.status_code !== 0 && queryJson.base_resp?.status_code !== undefined) {
      throw new Error(`Minimax Async Query 失败: ${queryJson.base_resp.status_msg}`)
    }

    const status = queryJson.status || queryJson.task_status
    if (status === 'Success' || status === 2) { // Allow string or integer status depending on API variant
      const fileId = queryJson.file_id || (queryJson.data && !Array.isArray(queryJson.data) && queryJson.data.file_id)

      if (fileId) {
          // fetch actual file using Minimax download logic or standard URL?
          // Based on Minimax docs, t2a_async_v2 usually returns the audio via `file_id`.
          // We need to fetch the file contents.
          const downloadEndpoint = resolveMinimaxEndpoint(baseUrl, `/minimax/v1/file?file_id=${fileId}`)
          const fileResponse = await fetch(downloadEndpoint, {
              headers: { Authorization: `Bearer ${apiKey}` },
          })
          if (!fileResponse.ok) {
              throw new Error(`Minimax Async Download 失败 (${fileResponse.status}): ${await fileResponse.text()}`)
          }
          const arrayBuffer = await fileResponse.arrayBuffer()
          return { success: true, audioData: Buffer.from(arrayBuffer) }
      } else if (queryJson.audio || (queryJson.data && !Array.isArray(queryJson.data) && queryJson.data.audio)) {
          // If it directly returns the hex string
          const audioData = decodeMinimaxAudio(queryJson)
          if (audioData) return { success: true, audioData }

          throw new Error('Minimax Async TTS query returned invalid audio payload')
      } else if (queryJson.file_url) {
          // If a download URL is provided
          const fileResponse = await fetch(queryJson.file_url)
          if (!fileResponse.ok) {
              throw new Error(`Minimax Async Download 失败 (${fileResponse.status}): ${await fileResponse.text()}`)
          }
          const arrayBuffer = await fileResponse.arrayBuffer()
          return { success: true, audioData: Buffer.from(arrayBuffer) }
      }

      throw new Error('Minimax Async TTS succeeded but no audio payload was found')
    } else if (status === 'Fail' || status === 3) {
      throw new Error('Minimax Async TTS 任务执行失败')
    }
    // Else status is Processing, continue polling
  }

  throw new Error('Minimax Async TTS 超时')
}

export async function synthesizeWithMinimaxTTS(
  input: MinimaxTTSInput,
  apiKey: string,
  baseUrl?: string,
): Promise<MinimaxTTSResult> {
  const text = (input.text || '').trim()
  if (!apiKey.trim()) {
    return { success: false, error: 'Minimax_API_KEY_REQUIRED' }
  }
  if (!text) {
    return { success: false, error: 'Minimax_TTS_TEXT_REQUIRED' }
  }
  if (!input.voiceId) {
    return { success: false, error: 'Minimax_TTS_VOICE_ID_REQUIRED' }
  }

  try {
    if (text.length < 300) {
      return await synthesizeSync(input, apiKey, baseUrl)
    } else {
      return await synthesizeAsync(input, apiKey, baseUrl)
    }
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Minimax_TTS_UNKNOWN_ERROR',
    }
  }
}
