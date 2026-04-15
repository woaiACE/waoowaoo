/**
 * IP 角色资产 API — 单个角色操作
 * GET    /api/ip-hub/characters/[id]   获取详情
 * PATCH  /api/ip-hub/characters/[id]   更新
 * DELETE /api/ip-hub/characters/[id]   软删除 (archived)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import {
  getIpCharacter,
  updateIpCharacter,
  deleteIpCharacter,
} from '@/lib/ip-mode/ip-asset/service'

type Params = { id: string }

export const GET = apiHandler(async (_request: NextRequest, ctx: { params: Promise<Params> }) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const { id } = await ctx.params

  const character = await getIpCharacter(id, session.user.id)
  if (!character) {
    return NextResponse.json({ error: 'IP character not found' }, { status: 404 })
  }

  return NextResponse.json({ character })
})

export const PATCH = apiHandler(async (request: NextRequest, ctx: { params: Promise<Params> }) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const { id } = await ctx.params

  const body = await request.json() as Record<string, unknown>

  const allowedFields = [
    'name', 'aliases', 'gender', 'ageRange', 'personality', 'speakingStyle',
    'backstory', 'profileData', 'bodyArchetype', 'status', 'folderId',
    'voiceId', 'voiceType', 'customVoiceUrl', 'customVoiceMediaId',
    'globalVoiceId', 'voiceEmotionConfig', 'faceDescriptor',
    'faceReferenceUrl', 'faceMediaId',
  ]

  const data: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in body) {
      data[field] = body[field] ?? null
    }
  }

  const result = await updateIpCharacter(id, session.user.id, data as Parameters<typeof updateIpCharacter>[2])

  if (result.count === 0) {
    return NextResponse.json({ error: 'IP character not found' }, { status: 404 })
  }

  const updated = await getIpCharacter(id, session.user.id)
  return NextResponse.json({ character: updated })
})

export const DELETE = apiHandler(async (_request: NextRequest, ctx: { params: Promise<Params> }) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const { id } = await ctx.params

  const result = await deleteIpCharacter(id, session.user.id)
  if (result.count === 0) {
    return NextResponse.json({ error: 'IP character not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
})
