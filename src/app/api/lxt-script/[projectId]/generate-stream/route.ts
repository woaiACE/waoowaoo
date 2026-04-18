import { NextRequest } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { TASK_TYPE } from '@/lib/task/types'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'

export const runtime = 'nodejs'

/**
 * POST /api/lxt-script/[projectId]/generate-stream
 * LXT 分镜转制作脚本 — SSE 流式端点（与 LLM 观察基础设施集成）
 *
 * 提交 BullMQ 任务并返回 SSE 流，前端通过 useLxtFinalScriptRunStream 订阅进度。
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

  // 校验 episode 存在且有分镜内容
  const episode = await prisma.lxtEpisode.findUnique({
    where: { id: episodeId },
    select: { id: true, shotListContent: true },
  })
  if (!episode?.shotListContent?.trim()) {
    throw new ApiError('INVALID_PARAMS')
  }

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId,
    episodeId,
    type: TASK_TYPE.LXT_STORYBOARD_TO_SCRIPT,
    targetType: 'LxtEpisode',
    targetId: episodeId,
    routePath: `/api/lxt-script/${projectId}/generate-stream`,
    body: {
      ...body,
      displayMode: 'detail',
    },
    dedupeKey: `${TASK_TYPE.LXT_STORYBOARD_TO_SCRIPT}:${episodeId}`,
    priority: 2,
  })
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
