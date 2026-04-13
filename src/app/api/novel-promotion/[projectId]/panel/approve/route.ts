import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * PATCH /api/novel-promotion/[projectId]/panel/approve
 * 批量审核通过 Panel 图片（imageApproved = true）
 * Body: { panelIds: string[] }  — 指定 Panel 列表
 *   OR: { storyboardId: string } — 批准某分镜下全部 Panel
 */
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const approvedAt = new Date()

  if (Array.isArray(body.panelIds) && body.panelIds.length > 0) {
    const panelIds = body.panelIds as string[]

    // 验证这些 panel 确实属于当前项目
    const count = await prisma.novelPromotionPanel.count({
      where: {
        id: { in: panelIds },
        storyboard: { episode: { novelPromotionProject: { id: projectId } } },
      },
    })
    if (count !== panelIds.length) {
      throw new ApiError('FORBIDDEN')
    }

    await prisma.novelPromotionPanel.updateMany({
      where: { id: { in: panelIds } },
      data: { imageApproved: true, imageApprovedAt: approvedAt },
    })

    return NextResponse.json({ updated: panelIds.length })
  }

  if (typeof body.storyboardId === 'string') {
    // 批准某分镜下所有有图片的 Panel
    const storyboard = await prisma.novelPromotionStoryboard.findFirst({
      where: {
        id: body.storyboardId,
        episode: { novelPromotionProject: { id: projectId } },
      },
    })
    if (!storyboard) throw new ApiError('FORBIDDEN')

    const result = await prisma.novelPromotionPanel.updateMany({
      where: {
        storyboardId: body.storyboardId,
        imageUrl: { not: null },
      },
      data: { imageApproved: true, imageApprovedAt: approvedAt },
    })

    return NextResponse.json({ updated: result.count })
  }

  throw new ApiError('INVALID_PARAMS', { message: 'panelIds[] or storyboardId required' })
})

/**
 * DELETE /api/novel-promotion/[projectId]/panel/approve
 * 撤销审核（imageApproved = false），用于重新生成后重置状态
 * Body: { panelIds: string[] }
 */
export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  if (!Array.isArray(body.panelIds) || body.panelIds.length === 0) {
    throw new ApiError('INVALID_PARAMS', { message: 'panelIds[] required' })
  }

  const panelIds = body.panelIds as string[]

  const count = await prisma.novelPromotionPanel.count({
    where: {
      id: { in: panelIds },
      storyboard: { episode: { novelPromotionProject: { id: projectId } } },
    },
  })
  if (count !== panelIds.length) throw new ApiError('FORBIDDEN')

  await prisma.novelPromotionPanel.updateMany({
    where: { id: { in: panelIds } },
    data: { imageApproved: false, imageApprovedAt: null },
  })

  return NextResponse.json({ updated: panelIds.length })
})
