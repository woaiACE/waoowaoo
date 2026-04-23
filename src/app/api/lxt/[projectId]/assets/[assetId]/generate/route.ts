import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'

/**
 * POST /api/lxt/[projectId]/assets/[assetId]/generate
 * LXT 资产 AI 图像生成 — 异步 BullMQ 任务 (image queue)
 *
 * 完成后 handler 自动写回 LxtProjectAsset.imageUrl
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

  // 验证资产属于该项目
  const asset = await prisma.lxtProjectAsset.findFirst({
    where: {
      id: assetId,
      lxtProject: { projectId },
    },
    select: { id: true, kind: true, description: true, summary: true },
  })
  if (!asset) {
    throw new ApiError('NOT_FOUND')
  }

  // 必须有描述才能生成图
  if (!asset.description?.trim() && !asset.summary?.trim()) {
    throw new ApiError('INVALID_PARAMS', { message: '请先生成形象描述再生成图像' })
  }

  const locale = resolveRequiredTaskLocale(request, body)

  const count = typeof body.count === 'number' ? Math.min(Math.max(1, Math.round(body.count)), 4) : 1
  const artStyle = typeof body.artStyle === 'string' && body.artStyle.trim() ? body.artStyle.trim() : undefined

  if (count === 1) {
    const payload = {
      assetId,
      kind: asset.kind,
      displayMode: 'detail' as const,
      ...(artStyle ? { artStyle } : {}),
    }

    const result = await submitTask({
      userId: session.user.id,
      locale,
      requestId: getRequestId(request),
      projectId,
      type: TASK_TYPE.LXT_ASSET_IMAGE,
      targetType: 'LxtProjectAsset',
      targetId: assetId,
      payload,
      dedupeKey: `${TASK_TYPE.LXT_ASSET_IMAGE}:${assetId}`,
      billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.LXT_ASSET_IMAGE, payload),
    })

    return NextResponse.json({ ...result, count: 1 })
  }

  // Multi-image: submit count tasks with different slot indices
  const taskResults = await Promise.all(
    Array.from({ length: count }, async (_, slotIndex) => {
      const payload = {
        assetId,
        kind: asset.kind,
        displayMode: 'detail' as const,
        slotIndex,
        totalSlots: count,
        ...(artStyle ? { artStyle } : {}),
      }
      return submitTask({
        userId: session.user.id,
        locale,
        requestId: getRequestId(request),
        projectId,
        type: TASK_TYPE.LXT_ASSET_IMAGE,
        targetType: 'LxtProjectAsset',
        targetId: assetId,
        payload,
        // Use timestamp to prevent deduplication between slots
        dedupeKey: `${TASK_TYPE.LXT_ASSET_IMAGE}:${assetId}:s${slotIndex}:${Date.now()}`,
        billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.LXT_ASSET_IMAGE, payload),
      })
    })
  )

  return NextResponse.json({ tasks: taskResults, count })
})
