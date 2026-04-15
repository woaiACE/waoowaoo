/**
 * IP 结构化剧本段落查询
 * GET /api/novel-promotion/[projectId]/ip/screenplay-segments/[clipId]
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { getSegmentsByClip } from '@/lib/ip-mode/ip-screenplay/segment-parser'

type Params = { projectId: string; clipId: string }

export const GET = apiHandler(async (_request: NextRequest, ctx: { params: Promise<Params> }) => {
  const { projectId, clipId } = await ctx.params

  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const novelData = authResult.novelData as { id: string }
  const segments = await getSegmentsByClip(novelData.id, clipId)

  return NextResponse.json({ segments })
})
