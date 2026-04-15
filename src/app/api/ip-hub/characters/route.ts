/**
 * IP 角色资产 API — 列出 & 创建
 * GET  /api/ip-hub/characters          列出当前用户的 IP 角色
 * POST /api/ip-hub/characters          创建新 IP 角色
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import {
  createIpCharacter,
  listIpCharacters,
} from '@/lib/ip-mode/ip-asset/service'

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const { searchParams } = new URL(request.url)
  const folderId = searchParams.get('folderId')
  const status = searchParams.get('status') as 'draft' | 'active' | 'archived' | null

  const characters = await listIpCharacters(session.user.id, {
    folderId: folderId ?? undefined,
    status: status ?? undefined,
  })

  return NextResponse.json({ characters })
})

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json() as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const character = await createIpCharacter({
    userId: session.user.id,
    name,
    folderId: typeof body.folderId === 'string' ? body.folderId : null,
    gender: typeof body.gender === 'string' ? body.gender : null,
    ageRange: typeof body.ageRange === 'string' ? body.ageRange : null,
    personality: typeof body.personality === 'string' ? body.personality : null,
    speakingStyle: typeof body.speakingStyle === 'string' ? body.speakingStyle : null,
    backstory: typeof body.backstory === 'string' ? body.backstory : null,
    profileData: typeof body.profileData === 'string' ? body.profileData : null,
    sourceGlobalCharacterId: typeof body.sourceGlobalCharacterId === 'string' ? body.sourceGlobalCharacterId : null,
    sourceType: typeof body.sourceType === 'string' ? body.sourceType : 'manual',
  })

  return NextResponse.json({ character }, { status: 201 })
})
