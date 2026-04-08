import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

type CharacterRelationDelegate = {
  findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>
  deleteMany: (args: unknown) => Promise<{ count: number }>
}

const characterRelationModel = (prisma as unknown as { characterRelation: CharacterRelationDelegate }).characterRelation

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
  } catch {
    return []
  }
}

function resolveAppearanceImage(appearance: {
  imageUrl: string | null
  imageUrls: string | null
  selectedIndex: number | null
} | null | undefined): string | null {
  if (!appearance) return null
  const imageCandidates = parseStringArray(appearance.imageUrls)
  if (typeof appearance.selectedIndex === 'number' && appearance.selectedIndex >= 0 && appearance.selectedIndex < imageCandidates.length) {
    return imageCandidates[appearance.selectedIndex]
  }
  return appearance.imageUrl ?? imageCandidates[0] ?? null
}

/**
 * GET /api/projects/[projectId]/character-relations
 * 返回项目的角色关系列表 + 角色基础信息（供前端关系图谱渲染使用）
 */
export const GET = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  })
  if (!project) throw new ApiError('NOT_FOUND')
  if (project.userId !== session.user.id) throw new ApiError('FORBIDDEN')

  const novelProject = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    select: { id: true },
  })
  if (!novelProject) throw new ApiError('NOT_FOUND')

  const [relations, characters, latestGlobalAnalyzeTask] = await Promise.all([
    characterRelationModel.findMany({
      where: { novelPromotionProjectId: novelProject.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.novelPromotionCharacter.findMany({
      where: { novelPromotionProjectId: novelProject.id },
      select: {
        id: true,
        name: true,
        aliases: true,
        profileData: true,
        profileConfirmed: true,
        appearances: {
          orderBy: { appearanceIndex: 'asc' },
          take: 1,
          select: {
            imageUrl: true,
            imageUrls: true,
            selectedIndex: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.task.findFirst({
      where: {
        projectId,
        type: 'analyze_global',
      },
      orderBy: [
        { finishedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      select: {
        status: true,
        createdAt: true,
        finishedAt: true,
        updatedAt: true,
      },
    }),
  ])

  // 简化角色数据：解析 profileData 只返回必要字段
  const characterNodes = characters.map((char: (typeof characters)[number]) => {
    let roleLevel = 'D'
    try {
      const pd = JSON.parse(char.profileData ?? '{}') as Record<string, unknown>
      if (typeof pd.role_level === 'string') roleLevel = pd.role_level
    } catch {
      // ignore parse error
    }
    return {
      id: char.id,
      name: char.name,
      aliases: (() => {
        try {
          return JSON.parse(char.aliases ?? '[]') as string[]
        } catch {
          return [] as string[]
        }
      })(),
      roleLevel,
      profileConfirmed: char.profileConfirmed,
      imageUrl: resolveAppearanceImage(char.appearances[0]),
    }
  })

  return NextResponse.json({
    relations,
    characters: characterNodes,
    hasRelations: relations.length > 0,
    hasCompletedGlobalAnalyze: latestGlobalAnalyzeTask?.status === 'completed',
    lastGlobalAnalyzeAt:
      latestGlobalAnalyzeTask?.finishedAt ??
      latestGlobalAnalyzeTask?.updatedAt ??
      latestGlobalAnalyzeTask?.createdAt ??
      null,
  })
})

/**
 * DELETE /api/projects/[projectId]/character-relations
 * 清空项目的所有角色关系（用于重新触发全局分析前的清理）
 */
export const DELETE = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  })
  if (!project) throw new ApiError('NOT_FOUND')
  if (project.userId !== session.user.id) throw new ApiError('FORBIDDEN')

  const novelProject = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    select: { id: true },
  })
  if (!novelProject) throw new ApiError('NOT_FOUND')

  await characterRelationModel.deleteMany({
    where: { novelPromotionProjectId: novelProject.id },
  })

  return NextResponse.json({ success: true })
})
