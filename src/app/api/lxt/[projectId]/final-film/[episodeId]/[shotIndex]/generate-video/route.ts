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
 * 视频 provider 接入开关：worker handler 与 provider 接入完成后置为 true，
 * 解开下方的任务提交通路。当前基础版尚未接入真实 provider，直接返回 501。
 */
const FINAL_FILM_VIDEO_PROVIDER_READY = false

/**
 * POST /api/lxt/[projectId]/final-film/[episodeId]/[shotIndex]/generate-video
 *
 * 为指定分镜行提交视频生成任务（异步 BullMQ）。
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
  const videoPrompt = (row?.videoPrompt || '').trim()
  if (!videoPrompt) {
    throw new ApiError('INVALID_PARAMS', { message: '请先填写视频提示词再生成视频' })
  }
  if (!row?.imageUrl) {
    throw new ApiError('INVALID_PARAMS', { message: '请先生成或选择首帧图片' })
  }

  if (!FINAL_FILM_VIDEO_PROVIDER_READY) {
    // provider 尚未接入，显式 501，避免产生一个必然失败的真实任务。
    return NextResponse.json(
      {
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'LXT 成片视频生成尚未接入真实 provider，等待后续里程碑实现',
        },
      },
      { status: 501 },
    )
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const locale = resolveRequiredTaskLocale(request, body)

  const targetId = buildFinalFilmTargetId(episodeId, shotIndex)
  const payload = {
    episodeId,
    shotIndex,
    videoPrompt,
    firstFrameUrl: row.imageUrl,
    lastFrameUrl: row.videoEndFrameUrl || null,
    displayMode: 'detail' as const,
  }

  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    type: TASK_TYPE.LXT_FINAL_FILM_VIDEO,
    targetType: FINAL_FILM_TARGET_TYPE,
    targetId,
    payload,
    dedupeKey: `${TASK_TYPE.LXT_FINAL_FILM_VIDEO}:${targetId}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.LXT_FINAL_FILM_VIDEO, payload),
  })

  return NextResponse.json(result)
})
