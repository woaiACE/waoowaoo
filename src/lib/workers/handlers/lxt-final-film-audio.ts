import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive, toSignedUrlIfCos } from '@/lib/workers/utils'
import { processMediaResult } from '@/lib/media-process'
import { getProviderConfig, getProviderKey, resolveModelSelectionOrSingle } from '@/lib/api-config'
import { synthesizeWithBailianTTS } from '@/lib/providers/bailian'
import { synthesizeWithLocalIndexTTS } from '@/lib/providers/local-indextts'
import { parseLxtShots, type LxtShotDialogue } from '@/lib/lxt/parse-shots'
import {
  applyRowPatch,
  parseFinalFilmContent,
  serializeFinalFilmContent,
  type LxtFinalFilmRowBindings,
} from '@/lib/lxt/final-film'
import type { TaskJobData } from '@/lib/task/types'

type Payload = Record<string, unknown>

function readString(payload: Payload, key: string): string {
  const v = payload[key]
  return typeof v === 'string' ? v.trim() : ''
}

function readNumber(payload: Payload, key: string): number | null {
  const v = payload[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

async function mergeFinalFilmRow(
  episodeId: string,
  shotIndex: number,
  patch: Record<string, unknown>,
) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.lxtEpisode.findUnique({
      where: { id: episodeId },
      select: { finalFilmContent: true },
    })
    const content = parseFinalFilmContent(current?.finalFilmContent)
    const next = applyRowPatch(content, shotIndex, patch)
    await tx.lxtEpisode.update({
      where: { id: episodeId },
      data: { finalFilmContent: serializeFinalFilmContent(next) },
    })
  })
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

function matchCharacterByName(name: string, assets: { id: string; name: string; voiceId?: string | null; customVoiceUrl?: string | null }[]) {
  const exact = assets.find((a) => a.name === name)
  if (exact) return exact
  return assets.find((a) => a.name.includes(name) || name.includes(a.name))
}

function resolveDialogueLines(
  shotListContent: string | null | undefined,
  shotIndex: number,
): LxtShotDialogue[] {
  if (!shotListContent) return []
  const shots = parseLxtShots(shotListContent)
  const shot = shots.find((s) => s.index === shotIndex)
  return shot?.json?.dialogue ?? []
}

async function concatenateAudioWithPauses(audioBuffers: Buffer[], pauseMs: number = 300): Promise<Buffer> {
  if (audioBuffers.length === 0) throw new Error('No audio buffers to concatenate')
  if (audioBuffers.length === 1) return audioBuffers[0]

  const SAMPLE_RATE = 16000
  const BYTES_PER_SAMPLE = 2
  const pauseSamples = Math.floor((pauseMs / 1000) * SAMPLE_RATE)
  const pauseBuffer = Buffer.alloc(pauseSamples * BYTES_PER_SAMPLE, 0)

  const dataChunks: Buffer[] = []
  let totalDataSize = 0

  for (let i = 0; i < audioBuffers.length; i++) {
    const buf = audioBuffers[i]
    const dataSize = buf.readUInt32LE(40)
    const dataOffset = 44
    dataChunks.push(buf.slice(dataOffset, dataOffset + dataSize))
    totalDataSize += dataSize

    if (i < audioBuffers.length - 1) {
      dataChunks.push(pauseBuffer)
      totalDataSize += pauseBuffer.length
    }
  }

  const headerSize = 44
  const outputSize = headerSize + totalDataSize
  const output = Buffer.alloc(outputSize)

  output.write('RIFF', 0, 'ascii')
  output.writeUInt32LE(outputSize - 8, 4)
  output.write('WAVE', 8, 'ascii')
  output.write('fmt ', 12, 'ascii')
  output.writeUInt32LE(16, 16)
  output.writeUInt16LE(1, 20)
  output.writeUInt16LE(1, 22)
  output.writeUInt32LE(SAMPLE_RATE, 24)
  output.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28)
  output.writeUInt16LE(BYTES_PER_SAMPLE, 32)
  output.writeUInt16LE(16, 34)
  output.write('data', 36, 'ascii')
  output.writeUInt32LE(totalDataSize, 40)

  let offset = headerSize
  for (const chunk of dataChunks) {
    chunk.copy(output, offset)
    offset += chunk.length
  }

  return output
}

/**
 * LXT 成片 — 行级音频生成任务
 *
 * Payload: { episodeId, shotIndex, videoUrl }
 *
 * 流程：
 * 1. 加载分镜对白（LxtShotJson.dialogue[]）
 * 2. 解析每个 speaker 的音色绑定（角色 voiceId 或旁白 narratorVoiceId）
 * 3. 逐行调用 TTS 合成
 * 4. 拼接音频片段 → 复合 WAV
 * 5. 上传 COS → 写回 finalFilmRow.audioUrl / audioDuration
 */
export async function handleLxtFinalFilmAudioTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Payload
  const userId = job.data.userId
  const projectId = job.data.projectId

  const episodeId = readString(payload, 'episodeId')
  const shotIndex = readNumber(payload, 'shotIndex')
  const videoUrl = readString(payload, 'videoUrl')
  if (!episodeId || shotIndex === null || !videoUrl) {
    throw new Error('lxt_final_film_audio: episodeId, shotIndex and videoUrl are required')
  }

  await reportTaskProgress(job, 5, {
    stage: 'lxt_final_film_audio_load',
    stageLabel: '加载分镜对白',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_final_film_audio_load')

  const episode = await prisma.lxtEpisode.findUnique({
    where: { id: episodeId },
    select: { id: true, finalFilmContent: true, shotListContent: true },
  })
  if (!episode) throw new Error(`Episode ${episodeId} not found`)

  const content = parseFinalFilmContent(episode?.finalFilmContent)
  const row = content.rows.find((r) => r.shotIndex === shotIndex)
  if (!row) throw new Error(`Shot ${shotIndex} not found in episode ${episodeId}`)

  const narratorVoiceId = content.narratorVoiceId ?? null

  const dialogueLines = resolveDialogueLines(episode.shotListContent, shotIndex)

  await reportTaskProgress(job, 12, {
    stage: 'lxt_final_film_audio_resolve',
    stageLabel: '解析音色绑定',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_final_film_audio_resolve')

  const bindings: LxtFinalFilmRowBindings | null = row.bindings ?? null
  const boundCharIds = bindings?.characterAssetIds ?? []

  const characterAssets = await prisma.lxtProjectAsset.findMany({
    where: { id: { in: boundCharIds }, kind: 'character' },
    select: { id: true, name: true, voiceId: true, customVoiceUrl: true },
  })

  const allChars = await prisma.lxtProjectAsset.findMany({
    where: { lxtProject: { projectId }, kind: 'character' },
    select: { id: true, name: true, voiceId: true, customVoiceUrl: true },
  })

  const audioSelection = await resolveModelSelectionOrSingle(userId, null, 'audio')
  const providerKey = getProviderKey(audioSelection.provider).toLowerCase()

  await reportTaskProgress(job, 20, {
    stage: 'lxt_final_film_audio_generate',
    stageLabel: '合成语音中…',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_final_film_audio_generate')

  interface GeneratedClip { buffer: Buffer; duration: number }
  const clips: GeneratedClip[] = []

  for (const line of dialogueLines) {
    const text = (line.text ?? '').trim()
    if (!text) continue

    let voiceId: string | null = null

    if (line.style.includes('旁白') || line.speaker === '旁白') {
      voiceId = narratorVoiceId
    } else {
      const boundChar = matchCharacterByName(line.speaker, characterAssets)
      if (boundChar?.voiceId) {
        voiceId = boundChar.voiceId
      } else {
        const anyChar = matchCharacterByName(line.speaker, allChars)
        if (anyChar?.voiceId) voiceId = anyChar.voiceId
      }
    }

    if (!voiceId) continue

    try {
      let generated: { audioData: Buffer; audioDuration: number }

      if (providerKey === 'local') {
        const localProviderConfig = await getProviderConfig(userId, audioSelection.provider)
        generated = await synthesizeWithLocalIndexTTS({
          text,
          referenceAudioUrl: '',
          endpoint: localProviderConfig.baseUrl,
        })
      } else {
        const { apiKey } = await getProviderConfig(userId, audioSelection.provider)
        const result = await synthesizeWithBailianTTS({
          text,
          voiceId,
          modelId: audioSelection.modelId,
          languageType: 'Chinese',
        }, apiKey)
        if (!result.success || !result.audioData) continue
        generated = {
          audioData: result.audioData,
          audioDuration: result.audioDuration ?? getWavDurationFromBuffer(result.audioData),
        }
      }

      clips.push({ buffer: generated.audioData, duration: generated.audioDuration })
    } catch {
      continue
    }
  }

  // Fallback: narrator reads copyText if no dialogue clips generated
  if (clips.length === 0 && row.copyText?.trim() && narratorVoiceId) {
    const copyText = row.copyText.trim()
    try {
      const { apiKey } = await getProviderConfig(userId, audioSelection.provider)
      const result = await synthesizeWithBailianTTS({
        text: copyText,
        voiceId: narratorVoiceId,
        modelId: audioSelection.modelId,
        languageType: 'Chinese',
      }, apiKey)
      if (result.success && result.audioData) {
        clips.push({
          buffer: result.audioData,
          duration: result.audioDuration ?? getWavDurationFromBuffer(result.audioData),
        })
      }
    } catch {
      // Fallback: skip audio if narrator TTS also fails
    }
  }

  if (clips.length === 0) {
    return {
      success: false,
      message: 'No audio clips generated — ensure narrator voice or character voices are configured',
      episodeId,
      shotIndex,
    }
  }

  await reportTaskProgress(job, 60, {
    stage: 'lxt_final_film_audio_composite',
    stageLabel: '拼接音频片段',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_final_film_audio_composite')

  const buffers = clips.map((c) => c.buffer)
  const compositeAudio = await concatenateAudioWithPauses(buffers, 300)
  const totalDuration = Math.round(clips.reduce((sum, c) => sum + c.duration, 0) + (clips.length - 1) * 0.3)

  await reportTaskProgress(job, 75, {
    stage: 'lxt_final_film_audio_upload',
    stageLabel: '上传音频',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_final_film_audio_upload')

  const targetId = `${episodeId}:${shotIndex}`
  const audioCosKey = await processMediaResult({
    source: compositeAudio,
    type: 'audio',
    keyPrefix: 'lxt/final-film-audio',
    targetId,
  })

  const signedAudioUrl = toSignedUrlIfCos(audioCosKey, 72 * 3600)

  await reportTaskProgress(job, 95, {
    stage: 'lxt_final_film_audio_persist',
    stageLabel: '保存结果',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_final_film_audio_persist')

  await mergeFinalFilmRow(episodeId, shotIndex, {
    audioUrl: signedAudioUrl,
    audioDuration: totalDuration,
  })

  return {
    success: true,
    episodeId,
    shotIndex,
    audioUrl: signedAudioUrl,
    audioDuration: totalDuration,
  }
}
