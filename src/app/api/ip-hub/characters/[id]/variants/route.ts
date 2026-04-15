/**
 * IP 角色形态预设 API
 * GET  /api/ip-hub/characters/[id]/variants        列出预设
 * POST /api/ip-hub/characters/[id]/variants        创建预设
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { createIpVariant, listIpVariants } from '@/lib/ip-mode/ip-asset/service'

type Params = { id: string }

export const GET = apiHandler(async (_request: NextRequest, ctx: { params: Promise<Params> }) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { id: ipCharacterId } = await ctx.params

  const variants = await listIpVariants(ipCharacterId)
  return NextResponse.json({ variants })
})

export const POST = apiHandler(async (request: NextRequest, ctx: { params: Promise<Params> }) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const { id: ipCharacterId } = await ctx.params

  const body = await request.json() as Record<string, unknown>
  const variantName = typeof body.variantName === 'string' ? body.variantName.trim() : ''
  if (!variantName) {
    return NextResponse.json({ error: 'variantName is required' }, { status: 400 })
  }

  const variant = await createIpVariant(ipCharacterId, session.user.id, {
    variantName,
    costumeDescription: typeof body.costumeDescription === 'string' ? body.costumeDescription : null,
    hairstyleDescription: typeof body.hairstyleDescription === 'string' ? body.hairstyleDescription : null,
    accessoryDescription: typeof body.accessoryDescription === 'string' ? body.accessoryDescription : null,
    environmentHint: typeof body.environmentHint === 'string' ? body.environmentHint : null,
    isDefault: body.isDefault === true,
  })

  return NextResponse.json({ variant }, { status: 201 })
})
