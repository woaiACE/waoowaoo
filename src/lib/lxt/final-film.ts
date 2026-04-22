import { parseLxtShots } from './parse-shots'

/**
 * LXT 成片阶段数据模型
 *
 * 存储位置：`LxtEpisode.finalFilmContent`（String @db.Text，内部 JSON.stringify）
 * 设计原则：
 * - 行级（按分镜）数据结构，每行对应一个分镜
 * - 顶层 version 便于将来结构演进 / 容错解析
 * - 写入走“行级 patch + 后端 merge”，避免整段覆盖造成并发丢失
 */

export const FINAL_FILM_CONTENT_VERSION = 1

export interface LxtFinalFilmRowBindings {
  characterAssetIds: string[]
  sceneAssetId?: string | null
  propAssetIds?: string[]
}

export interface LxtFinalFilmRow {
  shotIndex: number             // 0-based，对应 parseLxtShots 的 index
  label?: string                // 分镜名（"分镜1"等）
  copyText?: string             // 文案
  imagePrompt?: string          // 图片提示词
  imageUrl?: string | null      // 主图
  videoEndFrameUrl?: string | null // 视频尾帧图
  videoPrompt?: string          // 视频提示词
  videoUrl?: string | null      // 视频
  bindings?: LxtFinalFilmRowBindings // 资产绑定关系（引用）
}

export interface LxtFinalFilmContent {
  version: number
  rows: LxtFinalFilmRow[]
}

export function createEmptyFinalFilmContent(): LxtFinalFilmContent {
  return { version: FINAL_FILM_CONTENT_VERSION, rows: [] }
}

/**
 * 解析 finalFilmContent（字符串 → 结构化），容错：
 * - null/空 → 返回空结构
 * - 解析失败 → 返回空结构
 * - 版本不匹配 → 尝试兜底保留 rows
 */
export function parseFinalFilmContent(raw?: string | null): LxtFinalFilmContent {
  if (!raw) return createEmptyFinalFilmContent()
  try {
    const parsed = JSON.parse(raw) as Partial<LxtFinalFilmContent>
    const rows = Array.isArray(parsed.rows)
      ? parsed.rows.map(normalizeRow).filter((r): r is LxtFinalFilmRow => r !== null)
      : []
    return { version: FINAL_FILM_CONTENT_VERSION, rows }
  } catch {
    return createEmptyFinalFilmContent()
  }
}

export function serializeFinalFilmContent(content: LxtFinalFilmContent): string {
  return JSON.stringify(content)
}

function normalizeRow(row: unknown): LxtFinalFilmRow | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const shotIndex = typeof r.shotIndex === 'number' ? r.shotIndex : null
  if (shotIndex === null) return null
  return {
    shotIndex,
    label: typeof r.label === 'string' ? r.label : undefined,
    copyText: typeof r.copyText === 'string' ? r.copyText : undefined,
    imagePrompt: typeof r.imagePrompt === 'string' ? r.imagePrompt : undefined,
    imageUrl: typeof r.imageUrl === 'string' ? r.imageUrl : null,
    videoEndFrameUrl: typeof r.videoEndFrameUrl === 'string' ? r.videoEndFrameUrl : null,
    videoPrompt: typeof r.videoPrompt === 'string' ? r.videoPrompt : undefined,
    videoUrl: typeof r.videoUrl === 'string' ? r.videoUrl : null,
    bindings: normalizeBindings(r.bindings),
  }
}

function normalizeBindings(raw: unknown): LxtFinalFilmRowBindings | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const b = raw as Record<string, unknown>
  const characterAssetIds = Array.isArray(b.characterAssetIds)
    ? b.characterAssetIds.filter((x): x is string => typeof x === 'string')
    : []
  const sceneAssetId = typeof b.sceneAssetId === 'string' ? b.sceneAssetId : null
  const propAssetIds = Array.isArray(b.propAssetIds)
    ? b.propAssetIds.filter((x): x is string => typeof x === 'string')
    : []
  return { characterAssetIds, sceneAssetId, propAssetIds }
}

