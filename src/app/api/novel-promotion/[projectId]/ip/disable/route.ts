/**
 * 项目 IP 模式关闭
 * POST /api/novel-promotion/[projectId]/ip/disable
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
  await setProjectIpMode(novelData.id, false)

  return NextResponse.json({ ipModeEnabled: false })
})
