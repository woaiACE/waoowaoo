/**
 * IP 角色参考图集 API
 * GET  /api/ip-hub/characters/[id]/ref-sheets   查询参考图集
 * POST /api/ip-hub/characters/[id]/ref-sheets   创建参考图集 (触发生成)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { createIpRefSheet, listIpRefSheets } from '@/lib/ip-mode/ip-asset/service'
import { getIpCharacter } from '@/lib/ip-mode/ip-asset/service'

type Params = { id: string }

const VALID_SHEET_TYPES = new Set(['turnaround', 'expression', 'pose', 'detail'])

export const GET = apiHandler(async (_request: NextRequest, ctx: { params: Promise<Params> }) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { id: ipCharacterId } = await ctx.params

  const sheets = await listIpRefSheets(ipCharacterId)
  return NextResponse.json({ sheets })
})

export const POST = apiHandler(async (request: NextRequest, ctx: { params: Promise<Params> }) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const { id: ipCharacterId } = await ctx.params

  // 验证归属
  const character = await getIpCharacter(ipCharacterId, session.user.id)
  if (!character) {
    return NextResponse.json({ error: 'IP character not found' }, { status: 404 })
  }

  const body = await request.json() as Record<string, unknown>
  const sheetType = typeof body.sheetType === 'string' ? body.sheetType : ''
  if (!VALID_SHEET_TYPES.has(sheetType)) {
    return NextResponse.json(
      { error: `Invalid sheetType. Must be one of: ${Array.from(VALID_SHEET_TYPES).join(', ')}` },
      { status: 400 },
    )
  }

  const sheet = await createIpRefSheet(ipCharacterId, {
    sheetType,
    description: typeof body.description === 'string' ? body.description : null,
  })

  // TODO: 触发 IP_REF_SHEET_GENERATE 任务

  return NextResponse.json({ sheet }, { status: 201 })
})
