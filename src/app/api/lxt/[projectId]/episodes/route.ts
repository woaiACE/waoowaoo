import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * GET - 获取 LXT 项目的所有集
 */
export const GET = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const lxtProject = await prisma.lxtProject.findUnique({
    where: { projectId },
    select: { id: true },
  })
  if (!lxtProject) throw new ApiError('NOT_FOUND')

  const episodes = await prisma.lxtEpisode.findMany({
    where: { lxtProjectId: lxtProject.id },
    orderBy: { episodeNumber: 'asc' },
  })

  return NextResponse.json({ episodes })
})

/**
 * POST - 创建 LXT 集
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) throw new ApiError('INVALID_PARAMS')

  // upsert lxtProject：防止 project 以 mode='lxt' 创建但 lxtProject 记录缺失的情况
  const lxtProject = await prisma.lxtProject.upsert({
    where: { projectId },
    create: { projectId },
    update: {},
    select: { id: true },
  })

  const lastEpisode = await prisma.lxtEpisode.findFirst({
    where: { lxtProjectId: lxtProject.id },
    orderBy: { episodeNumber: 'desc' },
    select: { episodeNumber: true },
  })
  const nextEpisodeNumber = (lastEpisode?.episodeNumber ?? 0) + 1

  const episode = await prisma.lxtEpisode.create({
    data: {
      lxtProjectId: lxtProject.id,
      episodeNumber: nextEpisodeNumber,
      name,
    },
  })

  return NextResponse.json({ episode }, { status: 201 })
})
