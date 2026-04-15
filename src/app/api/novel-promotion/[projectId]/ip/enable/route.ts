/**
 * 项目 IP 模式开关
 * POST /api/novel-promotion/[projectId]/ip/enable
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { setProjectIpMode } from '@/lib/ip-mode/ip-asset/casting-service'

type Params = { projectId: string }

export const POST = apiHandler(async (_request: NextRequest, ctx: { params: Promise<Params> }) => {
  const { projectId } = await ctx.params

  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const novelData = authResult.novelData as { id: string }
  await setProjectIpMode(novelData.id, true)

  return NextResponse.json({ ipModeEnabled: true })
})
