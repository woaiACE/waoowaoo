import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; assetId: string }> },
) => {
  const { projectId, assetId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as { globalAssetId?: string }
  const globalAssetId = typeof body.globalAssetId === 'string' ? body.globalAssetId.trim() : ''
  if (!globalAssetId) throw new ApiError('INVALID_PARAMS')

  const current = await prisma.lxtProjectAsset.findUnique({
    where: { id: assetId },
    include: { lxtProject: { select: { projectId: true } } },
  })
  if (!current || current.lxtProject.projectId !== projectId) throw new ApiError('NOT_FOUND')

  const updateData: Record<string, string | null> = {
    globalCharacterId: null,
    globalLocationId: null,
    globalPropId: null,
  }

  if (current.kind === 'character') updateData.globalCharacterId = globalAssetId
  if (current.kind === 'location') updateData.globalLocationId = globalAssetId
  if (current.kind === 'prop') updateData.globalPropId = globalAssetId

  const asset = await prisma.lxtProjectAsset.update({
    where: { id: assetId },
    data: updateData,
  })

  return NextResponse.json({ asset })
})
