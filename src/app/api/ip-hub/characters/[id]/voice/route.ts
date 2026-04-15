/**
 * IP 角色声音绑定 API
 * POST   /api/ip-hub/characters/[id]/voice   绑定/更新音色
 * DELETE /api/ip-hub/characters/[id]/voice   解绑音色
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { updateIpCharacter, getIpCharacter } from '@/lib/ip-mode/ip-asset/service'

type Params = { id: string }

export const POST = apiHandler(async (request: NextRequest, ctx: { params: Promise<Params> }) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const { id } = await ctx.params

  const body = await request.json() as Record<string, unknown>

  await updateIpCharacter(id, session.user.id, {
    voiceId: typeof body.voiceId === 'string' ? body.voiceId : null,
    voiceType: typeof body.voiceType === 'string' ? body.voiceType : null,
    customVoiceUrl: typeof body.customVoiceUrl === 'string' ? body.customVoiceUrl : null,
    customVoiceMediaId: typeof body.customVoiceMediaId === 'string' ? body.customVoiceMediaId : null,
    globalVoiceId: typeof body.globalVoiceId === 'string' ? body.globalVoiceId : null,
    voiceEmotionConfig: typeof body.voiceEmotionConfig === 'string' ? body.voiceEmotionConfig : null,
  })

  const updated = await getIpCharacter(id, session.user.id)
  return NextResponse.json({ character: updated })
})

export const DELETE = apiHandler(async (_request: NextRequest, ctx: { params: Promise<Params> }) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const { id } = await ctx.params

  await updateIpCharacter(id, session.user.id, {
    voiceId: null,
    voiceType: null,
    customVoiceUrl: null,
    customVoiceMediaId: null,
    globalVoiceId: null,
    voiceEmotionConfig: null,
  })

  return NextResponse.json({ success: true })
})
