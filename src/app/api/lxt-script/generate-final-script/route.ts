import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'

/**
 * POST /api/lxt-script/generate-final-script
 * LXT 分镜转制作脚本 — 异步 BullMQ 任务（四阶段并行流水线）
 *
 * 提交任务后立即返回 taskId，前端通过任务轮询获取进度与结果。
 */
export const POST = apiHandler(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}))
  const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : ''
  const episodeId = typeof body?.episodeId === 'string' ? body.episodeId.trim() : ''

  if (!projectId || !episodeId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  // 校验 episode 存在且有分镜内容
  const episode = await prisma.lxtEpisode.findUnique({
    where: { id: episodeId },
    select: { id: true, shotListContent: true },
  })
  if (!episode?.shotListContent?.trim()) {
    throw new ApiError('INVALID_PARAMS')
  }

  const locale = resolveRequiredTaskLocale(request, body)

  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    type: TASK_TYPE.LXT_STORYBOARD_TO_SCRIPT,
    targetType: 'LxtEpisode',
    targetId: episodeId,
    episodeId,
    payload: {
      episodeId,
      model: typeof body.model === 'string' ? body.model : undefined,
      locale,
    },
    dedupeKey: `${TASK_TYPE.LXT_STORYBOARD_TO_SCRIPT}:${episodeId}`,
  })

  return NextResponse.json(result)
})

