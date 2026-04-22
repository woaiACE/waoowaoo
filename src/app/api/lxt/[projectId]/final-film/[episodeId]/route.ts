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
import { parseLxtScript } from '@/lib/lxt/parse-script'
import { autoBindAssetsFromShotList } from '@/lib/lxt/auto-bind'

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
 *  或
 *  - { autoFillFromScript: true }（从制作脚本自动填充文案/提示词 + 资产库自动绑定角色/场景）
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
    autoFillFromScript?: boolean
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
  } else if (!body.reconcile && !body.autoFillFromScript) {
    throw new ApiError('INVALID_PARAMS', { message: 'shotIndex+patch | rows[] | reconcile=true | autoFillFromScript=true required' })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.lxtEpisode.findUnique({
      where: { id: episodeId },
      select: { id: true, finalFilmContent: true, shotListContent: true, scriptContent: true },
    })
    if (!current) throw new ApiError('NOT_FOUND')

    let content = parseFinalFilmContent(current.finalFilmContent)

    if (body.reconcile || body.autoFillFromScript) {
      const rows = reconcileRowsWithShotList(content.rows, current.shotListContent)
      content = { version: FINAL_FILM_CONTENT_VERSION, rows }
    }

    if (body.autoFillFromScript) {
      // 1. 从制作脚本解析文案/提示词（含 LLM 输出的 assetBindings）
      const scriptShots = parseLxtScript(current.scriptContent)

      // 2. 从资产库加载所有资产
      const assets = await tx.lxtProjectAsset.findMany({
        where: { lxtProject: { projectId } },
        select: { id: true, name: true, kind: true },
      })

      // 3. 构建 名称→id 映射（用于 LLM 绑定名字 → ID 查找）
      const assetNameMap = new Map<string, string>()
      for (const a of assets) assetNameMap.set(a.name, a.id)

      // 4. 正则绑定兜底（LLM 绑定缺失时使用）
      const bindings = autoBindAssetsFromShotList(current.shotListContent ?? '', assets)
      const bindMap = new Map(bindings.map((b) => [b.shotIndex, b]))

      // 5. merge 进成片行（只填空字段，已有手动编辑的不覆盖）
      for (const s of scriptShots) {
        const bind = bindMap.get(s.shotIndex)
        const patch: Partial<LxtFinalFilmRow> = {}

        const existingRow = content.rows.find((r) => r.shotIndex === s.shotIndex)
        if (s.copyText    && !existingRow?.copyText)    patch.copyText    = s.copyText
        if (s.imagePrompt && !existingRow?.imagePrompt) patch.imagePrompt = s.imagePrompt
        if (s.videoPrompt && !existingRow?.videoPrompt) patch.videoPrompt = s.videoPrompt

        const existingBindings = existingRow?.bindings
        const hasChars = (existingBindings?.characterAssetIds?.length ?? 0) > 0
        const hasScene = !!existingBindings?.sceneAssetId
        const hasProps = (existingBindings?.propAssetIds?.length ?? 0) > 0

        // 优先使用 Phase1 LLM 的 asset_bindings（精确名字查表），fallback 到正则绑定
        let newCharIds: string[] = []
        let newSceneId: string | null = null
        let newPropIds: string[] = []

        if (s.assetBindings) {
          newCharIds = s.assetBindings.characters
            .map((n) => assetNameMap.get(n))
            .filter((id): id is string => !!id)
          newSceneId = s.assetBindings.scenes
            .map((n) => assetNameMap.get(n))
            .find((id): id is string => !!id) ?? null
          newPropIds = s.assetBindings.props
            .map((n) => assetNameMap.get(n))
            .filter((id): id is string => !!id)
        } else if (bind) {
          newCharIds = bind.characterAssetIds
          newSceneId = bind.sceneAssetId
          newPropIds = bind.propAssetIds
        }

        if (newCharIds.length > 0 || newSceneId || newPropIds.length > 0) {
          patch.bindings = {
            characterAssetIds: hasChars ? (existingBindings?.characterAssetIds ?? []) : newCharIds,
            sceneAssetId:      hasScene ? (existingBindings?.sceneAssetId ?? null)    : newSceneId,
            propAssetIds:      hasProps ? (existingBindings?.propAssetIds ?? [])      : newPropIds,
          }
        }

        if (Object.keys(patch).length > 0) {
          content = applyRowPatch(content, s.shotIndex, patch)
        }
      }
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
