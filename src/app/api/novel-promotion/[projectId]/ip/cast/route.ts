/**
 * 项目 IP 选角 API
 * GET  /api/novel-promotion/[projectId]/ip/cast   获取当前选角列表
 * POST /api/novel-promotion/[projectId]/ip/cast   添加选角
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { createIpCasting, listIpCastings } from '@/lib/ip-mode/ip-asset/casting-service'

type Params = { projectId: string }

export const GET = apiHandler(async (_request: NextRequest, ctx: { params: Promise<Params> }) => {
  const { projectId } = await ctx.params

  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const novelData = authResult.novelData as { id: string }
  const castings = await listIpCastings(novelData.id)

  return NextResponse.json({ castings })
})

export const POST = apiHandler(async (request: NextRequest, ctx: { params: Promise<Params> }) => {
  const { projectId } = await ctx.params

  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const novelData = authResult.novelData as { id: string }
  const body = await request.json() as Record<string, unknown>

  const ipCharacterId = typeof body.ipCharacterId === 'string' ? body.ipCharacterId : ''
  if (!ipCharacterId) {
    return NextResponse.json({ error: 'ipCharacterId is required' }, { status: 400 })
  }

  const casting = await createIpCasting({
    projectId: novelData.id,
    ipCharacterId,
    ipVariantId: typeof body.ipVariantId === 'string' ? body.ipVariantId : null,
    castRole: typeof body.castRole === 'string' ? body.castRole : null,
    personalityOverride: typeof body.personalityOverride === 'string' ? body.personalityOverride : null,
    speakingStyleOverride: typeof body.speakingStyleOverride === 'string' ? body.speakingStyleOverride : null,
  })

  return NextResponse.json({ casting }, { status: 201 })
})
