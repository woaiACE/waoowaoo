import { logError as _ulogError } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { attachMediaFieldsToProject } from '@/lib/media/attach'
import { resolveMediaRefFromLegacyValue } from '@/lib/media/service'
import { listArtifacts, listRuns } from '@/lib/run-runtime/service'
import { TASK_TYPE } from '@/lib/task/types'

type JsonObject = Record<string, unknown>

function asObject(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null ? value as JsonObject : null
}

function asObjectArray(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonObject => typeof item === 'object' && item !== null)
    : []
}

function parseJsonText(value: unknown): JsonObject | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    return asObject(JSON.parse(value))
  } catch {
    return null
  }
}

async function loadDirectorModeData(userId: string, projectId: string, episodeId: string) {
  try {
    const persisted = await prisma.directorScript.findUnique({
      where: { episodeId },
      include: {
        storyboard: {
          include: {
            shots: {
              orderBy: { shotIndex: 'asc' },
            },
          },
        },
      },
    }).catch(() => null)

    const persistedScript = parseJsonText(persisted?.scriptJson)
    const persistedStoryboard = parseJsonText(persisted?.storyboard?.storyboardJson)
    const persistedScenes = asObjectArray(persistedScript?.scenes)
    const persistedStoryboardScenes = asObjectArray(persistedStoryboard?.scenes)

    if (persisted && persistedStoryboardScenes.length > 0) {
      return {
        runId: null,
        status: 'completed',
        generatedAt: persisted.updatedAt?.toISOString?.() || persisted.createdAt?.toISOString?.() || null,
        hasResults: true,
        scenes: persistedScenes,
        storyboards: persistedStoryboardScenes.map((scene) => ({
          scene_id: scene.scene_id,
          shots: Array.isArray(scene.storyboard) ? scene.storyboard : [],
        })),
        shotDetails: persistedStoryboardScenes.map((scene) => ({
          scene_id: scene.scene_id,
          shots: Array.isArray(scene.shotDetails) ? scene.shotDetails : [],
        })),
      }
    }

    const [latestRun] = await listRuns({
      userId,
      projectId,
      workflowType: TASK_TYPE.DIRECTOR_MODE_RUN,
      targetType: 'NovelPromotionEpisode',
      targetId: episodeId,
      episodeId,
      latestOnly: true,
      limit: 1,
    })

    if (!latestRun?.id) return null

    const [sceneArtifacts, storyboardArtifacts, shotDetailArtifacts] = await Promise.all([
      listArtifacts({
        runId: latestRun.id,
        artifactType: 'director.scenes.split',
        refId: episodeId,
        limit: 1,
      }),
      listArtifacts({
        runId: latestRun.id,
        artifactType: 'director.scene.storyboard',
        limit: 200,
      }),
      listArtifacts({
        runId: latestRun.id,
        artifactType: 'director.scene.shot_detail',
        limit: 200,
      }),
    ])

    const scenePayload = asObject(sceneArtifacts[0]?.payload)
    const scenes = asObjectArray(scenePayload?.sceneList)
    const storyboards = storyboardArtifacts
      .map((item) => asObject(item.payload))
      .filter((item): item is JsonObject => item !== null)
    const shotDetails = shotDetailArtifacts
      .map((item) => asObject(item.payload))
      .filter((item): item is JsonObject => item !== null)
    const hasResults = scenes.length > 0 || storyboards.length > 0 || shotDetails.length > 0

    return {
      runId: latestRun.id,
      status: latestRun.status || null,
      generatedAt: latestRun.finishedAt || latestRun.updatedAt || null,
      hasResults,
      scenes,
      storyboards,
      shotDetails,
    }
  } catch (error) {
    _ulogError('加载导演模式数据失败:', error)
    return null
  }
}

/**
 * GET - 获取单个剧集的完整数据
 */
export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> }
) => {
  const { projectId, episodeId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  // 获取剧集及其关联数据
  const episode = await prisma.novelPromotionEpisode.findUnique({
    where: { id: episodeId },
    include: {
      clips: {
        orderBy: { createdAt: 'asc' }
      },
      storyboards: {
        include: {
          clip: true,
          panels: { orderBy: { panelIndex: 'asc' } }
        },
        orderBy: { createdAt: 'asc' }
      },
      shots: {
        orderBy: { shotId: 'asc' }
      },
      voiceLines: {
        orderBy: { lineIndex: 'asc' }
      }
    }
  })

  if (!episode) {
    throw new ApiError('NOT_FOUND')
  }

  // 更新最后编辑的剧集ID（异步，不阻塞响应）
  prisma.novelPromotionProject.update({
    where: { projectId },
    data: { lastEpisodeId: episodeId }
  }).catch(err => _ulogError('更新 lastEpisodeId 失败:', err))

  // 转换为稳定媒体 URL（并保留兼容字段）
  const episodeWithSignedUrls = await attachMediaFieldsToProject(episode)
  const directorModeData = await loadDirectorModeData(authResult.session.user.id, projectId, episodeId)

  return NextResponse.json({
    episode: {
      ...episodeWithSignedUrls,
      directorModeData,
    },
  })
})

/**
 * PATCH - 更新剧集信息
 */
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> }
) => {
  const { projectId, episodeId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { name, description, novelText, audioUrl, srtContent } = body

  const updateData: Prisma.NovelPromotionEpisodeUncheckedUpdateInput = {}
  if (name !== undefined) updateData.name = name.trim()
  if (description !== undefined) updateData.description = description?.trim() || null
  if (novelText !== undefined) updateData.novelText = novelText
  if (audioUrl !== undefined) {
    updateData.audioUrl = audioUrl
    const media = await resolveMediaRefFromLegacyValue(audioUrl)
    updateData.audioMediaId = media?.id || null
  }
  if (srtContent !== undefined) updateData.srtContent = srtContent

  const episode = await prisma.novelPromotionEpisode.update({
    where: { id: episodeId },
    data: updateData
  })

  return NextResponse.json({ episode })
})

/**
 * DELETE - 删除剧集
 */
export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> }
) => {
  const { projectId, episodeId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  // 删除剧集（关联数据会级联删除）
  await prisma.novelPromotionEpisode.delete({
    where: { id: episodeId }
  })

  // 如果删除的是最后编辑的剧集，更新 lastEpisodeId
  const novelPromotionProject = await prisma.novelPromotionProject.findUnique({
    where: { projectId }
  })

  if (novelPromotionProject?.lastEpisodeId === episodeId) {
    // 找到另一个剧集作为默认
    const anotherEpisode = await prisma.novelPromotionEpisode.findFirst({
      where: { novelPromotionProjectId: novelPromotionProject.id },
      orderBy: { episodeNumber: 'asc' }
    })

    await prisma.novelPromotionProject.update({
      where: { id: novelPromotionProject.id },
      data: { lastEpisodeId: anotherEpisode?.id || null }
    })
  }

  return NextResponse.json({ success: true })
})
