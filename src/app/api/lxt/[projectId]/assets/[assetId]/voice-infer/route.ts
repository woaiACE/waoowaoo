import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'

/**
 * POST /api/lxt/[projectId]/assets/[assetId]/voice-infer
 * LXT 资产 AI 音色推理 — 提交 BullMQ 文本任务，LLM 根据角色档案推理 voicePrompt
 *
 * 任务完成后 result 中携带:
 *   { voicePrompt: string, params: VoiceDesignStructuredParams }
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; assetId: string }> },
) => {
  const { projectId, assetId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  // 验证资产属于该项目，且为角色类型
  const asset = await prisma.lxtProjectAsset.findFirst({
    where: {
      id: assetId,
      lxtProject: { projectId },
    },
    select: { id: true, kind: true },
  })
  if (!asset) {
    throw new ApiError('NOT_FOUND')
  }
  if (asset.kind !== 'character') {
    throw new ApiError('INVALID_PARAMS', { message: '只有角色资产支持 AI 音色推理' })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const locale = resolveRequiredTaskLocale(request, body)

  const payload = {
    assetId,
    displayMode: 'detail' as const,
  }

  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    type: TASK_TYPE.LXT_ASSET_VOICE_PROMPT_INFER,
    targetType: 'LxtProjectAsset',
    targetId: assetId,
    payload,
    dedupeKey: `${TASK_TYPE.LXT_ASSET_VOICE_PROMPT_INFER}:${assetId}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.LXT_ASSET_VOICE_PROMPT_INFER, payload),
  })

  return NextResponse.json(result)
})
