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

  const body = await request.json().catch(() => ({})) as {
    voiceId?: string | null
    voiceType?: string | null
    customVoiceUrl?: string | null
  }
  const current = await prisma.lxtProjectAsset.findUnique({
    where: { id: assetId },
    include: { lxtProject: { select: { projectId: true } } },
  })
  if (!current || current.lxtProject.projectId !== projectId) throw new ApiError('NOT_FOUND')

  if (body.voiceId === undefined && body.voiceType === undefined && body.customVoiceUrl === undefined) {
    throw new ApiError('INVALID_PARAMS')
  }

  const asset = await prisma.lxtProjectAsset.update({
    where: { id: assetId },
    data: {
      voiceId: body.voiceId,
      voiceType: body.voiceType,
      customVoiceUrl: body.customVoiceUrl,
    },
  })

  return NextResponse.json({ asset })
})
