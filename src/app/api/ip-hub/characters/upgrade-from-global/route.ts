/**
 * IP 角色升级 — 从 GlobalCharacter 升级为 IpCharacter
 * POST /api/ip-hub/characters/upgrade-from-global
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { createIpCharacter } from '@/lib/ip-mode/ip-asset/service'

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json() as Record<string, unknown>
  const globalCharacterId = typeof body.globalCharacterId === 'string' ? body.globalCharacterId : ''
  if (!globalCharacterId) {
    return NextResponse.json({ error: 'globalCharacterId is required' }, { status: 400 })
  }

  // 获取源 GlobalCharacter
  const source = await prisma.globalCharacter.findFirst({
    where: { id: globalCharacterId, userId: session.user.id },
    include: { appearances: true },
  })

  if (!source) {
    return NextResponse.json({ error: 'Global character not found' }, { status: 404 })
  }

  // 创建 IP 角色，复制基础数据
  const ipCharacter = await createIpCharacter({
    userId: session.user.id,
    name: source.name,
    folderId: source.folderId,
    profileData: source.profileData,
    sourceGlobalCharacterId: source.id,
    sourceType: 'upgraded',
  })

  // 复制音色绑定
  if (source.voiceId || source.customVoiceUrl) {
    await prisma.ipCharacter.update({
      where: { id: ipCharacter.id },
      data: {
        voiceId: source.voiceId,
        voiceType: source.voiceType,
        customVoiceUrl: source.customVoiceUrl,
        customVoiceMediaId: source.customVoiceMediaId,
        globalVoiceId: source.globalVoiceId,
      },
    })
  }

  // 从主形象提取面部参考
  const primaryAppearance = source.appearances.find(a => a.appearanceIndex === 0)
  if (primaryAppearance?.imageUrl) {
    await prisma.ipCharacter.update({
      where: { id: ipCharacter.id },
      data: {
        faceReferenceUrl: primaryAppearance.imageUrl,
        faceMediaId: primaryAppearance.imageMediaId,
      },
    })
  }

  // 返回创建的 IP 角色
  const result = await prisma.ipCharacter.findUnique({
    where: { id: ipCharacter.id },
    include: {
      variants: true,
      referenceSheets: true,
    },
  })

  return NextResponse.json({ character: result }, { status: 201 })
})
