import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * Character Bible Lock API
 *
 * PATCH - 锁定指定 appearance 作为 Character Bible 参考图
 *   Body: { appearanceId: string }
 *   效果：该 appearance bibleLocked=true，同一角色其他 appearance 自动解锁
 *   后续阶段6（分镜图生成）的 collectPanelReferenceImages 会优先使用此锁定形象
 *
 * DELETE - 解锁指定 appearance
 *   Body: { appearanceId: string }
 */

export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { appearanceId } = body

  if (!appearanceId || typeof appearanceId !== 'string') {
    throw new ApiError('INVALID_PARAMS')
  }

  const appearance = await prisma.characterAppearance.findUnique({
    where: { id: appearanceId },
    select: { id: true, characterId: true, appearanceIndex: true, imageUrl: true },
  })

  if (!appearance) {
    throw new ApiError('NOT_FOUND')
  }

  if (!appearance.imageUrl) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 先解锁同一角色的所有 appearance，再锁定目标
  await prisma.$transaction([
    prisma.characterAppearance.updateMany({
      where: { characterId: appearance.characterId, bibleLocked: true },
      data: { bibleLocked: false, bibleLockedAt: null },
    }),
    prisma.characterAppearance.update({
      where: { id: appearanceId },
      data: { bibleLocked: true, bibleLockedAt: new Date() },
    }),
  ])

  return NextResponse.json({
    success: true,
    appearanceId,
    message: '已锁定为 Character Bible 参考图',
  })
})

export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { appearanceId } = body

  if (!appearanceId || typeof appearanceId !== 'string') {
    throw new ApiError('INVALID_PARAMS')
  }

  const appearance = await prisma.characterAppearance.findUnique({
    where: { id: appearanceId },
    select: { id: true },
  })

  if (!appearance) {
    throw new ApiError('NOT_FOUND')
  }

  await prisma.characterAppearance.update({
    where: { id: appearanceId },
    data: { bibleLocked: false, bibleLockedAt: null },
  })

  return NextResponse.json({
    success: true,
    appearanceId,
    message: '已解锁 Character Bible',
  })
})
