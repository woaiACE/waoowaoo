import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { validatePreviewText, validateVoicePrompt } from '@/lib/providers/bailian/voice-design'

/**
 * POST /api/lxt/[projectId]/assets/[assetId]/voice-design
 * LXT 资产 AI 声音设计 — 异步 BullMQ 任务
 *
 * 完成后 handler 自动写回 LxtProjectAsset.voiceId
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; assetId: string }> },
) => {
  const { projectId, assetId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const voicePrompt = typeof body.voicePrompt === 'string' ? body.voicePrompt.trim() : ''
  const previewText = typeof body.previewText === 'string' ? body.previewText.trim() : ''
  const preferredName =
    typeof body.preferredName === 'string' && body.preferredName.trim()
      ? body.preferredName.trim()
      : 'lxt_voice'
  const language = body.language === 'en' ? 'en' : 'zh'

  const promptValidation = validateVoicePrompt(voicePrompt)
  if (!promptValidation.valid) {
    throw new ApiError('INVALID_PARAMS', { message: promptValidation.error ?? '声音描述无效' })
  }
  const textValidation = validatePreviewText(previewText)
  if (!textValidation.valid) {
    throw new ApiError('INVALID_PARAMS', { message: textValidation.error ?? '试听文本无效' })
  }

  // 验证资产属于该项目
  const asset = await prisma.lxtProjectAsset.findFirst({
    where: {
      id: assetId,
      lxtProject: { projectId },
    },
    select: { id: true, name: true, kind: true },
  })
  if (!asset) {
    throw new ApiError('NOT_FOUND')
  }
  if (asset.kind !== 'character') {
    throw new ApiError('INVALID_PARAMS', { message: '只有角色资产支持 AI 声音设计' })
  }

  const locale = resolveRequiredTaskLocale(request, body)

  const digest = createHash('sha1')
    .update(`${assetId}:${voicePrompt}:${previewText}`)
    .digest('hex')
    .slice(0, 16)

  const payload = {
    assetId,
    voicePrompt,
    previewText,
    preferredName: preferredName || asset.name || 'lxt_voice',
    language,
    displayMode: 'detail' as const,
  }

  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId,
    type: TASK_TYPE.LXT_ASSET_VOICE_DESIGN,
    targetType: 'LxtProjectAsset',
    targetId: assetId,
    payload,
    dedupeKey: `${TASK_TYPE.LXT_ASSET_VOICE_DESIGN}:${digest}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.LXT_ASSET_VOICE_DESIGN, payload),
  })

  return NextResponse.json(result)
})