/**
 * 基于分镜脚本文本派生行骨架。
 * - 以 parseLxtShots 为唯一解析入口
 * - 仅填充 shotIndex / label，其它字段留空由用户填写
 */
export function deriveRowsFromShotList(shotListContent: string | null | undefined): LxtFinalFilmRow[] {
  const shots = parseLxtShots(shotListContent ?? '')
  return shots.map((shot) => ({
    shotIndex: shot.index,
    label: shot.label,
    copyText: '',
    imagePrompt: '',
    imageUrl: null,
    videoEndFrameUrl: null,
    videoPrompt: '',
    videoUrl: null,
    bindings: { characterAssetIds: [], sceneAssetId: null, propAssetIds: [] },
  }))
}

/**
 * 与已有行数据 reconcile：
 * - 保留已有行的字段
 * - 按 shotIndex 合并新的骨架（补齐缺失 label）
 * - 返回按 shotIndex 升序
 */
export function reconcileRowsWithShotList(
  existing: LxtFinalFilmRow[],
  shotListContent: string | null | undefined,
): LxtFinalFilmRow[] {
  const skeleton = deriveRowsFromShotList(shotListContent)
  if (skeleton.length === 0 && existing.length === 0) return []
  const byIndex = new Map<number, LxtFinalFilmRow>()
  for (const row of existing) byIndex.set(row.shotIndex, row)
  for (const sk of skeleton) {
    const prev = byIndex.get(sk.shotIndex)
    byIndex.set(sk.shotIndex, prev ? { ...sk, ...prev, label: prev.label ?? sk.label } : sk)
  }
  return Array.from(byIndex.values()).sort((a, b) => a.shotIndex - b.shotIndex)
}

/**
 * 行级字段 patch：将 patch 合并到指定 shotIndex 的行（若不存在则新建）
 */
export function applyRowPatch(
  content: LxtFinalFilmContent,
  shotIndex: number,
  patch: Partial<LxtFinalFilmRow>,
): LxtFinalFilmContent {
  const rows = [...content.rows]
  const idx = rows.findIndex((r) => r.shotIndex === shotIndex)
  if (idx >= 0) {
    rows[idx] = mergeRow(rows[idx], patch)
  } else {
    rows.push(mergeRow({ shotIndex }, patch))
    rows.sort((a, b) => a.shotIndex - b.shotIndex)
  }
  return { version: FINAL_FILM_CONTENT_VERSION, rows }
}

function mergeRow(base: LxtFinalFilmRow, patch: Partial<LxtFinalFilmRow>): LxtFinalFilmRow {
  const next: LxtFinalFilmRow = { ...base, ...patch, shotIndex: base.shotIndex }
  if (patch.bindings) {
    next.bindings = {
      characterAssetIds: patch.bindings.characterAssetIds ?? base.bindings?.characterAssetIds ?? [],
      sceneAssetId:
        patch.bindings.sceneAssetId !== undefined
          ? patch.bindings.sceneAssetId
          : base.bindings?.sceneAssetId ?? null,
      propAssetIds:
        patch.bindings.propAssetIds !== undefined
          ? patch.bindings.propAssetIds
          : base.bindings?.propAssetIds ?? [],
    }
  }
  return next
}

/**
 * 成片行任务 target 规范
 */
export const FINAL_FILM_TARGET_TYPE = 'lxt_final_film_panel' as const

export function buildFinalFilmTargetId(episodeId: string, shotIndex: number): string {
  return `${episodeId}:${shotIndex}`
}

export function parseFinalFilmTargetId(targetId: string): { episodeId: string; shotIndex: number } | null {
  const [episodeId, idxStr] = targetId.split(':')
  const shotIndex = Number(idxStr)
  if (!episodeId || !Number.isFinite(shotIndex)) return null
  return { episodeId, shotIndex }
}
