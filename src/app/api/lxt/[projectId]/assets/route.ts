import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { extractLxtAssetsFromShotList } from '@/lib/lxt/project-assets'
import { getSignedUrl } from '@/lib/storage'

async function ensureLxtProject(projectId: string) {
  return prisma.lxtProject.upsert({
    where: { projectId },
    create: { projectId },
    update: {},
    select: { id: true },
  })
}

export const GET = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const lxtProject = await prisma.lxtProject.findUnique({
    where: { projectId },
    select: { id: true },
  })
  if (!lxtProject) return NextResponse.json({ assets: [], counts: { character: 0, location: 0, prop: 0 } })

  const assets = await prisma.lxtProjectAsset.findMany({
    where: { lxtProjectId: lxtProject.id },
    orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
  })

  // Sign customVoiceUrl so the browser can play/download audio
  const signedAssets = assets.map((asset) => ({
    ...asset,
    customVoiceUrl: asset.customVoiceUrl ? getSignedUrl(asset.customVoiceUrl, 7200) : null,
  }))

  return NextResponse.json({
    assets: signedAssets,
    counts: {
      character: assets.filter((item) => item.kind === 'character').length,
      location: assets.filter((item) => item.kind === 'location').length,
      prop: assets.filter((item) => item.kind === 'prop').length,
    },
  })
})

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as { episodeId?: string }
  const lxtProject = await ensureLxtProject(projectId)

  const episodes = await prisma.lxtEpisode.findMany({
    where: {
      lxtProjectId: lxtProject.id,
      ...(body.episodeId ? { id: body.episodeId } : {}),
    },
    select: {
      id: true,
      shotListContent: true,
    },
  })

  const shotListContent = episodes
    .map((item) => item.shotListContent?.trim())
    .filter((item): item is string => Boolean(item))
    .join('\n\n')

  if (!shotListContent) {
    throw new ApiError('INVALID_PARAMS', { message: 'No storyboard content found for asset initialization' })
  }

  const extracted = extractLxtAssetsFromShotList(shotListContent)
  if (extracted.all.length === 0) {
    return NextResponse.json({ assets: [], counts: { character: 0, location: 0, prop: 0 } })
  }

  for (const asset of extracted.all) {
    await prisma.lxtProjectAsset.upsert({
      where: {
        lxtProjectId_kind_name: {
          lxtProjectId: lxtProject.id,
          kind: asset.kind,
          name: asset.name,
        },
      },
      create: {
        lxtProjectId: lxtProject.id,
        kind: asset.kind,
        name: asset.name,
        summary: `自动初始化：${asset.sourceShotLabels.join('、')}`,
      },
      update: {},
    })
  }

  const assets = await prisma.lxtProjectAsset.findMany({
    where: { lxtProjectId: lxtProject.id },
    orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
  })

  const signedAssets = assets.map((asset) => ({
    ...asset,
    customVoiceUrl: asset.customVoiceUrl ? getSignedUrl(asset.customVoiceUrl, 7200) : null,
  }))

  return NextResponse.json({
    assets: signedAssets,
    counts: {
      character: assets.filter((item) => item.kind === 'character').length,
      location: assets.filter((item) => item.kind === 'location').length,
      prop: assets.filter((item) => item.kind === 'prop').length,
    },
  }, { status: 201 })
})

export const DELETE = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const lxtProject = await prisma.lxtProject.findUnique({
    where: { projectId },
    select: { id: true },
  })
  if (!lxtProject) return NextResponse.json({ deleted: 0 })

  const result = await prisma.lxtProjectAsset.deleteMany({
    where: { lxtProjectId: lxtProject.id },
  })

  return NextResponse.json({ deleted: result.count })
})
