import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; assetId: string }> },
) => {
  const { projectId, assetId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({}))
  const current = await prisma.lxtProjectAsset.findUnique({
    where: { id: assetId },
    include: { lxtProject: { select: { projectId: true } } },
  })
  if (!current || current.lxtProject.projectId !== projectId) throw new ApiError('NOT_FOUND')

  const updateData: Record<string, unknown> = {}

  if (typeof body.name === 'string') updateData.name = body.name.trim()
  if (body.summary !== undefined) updateData.summary = body.summary
  if (body.profileData !== undefined) updateData.profileData = body.profileData
  if (body.description !== undefined) updateData.description = body.description
  if (typeof body.profileConfirmed === 'boolean') updateData.profileConfirmed = body.profileConfirmed
  if (body.imageUrl !== undefined) updateData.imageUrl = body.imageUrl
  if (body.imageMediaId !== undefined) updateData.imageMediaId = body.imageMediaId
  if (body.voiceId !== undefined) updateData.voiceId = body.voiceId
  if (body.voiceType !== undefined) updateData.voiceType = body.voiceType
  if (body.customVoiceUrl !== undefined) updateData.customVoiceUrl = body.customVoiceUrl

  if (Object.keys(updateData).length === 0) throw new ApiError('INVALID_PARAMS')

  const asset = await prisma.lxtProjectAsset.update({
    where: { id: assetId },
    data: updateData,
  })

  return NextResponse.json({ asset })
})

export const DELETE = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string; assetId: string }> },
) => {
  const { projectId, assetId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const current = await prisma.lxtProjectAsset.findUnique({
    where: { id: assetId },
    include: { lxtProject: { select: { projectId: true } } },
  })
  if (!current || current.lxtProject.projectId !== projectId) throw new ApiError('NOT_FOUND')

  await prisma.lxtProjectAsset.delete({ where: { id: assetId } })
  return NextResponse.json({ success: true })
})
