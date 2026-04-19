import { NextRequest } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { TASK_TYPE } from '@/lib/task/types'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'

/**
 * POST /api/lxt/[projectId]/assets/analyze
 * LXT 资产 LLM 分析增强 — SSE 流式任务
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json().catch(() => ({}))

  const lxtProject = await prisma.lxtProject.findUnique({
    where: { projectId },
    select: {
      id: true,
      episodes: {
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { id: true, novelText: true, shotListContent: true },
      },
    },
  })

  const episode = lxtProject?.episodes[0]
  const hasContent =
    episode?.shotListContent?.trim() || episode?.novelText?.trim()

  if (!lxtProject || !hasContent) {
    throw new ApiError('INVALID_PARAMS', {
      message: '请先生成分镜脚本（或填写故事原文）再执行 LLM 资产分析',
    })
  }

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId,
    type: TASK_TYPE.LXT_ANALYZE_ASSETS,
    targetType: 'LxtProject',
    targetId: lxtProject.id,
    routePath: `/api/lxt/${projectId}/assets/analyze`,
    body: {
      ...body,
      displayMode: 'detail',
    },
    dedupeKey: `${TASK_TYPE.LXT_ANALYZE_ASSETS}:${lxtProject.id}`,
  })
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
