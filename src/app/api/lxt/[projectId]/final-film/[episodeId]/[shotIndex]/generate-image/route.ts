import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import {
  FINAL_FILM_TARGET_TYPE,
  buildFinalFilmTargetId,
  parseFinalFilmContent,
} from '@/lib/lxt/final-film'

/**
 * POST /api/lxt/[projectId]/final-film/[episodeId]/[shotIndex]/generate-image
 *
 * 为指定分镜行提交图片生成任务（异步 BullMQ）。
 * targetType: lxt_final_film_panel
 * targetId:  `${episodeId}:${shotIndex}`
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string; shotIndex: string }> },
) => {
  const { projectId, episodeId, shotIndex: shotIndexStr } = await context.params
  const shotIndex = Number(shotIndexStr)
  if (!Number.isFinite(shotIndex)) throw new ApiError('INVALID_PARAMS', { message: 'shotIndex invalid' })

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const episode = await prisma.lxtEpisode.findFirst({
    where: { id: episodeId, lxtProject: { projectId } },
    select: { id: true, finalFilmContent: true },
  })
  if (!episode) throw new ApiError('NOT_FOUND')

  const content = parseFinalFilmContent(episode.finalFilmContent)
  const row = content.rows.find((r) => r.shotIndex === shotIndex)
  const imagePrompt = (row?.imagePrompt || '').trim()
  if (!imagePrompt) {
    throw new ApiError('INVALID_PARAMS', { message: '请先填写图片提示词再生成图像' })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const locale = resolveRequiredTaskLocale(request, body)

  const targetId = buildFinalFilmTargetId(episodeId, shotIndex)
  const payload = {
    episodeId,
    shotIndex,
    imagePrompt,
    bindings: row?.bindings || null,
    gridPromptPrefix: content.gridPromptPrefix,
    videoRatio: content.videoRatio,
    artStyle: content.artStyle,
    displayMode: 'detail' as const,
  }

  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    type: TASK_TYPE.LXT_FINAL_FILM_IMAGE,
    targetType: FINAL_FILM_TARGET_TYPE,
    targetId,
    payload,
    dedupeKey: `${TASK_TYPE.LXT_FINAL_FILM_IMAGE}:${targetId}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.LXT_FINAL_FILM_IMAGE, payload),
  })

  return NextResponse.json(result)
})
