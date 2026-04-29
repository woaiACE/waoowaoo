import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import type { TaskJobData } from '@/lib/task/types'
import { TASK_TYPE } from '@/lib/task/types'
import { submitTask } from '@/lib/task/submitter'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'
import { getProjectModelConfig } from '@/lib/config-service'
import {
  applyRowPatch,
  FINAL_FILM_TARGET_TYPE,
  buildFinalFilmTargetId,
  parseFinalFilmContent,
  serializeFinalFilmContent,
} from '@/lib/lxt/final-film'
import { scoreCriticResponse, isPassing } from '@/lib/lxt/quality-scorer'

const MAX_RETRY = 2
const PASS_THRESHOLD = 0.7

type Payload = Record<string, unknown>

function readString(payload: Payload, key: string): string {
  const v = payload[key]
  return typeof v === 'string' ? v.trim() : ''
}

function readNumber(payload: Payload, key: string): number {
  const v = payload[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

async function mergeReviewResult(
  episodeId: string,
  shotIndex: number,
  reviewResult: Record<string, unknown>,
) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.lxtEpisode.findUnique({
      where: { id: episodeId },
      select: { finalFilmContent: true },
    })
    const content = parseFinalFilmContent(current?.finalFilmContent)
    const next = applyRowPatch(content, shotIndex, {
      reviewResult: reviewResult as Record<string, unknown> as never,
    })
    await tx.lxtEpisode.update({
      where: { id: episodeId },
      data: { finalFilmContent: serializeFinalFilmContent(next) },
    })
  })
}

