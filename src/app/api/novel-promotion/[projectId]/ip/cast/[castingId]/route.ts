/**
 * 项目 IP 选角 - 单个操作
 * PATCH  /api/novel-promotion/[projectId]/ip/cast/[castingId]   更新选角
 * DELETE /api/novel-promotion/[projectId]/ip/cast/[castingId]   移除选角
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { updateIpCasting, deleteIpCasting, getIpCasting } from '@/lib/ip-mode/ip-asset/casting-service'

type Params = { projectId: string; castingId: string }

export const PATCH = apiHandler(async (request: NextRequest, ctx: { params: Promise<Params> }) => {
  const { projectId, castingId } = await ctx.params

  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  // 验证 casting 归属
  const existing = await getIpCasting(castingId)
  const novelData = authResult.novelData as { id: string }
  if (!existing || existing.projectId !== novelData.id) {
    return NextResponse.json({ error: 'Casting not found' }, { status: 404 })
  }

  const body = await request.json() as Record<string, unknown>
  const data: Record<string, unknown> = {}
  const allowed = [
    'appearanceIndex', 'castRole', 'personalityOverride',
    'speakingStyleOverride', 'projectCharacterId',
  ]
  for (const field of allowed) {
    if (field in body) {
      data[field] = body[field] ?? null
    }
  }

  const updated = await updateIpCasting(castingId, data as Parameters<typeof updateIpCasting>[1])

  return NextResponse.json({ casting: updated })
})

export const DELETE = apiHandler(async (_request: NextRequest, ctx: { params: Promise<Params> }) => {
  const { projectId, castingId } = await ctx.params

  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const existing = await getIpCasting(castingId)
  const novelData = authResult.novelData as { id: string }
  if (!existing || existing.projectId !== novelData.id) {
    return NextResponse.json({ error: 'Casting not found' }, { status: 404 })
  }

  await deleteIpCasting(castingId)

  return NextResponse.json({ success: true })
})
