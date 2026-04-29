import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { getUserModelConfig, parseModelKey } from '@/lib/config-service'
import { findBuiltinCapabilities } from '@/lib/model-capabilities/catalog'
import {
  FINAL_FILM_TARGET_TYPE,
  buildFinalFilmTargetId,
  parseFinalFilmContent,
} from '@/lib/lxt/final-film'

/**
 * POST /api/lxt/[projectId]/final-film/[episodeId]/[shotIndex]/generate-video
 *
 * 为指定分镜行提交视频生成任务（异步 BullMQ），使用 Seedance 2.0。
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

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const locale = resolveRequiredTaskLocale(request, body)

  // 视频模型：请求体显式指定 > 用户偏好 > Seedance 2.0
  const bodyModel = typeof body.videoModel === 'string' && body.videoModel.trim()
    ? body.videoModel.trim()
    : null
  const userModels = await getUserModelConfig(session.user.id)
  const resolvedVideoModel =
    bodyModel
    || userModels.videoModel
    || 'doubao-seedance-2-0-260128'

  const hasEndFrame = !!row.videoEndFrameUrl

  // 根据模型能力自动选择生成模式：仅当模型支持 firstlastframe 且有尾帧时才用
  const parsed = parseModelKey(resolvedVideoModel)
  const caps = parsed ? findBuiltinCapabilities('video', parsed.provider, parsed.modelId) : undefined
  const modelSupportFirstLastFrame = caps?.video?.firstlastframe === true
  const generationMode = (modelSupportFirstLastFrame && hasEndFrame) ? 'firstlastframe' : 'normal'

  const targetId = buildFinalFilmTargetId(episodeId, shotIndex)
  const payload = {
    episodeId,
    shotIndex,
    videoPrompt,
    videoModel: resolvedVideoModel,
    firstFrameUrl: row.splitImageUrls?.[0] ?? row.imageUrl,
    lastFrameUrl: row.videoEndFrameUrl || null,
    generationMode,
    displayMode: 'detail' as const,
    bindings: row.bindings || null,
    videoRatio: content.videoRatio || null,
    artStyle: content.artStyle || null,
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
    dedupeKey: `${TASK_TYPE.LXT_FINAL_FILM_VIDEO}:${targetId}:${resolvedVideoModel}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.LXT_FINAL_FILM_VIDEO, payload),
  })

  return NextResponse.json({ ...result, generationMode })
})
