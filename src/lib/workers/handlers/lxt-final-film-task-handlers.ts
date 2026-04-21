import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive, getUserModels, toSignedUrlIfCos } from '@/lib/workers/utils'
import { generateCleanImageToStorage } from './image-task-handler-shared'
import type { TaskJobData } from '@/lib/task/types'
import {
  applyRowPatch,
  parseFinalFilmContent,
  serializeFinalFilmContent,
} from '@/lib/lxt/final-film'

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

/**
 * LXT 成片 — 行级图片生成
 *
 * Payload: { episodeId, shotIndex, imagePrompt }
 * 完成后将生成图 URL 写回 finalFilmContent.rows[shotIndex].imageUrl
 */
export async function handleLxtFinalFilmImageTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Payload
  const userId = job.data.userId

  const episodeId = readString(payload, 'episodeId')
  const shotIndex = readNumber(payload, 'shotIndex')
  const imagePrompt = readString(payload, 'imagePrompt')
  if (!episodeId || shotIndex === null || !imagePrompt) {
    throw new Error('lxt_final_film_image: episodeId, shotIndex and imagePrompt are required')
  }

  await reportTaskProgress(job, 10, {
    stage: 'lxt_final_film_image_start',
    stageLabel: '开始生成分镜图像',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_final_film_image_start')

  const userModels = await getUserModels(userId)
  const modelId = userModels.storyboardModel ?? userModels.characterModel ?? null
  if (!modelId) throw new Error('Image model not configured for final-film generation')

  await reportTaskProgress(job, 30, {
    stage: 'lxt_final_film_image_generate',
    stageLabel: '生成图像中…',
    displayMode: 'detail',
  })

  const cosKey = await generateCleanImageToStorage({
    job,
    userId,
    modelId,
    prompt: imagePrompt,
    targetId: `${episodeId}:${shotIndex}`,
    keyPrefix: 'lxt/final-film-images',
  })
  const signedUrl = toSignedUrlIfCos(cosKey, 72 * 3600)

  await reportTaskProgress(job, 90, {
    stage: 'lxt_final_film_image_persist',
    stageLabel: '保存图像',
    displayMode: 'detail',
  })

  await mergeFinalFilmRow(episodeId, shotIndex, { imageUrl: signedUrl })

  return { success: true, episodeId, shotIndex, imageUrl: signedUrl }
}

/**
 * LXT 成片 — 行级视频生成（基础版占位）
 *
 * 当前实现：保留任务状态流转，handler 直接抛出未实现错误。
 * 后续接入真实视频生成 provider 后替换为实际调用。
 */
export async function handleLxtFinalFilmVideoTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Payload
  const episodeId = readString(payload, 'episodeId')
  const shotIndex = readNumber(payload, 'shotIndex')
  if (!episodeId || shotIndex === null) {
    throw new Error('lxt_final_film_video: episodeId, shotIndex required')
  }

  await reportTaskProgress(job, 10, {
    stage: 'lxt_final_film_video_start',
    stageLabel: '提交视频生成（占位）',
    displayMode: 'detail',
  })

  // 基础版：真实 provider 尚未接入，保留状态机但直接失败，便于前端展示 failed 状态
  throw new Error('LXT 成片视频生成尚未接入真实 provider，等待后续里程碑实现')
}
