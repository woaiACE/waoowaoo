/**
 * 项目 IP 选角 API
 * GET  /api/novel-promotion/[projectId]/ip/cast   获取当前选角列表
 * POST /api/novel-promotion/[projectId]/ip/cast   添加选角
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { createIpCasting, listIpCastings } from '@/lib/ip-mode/ip-asset/casting-service'
import { getSignedUrl } from '@/lib/storage'

type Params = { projectId: string }

export const GET = apiHandler(async (_request: NextRequest, ctx: { params: Promise<Params> }) => {
  const { projectId } = await ctx.params

  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const novelData = authResult.novelData as { id: string }
  const rawCastings = await listIpCastings(novelData.id)

  // 序列化为前端 IpCastingSummary 格式
  const castings = rawCastings.map((c) => {
    const char = c.globalCharacter
    // 优先用 faceReferenceUrl，回退到指定形态的 imageUrl
    const appearance = c.appearanceIndex != null
      ? char.appearances.find((a) => a.appearanceIndex === c.appearanceIndex)
      : char.appearances[0]
    const faceReferenceUrl = char.faceReferenceUrl ?? appearance?.imageUrl ?? null
    return {
      id: c.id,
      globalCharacterId: c.globalCharacterId,
      characterName: char.name,
      roleLabel: c.castRole,
      appearanceIndex: c.appearanceIndex,
      faceReferenceUrl: faceReferenceUrl ? getSignedUrl(faceReferenceUrl) : null,
    }
  })

  return NextResponse.json({ castings })
})

export const POST = apiHandler(async (request: NextRequest, ctx: { params: Promise<Params> }) => {
  const { projectId } = await ctx.params

  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const novelData = authResult.novelData as { id: string }
  const body = await request.json() as Record<string, unknown>

  const globalCharacterId = typeof body.globalCharacterId === 'string' ? body.globalCharacterId : ''
  if (!globalCharacterId) {
    return NextResponse.json({ error: 'globalCharacterId is required' }, { status: 400 })
  }

  const casting = await createIpCasting({
    projectId: novelData.id,
    globalCharacterId,
    appearanceIndex: typeof body.appearanceIndex === 'number' ? body.appearanceIndex : null,
    castRole: typeof body.castRole === 'string' ? body.castRole : null,
    personalityOverride: typeof body.personalityOverride === 'string' ? body.personalityOverride : null,
    speakingStyleOverride: typeof body.speakingStyleOverride === 'string' ? body.speakingStyleOverride : null,
  })

  return NextResponse.json({ casting }, { status: 201 })
})