export async function handleLxtShotReviewTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Payload
  const userId = job.data.userId

  const episodeId = readString(payload, 'episodeId')
  const shotIndex = readNumber(payload, 'shotIndex')
  const videoUrl = readString(payload, 'videoUrl')
  const videoPrompt = readString(payload, 'videoPrompt')
  const retryCount = readNumber(payload, 'retryCount')

  if (!episodeId || shotIndex === null || !videoPrompt) {
    throw new Error('lxt_shot_review: episodeId, shotIndex, and videoPrompt are required')
  }

  const episode = await prisma.lxtEpisode.findUnique({
    where: { id: episodeId },
    select: { id: true, finalFilmContent: true, lxtProject: { select: { projectId: true } } },
  })
  if (!episode) throw new Error(`Episode ${episodeId} not found`)

  const content = parseFinalFilmContent(episode.finalFilmContent)
  const row = content.rows.find((r) => r.shotIndex === shotIndex)
  if (!row) throw new Error(`Shot index ${shotIndex} not found`)

  const projectId = episode.lxtProject.projectId
  const projectModels = await getProjectModelConfig(projectId, userId)
  const analysisModel = projectModels.analysisModel
  if (!analysisModel) throw new Error('Analysis model not configured')

  // 1. Run Critic agent
  await reportTaskProgress(job, 20, {
    stage: 'lxt_shot_review_critic',
    stageLabel: retryCount > 0 ? `质量评审中…（第${retryCount + 1}次）` : '质量评审中…',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_shot_review_critic')

  const criticPrompt = buildPrompt({
    promptId: PROMPT_IDS.LXT_SHOT_CRITIC,
    locale: job.data.locale,
    variables: {
      video_prompt: videoPrompt,
      shot_type: row.shotType || '',
    },
  })

  const criticCompletion = await executeAiTextStep({
    userId,
    model: analysisModel,
    messages: [{ role: 'user', content: criticPrompt }],
    reasoning: true,
    projectId,
    action: 'lxt_shot_review_critic',
    meta: {
      stepId: 'lxt_shot_review_critic',
      stepTitle: 'Critic评审',
      stepIndex: 1,
      stepTotal: 2,
    },
  })

  const criticText = criticCompletion.text
  if (!criticText) throw new Error('Critic agent returned empty response')

  const criticResult = scoreCriticResponse(criticText)
  if (!criticResult) throw new Error('Failed to parse critic response')

  const passing = isPassing(criticResult.scores, PASS_THRESHOLD)

  await reportTaskProgress(job, 50, {
    stage: 'lxt_shot_review_result',
    stageLabel: passing
      ? `评审通过（${criticResult.scores.overall.toFixed(2)}）`
      : `评审未通过（${criticResult.scores.overall.toFixed(2)}），触发修复…`,
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_shot_review_result')

  // 2. Write pass result
  if (passing) {
    await mergeReviewResult(episodeId, shotIndex, {
      status: 'pass',
      scores: criticResult.scores,
      retryCount,
      reviewedAt: new Date().toISOString(),
    })
    return {
      success: true,
      episodeId,
      shotIndex,
      status: 'pass',
      scores: criticResult.scores,
    }
  }

  // 3. Exhausted retries → mark failed
  if (retryCount >= MAX_RETRY) {
    await mergeReviewResult(episodeId, shotIndex, {
      status: 'failed',
      scores: criticResult.scores,
      retryCount,
      reviewedAt: new Date().toISOString(),
    })
    return {
      success: false,
      episodeId,
      shotIndex,
      status: 'failed',
      scores: criticResult.scores,
    }
  }

  // 4. Run Repair agent
  await reportTaskProgress(job, 60, {
    stage: 'lxt_shot_review_repair',
    stageLabel: '修复提示词中…',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_shot_review_repair')

  const repairPrompt = buildPrompt({
    promptId: PROMPT_IDS.LXT_SHOT_REPAIR,
    locale: job.data.locale,
    variables: {
      video_prompt: videoPrompt,
      weaknesses: criticResult.weaknesses.join('；'),
      repair_advice: criticResult.repairAdvice,
      shot_type: row.shotType || '',
    },
  })

  const repairCompletion = await executeAiTextStep({
    userId,
    model: analysisModel,
    messages: [{ role: 'user', content: repairPrompt }],
    reasoning: true,
    projectId,
    action: 'lxt_shot_review_repair',
    meta: {
      stepId: 'lxt_shot_review_repair',
      stepTitle: '修复提示词',
      stepIndex: 2,
      stepTotal: 2,
    },
  })

  const repairedPrompt = repairCompletion.text
  if (!repairedPrompt) throw new Error('Repair agent returned empty response')

  // 5. Write repairing status
  await mergeReviewResult(episodeId, shotIndex, {
    status: 'repairing',
    scores: criticResult.scores,
    retryCount,
    reviewedAt: new Date().toISOString(),
  })

  // 6. Update videoPrompt for re-generation
  await prisma.$transaction(async (tx) => {
    const current = await tx.lxtEpisode.findUnique({
      where: { id: episodeId },
      select: { finalFilmContent: true },
    })
    const currentContent = parseFinalFilmContent(current?.finalFilmContent)
    const next = applyRowPatch(currentContent, shotIndex, {
      videoPrompt: repairedPrompt,
    })
    await tx.lxtEpisode.update({
      where: { id: episodeId },
      data: { finalFilmContent: serializeFinalFilmContent(next) },
    })
  })

  // 7. Submit re-generation task
  await reportTaskProgress(job, 85, {
    stage: 'lxt_shot_review_resubmit',
    stageLabel: '提交重新生成…',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_shot_review_resubmit')

  const hasEndFrame = !!row.videoEndFrameUrl
  const generationMode = hasEndFrame ? 'firstlastframe' : 'normal'
  const targetId = buildFinalFilmTargetId(episodeId, shotIndex)

  await submitTask({
    userId,
    locale: job.data.locale,
    projectId,
    type: TASK_TYPE.LXT_FINAL_FILM_VIDEO,
    targetType: FINAL_FILM_TARGET_TYPE,
    targetId,
    payload: {
      episodeId,
      shotIndex,
      videoPrompt: repairedPrompt,
      videoModel: readString(payload, 'videoModel') || undefined,
      firstFrameUrl: (row.splitImageUrls?.[0] || row.imageUrl || ''),
      lastFrameUrl: row.videoEndFrameUrl || null,
      generationMode,
      displayMode: 'detail' as const,
      bindings: row.bindings || null,
      videoRatio: content.videoRatio || null,
      artStyle: content.artStyle || null,
      retryCount: retryCount + 1,
    },
    dedupeKey: `lxt_shot_review:${targetId}:${retryCount + 1}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.LXT_FINAL_FILM_VIDEO, {}),
  })

  return {
    success: true,
    episodeId,
    shotIndex,
    status: 'repairing',
    repairedPrompt: repairedPrompt.slice(0, 200),
    scores: criticResult.scores,
  }
}
