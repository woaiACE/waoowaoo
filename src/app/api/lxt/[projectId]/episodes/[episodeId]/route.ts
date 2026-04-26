import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import {
  createEmptyFinalFilmContent,
  deriveRowsFromShotList,
  parseFinalFilmContent,
  serializeFinalFilmContent,
} from '@/lib/lxt/final-film'

/**
 * GET - 获取单个 LXT 集详情
 *
 * 若 finalFilmContent 尚未初始化且存在 shotListContent，则按分镜文本惰性派生行骨架并落库。
 * 该 lazy upsert 放在后端是为了避免多入口并发初始化和首次渲染闪烁。
 */
export const GET = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> }
) => {
  const { projectId, episodeId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  let episode = await prisma.lxtEpisode.findUnique({
    where: { id: episodeId },
  })
  if (!episode) throw new ApiError('NOT_FOUND')

  // 惰性初始化 finalFilmContent：仅在未设置且有分镜脚本时生成骨架
  // 使用事务避免与并发 setVideoRatio/setArtStyle PATCH 的竞态覆盖
  if (!episode.finalFilmContent && episode.shotListContent && episode.shotListContent.trim()) {
    const rows = deriveRowsFromShotList(episode.shotListContent)
    if (rows.length > 0) {
      episode = await prisma.$transaction(async (tx) => {
        const current = await tx.lxtEpisode.findUnique({
          where: { id: episodeId },
          select: { finalFilmContent: true },
        })
        // 若在事务内发现已被其他请求初始化，直接返回不覆盖
        if (current?.finalFilmContent) {
          const existing = await tx.lxtEpisode.findUnique({ where: { id: episodeId } })
          return existing!
        }
        const content = serializeFinalFilmContent({
          ...createEmptyFinalFilmContent(),
          rows,
        })
        return tx.lxtEpisode.update({
          where: { id: episodeId },
          data: { finalFilmContent: content },
        })
      })
    }
  } else if (!episode.finalFilmContent) {
    // 确保前端拿到稳定结构；不落库，避免无内容时产生脏数据
    episode = { ...episode, finalFilmContent: serializeFinalFilmContent(createEmptyFinalFilmContent()) }
  } else {
    // 容错归一化：解析后重新序列化，剔除未知字段
    const normalized = parseFinalFilmContent(episode.finalFilmContent)
    episode = { ...episode, finalFilmContent: serializeFinalFilmContent(normalized) }
  }

  return NextResponse.json({ episode })
})

/**
 * PATCH - 更新 LXT 集（name / novelText / srtContent / shotListContent / scriptContent / finalFilmContent）
 *
 * `finalFilmContent` 走“整段覆盖”通路；行级字段级合并更推荐使用
 *   PATCH /api/lxt/[projectId]/final-film/[episodeId]
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
  if (body.finalFilmContent !== undefined) {
    // 整段覆盖前归一化，防止写入破损 JSON
    if (typeof body.finalFilmContent === 'string') {
      updateData.finalFilmContent = serializeFinalFilmContent(parseFinalFilmContent(body.finalFilmContent))
    } else if (body.finalFilmContent === null) {
      updateData.finalFilmContent = null
    }
  }

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
