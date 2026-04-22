import { NextRequest } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { TASK_TYPE } from '@/lib/task/types'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'

export const runtime = 'nodejs'

/**
 * POST /api/lxt-script/[projectId]/novel-to-script-stream
 * LXT 小说转剧本 — BullMQ worker 端点
 *
 * 提交 LXT_NOVEL_TO_SCRIPT 任务，前端通过 useLxtNovelToScriptRunStream 订阅进度。
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const body = await request.json().catch(() => ({}))
  const episodeId = typeof body?.episodeId === 'string' ? body.episodeId.trim() : ''

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  // 校验 episode 存在且有小说原文
  const episode = await prisma.lxtEpisode.findUnique({
    where: { id: episodeId },
    select: { id: true, novelText: true },
  })
  if (!episode?.novelText?.trim()) {
    throw new ApiError('INVALID_PARAMS')
  }

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId,
    episodeId,
    type: TASK_TYPE.LXT_NOVEL_TO_SCRIPT,
    targetType: 'LxtEpisode',
    targetId: episodeId,
    routePath: `/api/lxt-script/${projectId}/novel-to-script-stream`,
    body: {
      ...body,
      displayMode: 'detail',
    },
    dedupeKey: `${TASK_TYPE.LXT_NOVEL_TO_SCRIPT}:${episodeId}`,
    priority: 2,
  })
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
