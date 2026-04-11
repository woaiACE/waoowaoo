/**
 * 本地 IndexTTS2 HTTP API 提供者
 *
 * 需要先在本地启动 IndexTTS2 API 服务器:
 *   .\start-tts.ps1 -Mode api
 *
 * 环境变量:
 *   INDEXTTS_ENDPOINT  — API 服务器地址，默认 http://localhost:7861
 */

function getEndpoint(): string {
  const raw = process.env.INDEXTTS_ENDPOINT ?? 'http://localhost:7861'
  return raw.replace(/\/$/, '')
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
  referenceAudioUrl: string
}): Promise<{ audioData: Buffer; audioDuration: number }> {
  const endpoint = getEndpoint()

  // 如果是 http URL，直接传给服务器；否则下载后转 base64
  let voice: string
  if (params.referenceAudioUrl.startsWith('http://') || params.referenceAudioUrl.startsWith('https://')) {
    voice = params.referenceAudioUrl
  } else {
    // data URI 或本地路径 — 直接传 base64
    const refRes = await fetch(params.referenceAudioUrl)
    if (!refRes.ok) {
      throw new Error(`无法下载参考音频: ${refRes.status} ${params.referenceAudioUrl}`)
    }
    const refBytes = Buffer.from(await refRes.arrayBuffer())
    voice = refBytes.toString('base64')
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
