/**
 * IP 角色形态预设 — 单个操作
 * PATCH  /api/ip-hub/characters/[id]/variants/[vid]   更新预设
 * DELETE /api/ip-hub/characters/[id]/variants/[vid]   删除预设
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { updateIpVariant, deleteIpVariant } from '@/lib/ip-mode/ip-asset/service'

type Params = { id: string; vid: string }

export const PATCH = apiHandler(async (request: NextRequest, ctx: { params: Promise<Params> }) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { id: ipCharacterId, vid } = await ctx.params

  const body = await request.json() as Record<string, unknown>

  const data: Record<string, unknown> = {}
  const allowed = [
    'variantName', 'costumeDescription', 'hairstyleDescription',
    'accessoryDescription', 'environmentHint', 'isDefault',
    'previewUrl', 'previewMediaId', 'previewUrls', 'selectedPreviewIndex',
  ]
  for (const field of allowed) {
    if (field in body) {
      data[field] = body[field] ?? null
    }
  }

  await updateIpVariant(vid, ipCharacterId, data as Parameters<typeof updateIpVariant>[2])

  return NextResponse.json({ success: true })
})

export const DELETE = apiHandler(async (_request: NextRequest, ctx: { params: Promise<Params> }) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { id: ipCharacterId, vid } = await ctx.params

  await deleteIpVariant(vid, ipCharacterId)

  return NextResponse.json({ success: true })
})
