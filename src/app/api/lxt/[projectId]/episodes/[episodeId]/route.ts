import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * GET - 获取单个 LXT 集详情
 */
export const GET = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> }
) => {
  const { projectId, episodeId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const episode = await prisma.lxtEpisode.findUnique({
    where: { id: episodeId },
  })
  if (!episode) throw new ApiError('NOT_FOUND')

  return NextResponse.json({ episode })
})

/**
 * PATCH - 更新 LXT 集（name / novelText / srtContent / shotListContent / scriptContent）
 */
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> }
) => {
  const { projectId, episodeId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({}))

  const updateData: Record<string, unknown> = {}
  if (typeof body.name === 'string') updateData.name = body.name.trim()
  if (body.novelText !== undefined) updateData.novelText = body.novelText
  if (body.srtContent !== undefined) updateData.srtContent = body.srtContent
  if (body.shotListContent !== undefined) updateData.shotListContent = body.shotListContent
  if (body.scriptContent !== undefined) updateData.scriptContent = body.scriptContent

  if (Object.keys(updateData).length === 0) throw new ApiError('INVALID_PARAMS')

  const episode = await prisma.lxtEpisode.update({
    where: { id: episodeId },
    data: updateData,
  })

  return NextResponse.json({ episode })
})

/**
 * DELETE - 删除 LXT 集
 */
export const DELETE = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> }
) => {
  const { projectId, episodeId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  await prisma.lxtEpisode.delete({ where: { id: episodeId } })

  return NextResponse.json({ success: true })
})
