import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import {
  applyRowPatch,
  parseFinalFilmContent,
  serializeFinalFilmContent,
  reconcileRowsWithShotList,
  FINAL_FILM_CONTENT_VERSION,
  type LxtFinalFilmRow,
  type LxtFinalFilmRowBindings,
} from '@/lib/lxt/final-film'

/**
 * PATCH /api/lxt/[projectId]/final-film/[episodeId]
 *
 * 行级字段 merge 写入，避免整段覆盖造成并发字段丢失。
 *
 * Body:
 *  - { shotIndex: number, patch: Partial<LxtFinalFilmRow> }
 *  或
 *  - { rows: Array<{ shotIndex: number } & Partial<LxtFinalFilmRow>> }（批量）
 *  或
 *  - { reconcile: true }（与当前 shotListContent 做骨架对齐）
 */
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> }
) => {
  const { projectId, episodeId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = (await request.json().catch(() => ({}))) as {
    shotIndex?: number
    patch?: Partial<LxtFinalFilmRow> & { bindings?: LxtFinalFilmRowBindings }
    rows?: Array<Partial<LxtFinalFilmRow> & { shotIndex: number }>
    reconcile?: boolean
  }

  const patches: Array<{ shotIndex: number; patch: Partial<LxtFinalFilmRow> }> = []
  if (Array.isArray(body.rows)) {
    for (const row of body.rows) {
      if (typeof row.shotIndex === 'number') {
        const { shotIndex, ...patch } = row
        patches.push({ shotIndex, patch })
      }
    }
  } else if (typeof body.shotIndex === 'number' && body.patch && typeof body.patch === 'object') {
    patches.push({ shotIndex: body.shotIndex, patch: body.patch })
  } else if (!body.reconcile) {
    throw new ApiError('INVALID_PARAMS', { message: 'shotIndex+patch | rows[] | reconcile=true required' })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.lxtEpisode.findUnique({
      where: { id: episodeId },
      select: { id: true, finalFilmContent: true, shotListContent: true },
    })
    if (!current) throw new ApiError('NOT_FOUND')

    let content = parseFinalFilmContent(current.finalFilmContent)

    if (body.reconcile) {
      const rows = reconcileRowsWithShotList(content.rows, current.shotListContent)
      content = { version: FINAL_FILM_CONTENT_VERSION, rows }
    }

    for (const { shotIndex, patch } of patches) {
      content = applyRowPatch(content, shotIndex, patch)
    }

    return await tx.lxtEpisode.update({
      where: { id: episodeId },
      data: { finalFilmContent: serializeFinalFilmContent(content) },
    })
  })

  return NextResponse.json({ episode: updated })
})
