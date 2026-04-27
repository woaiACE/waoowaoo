'use client'

import { AppIcon } from '@/components/ui/icons'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import { parseProfileData } from '@/types/character-profile'
import { useLxtWorkspaceProvider } from '../LxtWorkspaceProvider'
import { useLxtWorkspaceEpisodeStageData } from '../hooks/useLxtWorkspaceEpisodeStageData'
import {
  parseFinalFilmContent,
  reconcileRowsWithShotList,
  FINAL_FILM_TARGET_TYPE,
  buildFinalFilmTargetId,
  resolveGridPromptPrefix,
  type LxtFinalFilmRow,
  type LxtFinalFilmImageSet,
} from '@/lib/lxt/final-film'
import { useLxtAssets, type LxtProjectAsset } from '@/lib/query/hooks/useLxtAssets'
import {
  usePatchLxtFinalFilmRow,
  useReconcileLxtFinalFilm,
  useGenerateLxtFinalFilmImage,
  useGenerateLxtFinalFilmVideo,
  useAutoFillLxtFinalFilm,
} from '@/lib/query/hooks/useLxtFinalFilm'
import { useTaskTargetStateMap, type TaskTargetState } from '@/lib/query/hooks/useTaskTargetStateMap'

/**
 * LXT 成片 Stage
 *
 * 基础版交付：
 *  - 每分镜一行卡片（copyText / imagePrompt / imageUrl / videoEndFrameUrl / videoPrompt / videoUrl）
 *  - LXT 资产库出厂角色/场景绑定
 *  - 行级任务状态覆盖（image / video 独立 targetId）
 */
export default function LxtFinalFilmStage() {
  const t = useTranslations('lxtWorkspace.finalFilm')
  const { projectId, episodeId } = useLxtWorkspaceProvider()
  const { shotListContent, finalFilmContent } = useLxtWorkspaceEpisodeStageData()

  const { data: assets } = useLxtAssets(projectId)
  const characterAssets = useMemo(
    () => (assets?.assets || []).filter((a) => a.kind === 'character'),
    [assets],
  )
  const sceneAssets = useMemo(
    () => (assets?.assets || []).filter((a) => a.kind === 'location'),
    [assets],
  )
  const propAssets = useMemo(
    () => (assets?.assets || []).filter((a) => a.kind === 'prop'),
    [assets],
  )
  const assetById = useMemo(() => {
    const map = new Map<string, LxtProjectAsset>()
    for (const a of assets?.assets || []) map.set(a.id, a)
    return map
  }, [assets])

  // 解析后与分镜脚本做一次前端 reconcile，保证 UI 呈现所有分镜行（不写库）
  const rows = useMemo(() => {
    const parsed = parseFinalFilmContent(finalFilmContent)
    return reconcileRowsWithShotList(parsed.rows, shotListContent)
  }, [finalFilmContent, shotListContent])

  const targets = useMemo(
    () =>
      rows.map((row) => ({
        targetType: FINAL_FILM_TARGET_TYPE,
        targetId: buildFinalFilmTargetId(episodeId || '', row.shotIndex),
      })),
    [rows, episodeId],
  )
  const { getState } = useTaskTargetStateMap(projectId, targets, { enabled: !!episodeId })

  // 任务完成自动失效 episode 缓存：当任一行的 phase 从 queued/processing → 其它时，
  // 认为 worker 已落库新的 imageUrl/videoUrl，触发一次 episode 数据刷新。
  const qc = useQueryClient()
  const prevPhaseRef = useRef<Map<string, TaskTargetState['phase']>>(new Map())
  useEffect(() => {
    if (!episodeId) return
    const prev = prevPhaseRef.current
    const next = new Map<string, TaskTargetState['phase']>()
    let shouldInvalidate = false
    for (const row of rows) {
      const key = buildFinalFilmTargetId(episodeId, row.shotIndex)
      const state = getState(FINAL_FILM_TARGET_TYPE, key)
      const phase = state?.phase ?? 'idle'
      next.set(key, phase)
      const previous = prev.get(key)
      if (
        previous &&
        (previous === 'queued' || previous === 'processing') &&
        phase !== 'queued' &&
        phase !== 'processing'
      ) {
        shouldInvalidate = true
      }
    }
    prevPhaseRef.current = next
    if (shouldInvalidate) {
      void qc.invalidateQueries({ queryKey: ['lxtEpisodeData', projectId, episodeId] })
    }
  }, [rows, episodeId, projectId, getState, qc])

  const reconcileMutation = useReconcileLxtFinalFilm(projectId, episodeId || null)
  const autoFillMutation = useAutoFillLxtFinalFilm(projectId, episodeId || null)

  // 四宫格提示前缀（从 finalFilmContent 顶层读取，可配置）
  const parsedContent = useMemo(() => parseFinalFilmContent(finalFilmContent), [finalFilmContent])
  const [gridPromptPrefix, setGridPromptPrefix] = useState(
    parsedContent.gridPromptPrefix ?? '',
  )
  useEffect(() => {
    setGridPromptPrefix(parsedContent.gridPromptPrefix ?? '')
  }, [parsedContent.gridPromptPrefix])

  const saveGridPromptPrefix = useCallback(
    async (prefix: string) => {
      if (!projectId || !episodeId) return
      await apiFetch(`/api/lxt/${projectId}/final-film/${episodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setGridPromptPrefix: prefix }),
      })
    },
    [projectId, episodeId],
  )

  const handleReanalyze = useCallback(async () => {
    if (!window.confirm(t('reanalyzeConfirm'))) return
    if (!projectId || !episodeId) return
    await apiFetch(`/api/lxt/${projectId}/episodes/${episodeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finalFilmContent: null }),
    })
    qc.invalidateQueries({ queryKey: ['lxtEpisodeData', projectId, episodeId] })
  }, [projectId, episodeId, qc, t])

  if (!episodeId) {
    return (
      <div className="glass-surface p-6 text-sm text-[var(--glass-text-secondary)]">
        {t('noRows')}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="glass-surface p-6 flex flex-col items-center gap-3">
        <p className="text-sm text-[var(--glass-text-secondary)]">{t('noRows')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 四宫格提示前缀配置栏 */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-[var(--glass-text-tertiary)] shrink-0 whitespace-nowrap">
          {t('gridPromptPrefixLabel')}
        </span>
        <input
          type="text"
          value={gridPromptPrefix}
          onChange={(e) => setGridPromptPrefix(e.target.value)}
          onBlur={(e) => void saveGridPromptPrefix(e.target.value)}
          className="glass-field-input text-xs px-2 h-7 flex-1"
          placeholder={resolveGridPromptPrefix(parsedContent.artStyle)}
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => void handleReanalyze()}
          className="glass-btn-base glass-btn-secondary h-8 px-3 text-xs"
        >
          {t('reanalyzeBtn')}
        </button>
        <button
          type="button"
          onClick={() => autoFillMutation.mutate()}
          disabled={autoFillMutation.isPending}
          className="glass-btn-base glass-btn-primary h-8 px-3 text-xs disabled:opacity-40"
        >
          {autoFillMutation.isPending ? '…' : t('autoFill')}
        </button>
        <button
          type="button"
          onClick={() => reconcileMutation.mutate()}
          disabled={reconcileMutation.isPending}
          className="glass-btn-base glass-btn-secondary h-8 px-3 text-xs disabled:opacity-40"
        >
          {reconcileMutation.isPending ? '…' : t('reconcile')}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <FinalFilmRow
            key={row.shotIndex}
            row={row}
            projectId={projectId}
            episodeId={episodeId}
            assetById={assetById}
            characters={characterAssets}
            scenes={sceneAssets}
            props={propAssets}
            taskState={getState(
              FINAL_FILM_TARGET_TYPE,
              buildFinalFilmTargetId(episodeId, row.shotIndex),
            )}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Row ───────────────────────────────────────────────────────────

interface FinalFilmRowProps {
  row: LxtFinalFilmRow
  projectId: string
  episodeId: string
  assetById: Map<string, LxtProjectAsset>
  characters: LxtProjectAsset[]
  scenes: LxtProjectAsset[]
  props: LxtProjectAsset[]
  taskState: TaskTargetState | null
}

function FinalFilmRow({
  row,
  projectId,
  episodeId,
  assetById,
  characters,
  scenes,
  props,
  taskState,
}: FinalFilmRowProps) {
  const t = useTranslations('lxtWorkspace.finalFilm')
  const [copyText, setCopyText] = useState(row.copyText ?? '')
  const [imagePrompt, setImagePrompt] = useState(row.imagePrompt ?? '')
  const [videoPrompt, setVideoPrompt] = useState(row.videoPrompt ?? '')
  const [bindingOpen, setBindingOpen] = useState(false)

  useEffect(() => { setCopyText(row.copyText ?? '') }, [row.copyText])
  useEffect(() => { setImagePrompt(row.imagePrompt ?? '') }, [row.imagePrompt])
  useEffect(() => { setVideoPrompt(row.videoPrompt ?? '') }, [row.videoPrompt])

  const patchRow = usePatchLxtFinalFilmRow(projectId, episodeId)
  const genImage = useGenerateLxtFinalFilmImage(projectId, episodeId)
  const genVideo = useGenerateLxtFinalFilmVideo(projectId, episodeId)

  const [activeSetIndex, setActiveSetIndex] = useState<number | null>(null)

  // 根据选中的套图计算尾帧 URL
  const imageSets = row.imageSets
  const activeSet = activeSetIndex !== null && Array.isArray(imageSets)
    ? (imageSets[activeSetIndex] ?? null)
    : null
  const activeVideoEndFrameUrl = activeSet?.videoEndFrameUrl ?? row.videoEndFrameUrl

  const savePatch = (patch: Partial<LxtFinalFilmRow>) => {
    patchRow.mutate({ shotIndex: row.shotIndex, patch })
  }

  // 当前正在保存的字段名（patchRow 同一时间只处理一个 patch）
  const savingField = patchRow.isPending
    ? (Object.keys(patchRow.variables?.patch || {})[0] as keyof LxtFinalFilmRow | undefined)
    : undefined

  const boundCharacterIds = row.bindings?.characterAssetIds ?? []
  const boundSceneId = row.bindings?.sceneAssetId ?? null
  const boundPropIds = row.bindings?.propAssetIds ?? []

  const taskBusy = taskState?.phase === 'queued' || taskState?.phase === 'processing'
  const taskPhaseLabel =
    taskState?.phase === 'queued' ? t('pending')
    : taskState?.phase === 'processing' ? t('processing')
    : taskState?.phase === 'failed' ? t('failed')
    : null

  return (
    <div className="glass-surface p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-[var(--glass-bg-muted)] flex items-center justify-center text-sm font-bold text-[var(--glass-text-primary)]">
          {row.shotIndex + 1}
        </div>
        <div className="flex-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[var(--glass-text-primary)]">
              {row.label || t('shotLabelFallback', { n: row.shotIndex + 1 })}
            </span>
            {row.shotType && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/25">
                {row.shotType}
              </span>
            )}
          </div>
          {taskPhaseLabel && (
            <span
              className={[
                'text-[11px] px-2 py-0.5 rounded-full',
                taskState?.phase === 'failed'
                  ? 'bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)]'
                  : 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]',
              ].join(' ')}
            >
              {taskPhaseLabel}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_minmax(0,160px)_minmax(0,160px)_minmax(0,160px)] gap-3 items-start">
        {/* 文本列 */}
        <div className="flex flex-col gap-2 min-w-0">
          <FieldArea
            label={t('copyText')}
            value={copyText}
            onChange={setCopyText}
            onBlur={() => {
              if (copyText !== (row.copyText ?? '')) savePatch({ copyText })
            }}
            savingLabel={savingField === 'copyText' ? t('saving') : null}
          />
          <FieldArea
            label={t('imagePrompt')}
            value={imagePrompt}
            onChange={setImagePrompt}
            onBlur={() => {
              if (imagePrompt !== (row.imagePrompt ?? '')) savePatch({ imagePrompt })
            }}
            savingLabel={savingField === 'imagePrompt' ? t('saving') : null}
          />
          <FieldArea
            label={t('videoPrompt')}
            value={videoPrompt}
            onChange={setVideoPrompt}
            onBlur={() => {
              if (videoPrompt !== (row.videoPrompt ?? '')) savePatch({ videoPrompt })
            }}
            savingLabel={savingField === 'videoPrompt' ? t('saving') : null}
          />
        </div>

        {/* 首帧图 */}
        <FirstFrameSlot
          label={t('imageSlot')}
          imageUrl={row.imageUrl}
          gridImageUrl={row.gridImageUrl}
          splitImageUrls={row.splitImageUrls}
          imagePrompt={imagePrompt}
          taskPhase={taskState?.phase ?? null}
          boundCharacterIds={boundCharacterIds}
          boundSceneId={boundSceneId}
          boundPropIds={boundPropIds}
          assetById={assetById}
          onGenerate={() => genImage.mutate({ shotIndex: row.shotIndex })}
          isGenerating={genImage.isPending}
          generateLabel={t('generateImage')}
          regenerateLabel={t('regenerateImage')}
          pendingLabel={t('pending')}
          processingLabel={t('processing')}
          noBindingsLabel={t('noBindings')}
          missingAssetLabel={t('missingAsset')}
          splitPanelsLabel={t('splitPanels')}
          endFrameAutoLabel={t('endFrameAuto')}
          imageSets={row.imageSets}
          activeSetIndex={activeSetIndex}
          onSelectImageSet={setActiveSetIndex}
        />

        {/* 尾帧图 */}
        <MediaSlot
          label={t('endFrameSlot')}
          imageUrl={activeVideoEndFrameUrl}
        />

        {/* 视频 */}
        <VideoSlot
          label={t('videoSlot')}
          videoUrl={row.videoUrl}
          taskBusy={taskBusy}
          taskLabel={taskPhaseLabel}
        />
      </div>

      {/* 操作按钮组 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setBindingOpen((v) => !v)}
          className="glass-btn-base glass-btn-secondary h-8 px-3 text-xs"
        >
          {t('bindAssets')}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!row.imageUrl) return
            savePatch({ videoEndFrameUrl: row.imageUrl })
          }}
          disabled={patchRow.isPending || !row.imageUrl}
          className="glass-btn-base glass-btn-secondary h-8 px-3 text-xs disabled:opacity-40"
        >
          {t('setAsEndFrame')}
        </button>
        <button
          type="button"
          onClick={() => genVideo.mutate({ shotIndex: row.shotIndex })}
          disabled={genVideo.isPending || taskBusy || !videoPrompt.trim() || !row.imageUrl}
          className="glass-btn-base glass-btn-primary h-8 px-3 text-xs disabled:opacity-40"
        >
          {t('generateVideo')}
        </button>
      </div>

      {bindingOpen && (
        <BindingPanel
          characters={characters}
          scenes={scenes}
          props={props}
          boundCharacterIds={boundCharacterIds}
          boundSceneId={boundSceneId}
          boundPropIds={boundPropIds}
          labels={{
            characters: t('bindingTitle.characters'),
            scene: t('bindingTitle.scene'),
            props: t('bindingTitle.props'),
            empty: t('emptyLibrary'),
            cancel: t('cancel'),
            save: t('save'),
          }}
          onChange={(bindings) => {
            savePatch({ bindings })
          }}
          onClose={() => setBindingOpen(false)}
        />
      )}
    </div>
  )
}

// ─── Subcomponents ─────────────────────────────────────────────────

function FieldArea(props: {
  label: string
  value: string
  onChange: (v: string) => void
  onBlur: () => void
  savingLabel?: string | null
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-[var(--glass-text-tertiary)] uppercase tracking-wider flex items-center justify-between gap-2">
        <span>{props.label}</span>
        {props.savingLabel && (
          <span className="text-[10px] font-normal normal-case tracking-normal text-[var(--glass-text-tertiary)] animate-pulse">
            {props.savingLabel}
          </span>
        )}
      </span>
      <textarea
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onBlur={props.onBlur}
        className="glass-field-input text-xs p-2 min-h-[52px] resize-y"
      />
    </label>
  )
}

function FirstFrameSlot(props: {
  label: string
  imageUrl?: string | null
  gridImageUrl?: string | null
  splitImageUrls?: (string | null)[] | null
  imagePrompt?: string | null
  taskPhase?: string | null
  boundCharacterIds: string[]
  boundSceneId: string | null
  boundPropIds: string[]
  assetById: Map<string, LxtProjectAsset>
  onGenerate: () => void
  isGenerating: boolean
  generateLabel: string
  regenerateLabel: string
  pendingLabel: string
  processingLabel: string
  noBindingsLabel: string
  missingAssetLabel: string
  splitPanelsLabel: string
  endFrameAutoLabel: string
  imageSets?: LxtFinalFilmImageSet[] | null
  activeSetIndex: number | null
  onSelectImageSet: (index: number | null) => void
}) {
  const {
    imageUrl, gridImageUrl, splitImageUrls, imagePrompt, taskPhase,
    boundCharacterIds, boundSceneId, boundPropIds, assetById, imageSets,
    activeSetIndex, onSelectImageSet,
  } = props
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const taskBusy = taskPhase === 'queued' || taskPhase === 'processing'
  const canGenerate = !props.isGenerating && !taskBusy && !!imagePrompt?.trim()

  // 选中历史套图时显示历史数据
  const activeSet = activeSetIndex !== null && Array.isArray(imageSets)
    ? (imageSets[activeSetIndex] ?? null)
    : null
  const displayGridUrl = activeSet?.gridImageUrl ?? gridImageUrl
  const displaySplitUrls = activeSet?.splitImageUrls ?? splitImageUrls
  const displayImageUrl = activeSet?.gridImageUrl ?? imageUrl

  // 四宫格模式：有 splitImageUrls 时启用
  const hasSplits = Array.isArray(displaySplitUrls) && displaySplitUrls.some((url) => url !== null)
  // 主展示图：四宫格原图优先，fallback 到 imageUrl
  const displayUrl = displayGridUrl ?? displayImageUrl
  const hasImage = !!displayUrl

  // 套图数量：imageSets 已包含当前套图，直接使用其长度
  const totalSets = Array.isArray(imageSets) && imageSets.length > 0
    ? imageSets.length
    : (hasImage ? 1 : 0)

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold text-[var(--glass-text-tertiary)] uppercase tracking-wider">
        {props.label}
      </span>

      {/* ── 主图区域 ────────────────────────────────────────── */}
      <div className="group relative aspect-square w-full rounded-lg overflow-hidden bg-[var(--glass-bg-muted)] border border-[var(--glass-stroke-base)]">
        {hasImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayUrl!}
            alt={props.label}
            className="w-full h-full object-cover cursor-pointer"
            onClick={() => setPreviewUrl(displayUrl!)}
          />
        )}

        {/* 任务进行中遮罩（含 mutation pending 状态） */}
        {(taskBusy || props.isGenerating) && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1.5">
            <AppIcon name="loader" className="w-5 h-5 text-white animate-spin" />
            <span className="text-xs text-white">
              {props.isGenerating && !taskBusy
                ? props.pendingLabel
                : taskPhase === 'queued'
                  ? props.pendingLabel
                  : props.processingLabel}
            </span>
          </div>
        )}

        {/* 居中生成按钮：无图时始终可见；有图时仅 hover 显示 */}
        {!taskBusy && !props.isGenerating && (
          <button
            type="button"
            onClick={props.onGenerate}
            disabled={!canGenerate}
            className={[
              'absolute inset-0 flex flex-col items-center justify-center gap-1 transition-all',
              hasImage
                ? 'opacity-0 group-hover:opacity-100 bg-black/40 hover:bg-black/55'
                : 'hover:bg-[var(--glass-bg-hover)]',
              !canGenerate ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
          >
            <AppIcon
              name="image"
              className={['w-7 h-7', hasImage ? 'text-white' : 'text-[var(--glass-text-secondary)]'].join(' ')}
            />
            <span className={['text-[11px] font-semibold', hasImage ? 'text-white' : 'text-[var(--glass-text-secondary)]'].join(' ')}>
              {hasImage ? props.regenerateLabel : props.generateLabel}
            </span>
          </button>
        )}
      </div>

      {/* 显式重新生成按钮：有图后也保留，避免仅靠 hover 触发 */}
      {hasImage && (
        <button
          type="button"
          onClick={props.onGenerate}
          disabled={!canGenerate}
          className="glass-btn-base glass-btn-secondary h-7 px-2.5 text-[11px] disabled:opacity-40 self-start"
        >
          {props.regenerateLabel}
        </button>
      )}

      {/* ── 四宫格分图缩略图 ────────────────────────────────── */}
      {hasSplits && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-[var(--glass-text-tertiary)]">{props.splitPanelsLabel}</span>
          <div className="grid grid-cols-2 gap-0.5">
            {displaySplitUrls!.filter((url): url is string => url !== null).slice(0, 4).map((url, i) => (
              <div
                key={i}
                className="relative aspect-square rounded overflow-hidden bg-[var(--glass-bg-muted)] cursor-pointer"
                onClick={() => setPreviewUrl(url)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`分镜${i + 1}`} className="w-full h-full object-cover" />
                {/* 右下角图（index 3）显示"尾帧"角标 */}
                {i === 3 && (
                  <span className="absolute bottom-0.5 right-0.5 text-[8px] font-bold bg-black/70 text-yellow-300 px-1 rounded leading-4">
                    {props.endFrameAutoLabel}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 套图历史指示器 ──────────────────────────────────── */}
      {totalSets > 1 && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[var(--glass-text-tertiary)] shrink-0">
            {totalSets} 套
          </span>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalSets }, (_, i) => {
              const isActive = activeSetIndex === null
                ? i === totalSets - 1 // null = 默认显示最新（最后一套）
                : i === activeSetIndex
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    // 最后一套 = 当前 row 数据（activeSetIndex = null）
                    onSelectImageSet(i === totalSets - 1 ? null : i)
                  }}
                  className={[
                    'w-5 h-5 rounded text-[9px] font-bold transition-all border',
                    isActive
                      ? 'bg-[var(--glass-accent-from)] text-white border-transparent scale-110'
                      : 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-tertiary)] border-[var(--glass-stroke-base)] hover:bg-[var(--glass-bg-hover)]',
                  ].join(' ')}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 绑定标签 ────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 min-h-[20px]">
        {boundCharacterIds.length === 0 && !boundSceneId && boundPropIds.length === 0 ? (
          <span className="text-[10px] text-[var(--glass-text-tertiary)]">
            {props.noBindingsLabel}
          </span>
        ) : (
          <>
            {boundCharacterIds.map((id) => (
              <AssetTag key={id} asset={assetById.get(id)} missingLabel={props.missingAssetLabel} />
            ))}
            {boundSceneId && (
              <AssetTag asset={assetById.get(boundSceneId)} missingLabel={props.missingAssetLabel} />
            )}
            {boundPropIds.map((id) => (
              <AssetTag key={id} asset={assetById.get(id)} missingLabel={props.missingAssetLabel} />
            ))}
          </>
        )}
      </div>

      {/* ── 图片预览弹窗 ────────────────────────────────────── */}
      {previewUrl && (
        <ImagePreviewModal imageUrl={previewUrl} onClose={() => setPreviewUrl(null)} />
      )}
    </div>
  )
}

function MediaSlot(props: { label: string; imageUrl?: string | null }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-[var(--glass-text-tertiary)] uppercase tracking-wider">
        {props.label}
      </span>
      <div className="aspect-square w-full rounded-lg overflow-hidden bg-[var(--glass-bg-muted)] border border-[var(--glass-stroke-base)] flex items-center justify-center">
        {props.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={props.imageUrl}
            alt={props.label}
            className="w-full h-full object-cover cursor-pointer"
            onClick={() => setPreviewUrl(props.imageUrl!)}
          />
        ) : (
          <span className="text-xs text-[var(--glass-text-tertiary)]">—</span>
        )}
      </div>
      {previewUrl && <ImagePreviewModal imageUrl={previewUrl} onClose={() => setPreviewUrl(null)} />}
    </div>
  )
}

function VideoSlot(props: {
  label: string
  videoUrl?: string | null
  taskBusy?: boolean
  taskLabel?: string | null
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-[var(--glass-text-tertiary)] uppercase tracking-wider">
        {props.label}
      </span>
      <div className="aspect-square w-full rounded-lg overflow-hidden bg-[var(--glass-bg-muted)] border border-[var(--glass-stroke-base)] flex items-center justify-center relative">
        {props.taskBusy ? (
          <div className="flex flex-col items-center justify-center gap-1.5">
            <AppIcon name="loader" className="w-5 h-5 text-[var(--glass-text-secondary)] animate-spin" />
            {props.taskLabel && (
              <span className="text-xs text-[var(--glass-text-secondary)]">{props.taskLabel}</span>
            )}
          </div>
        ) : props.videoUrl ? (
          <video src={props.videoUrl} controls className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-[var(--glass-text-tertiary)]">—</span>
        )}
      </div>
    </div>
  )
}

/**
 * 游戏品质分级颜色系统（与 CharacterProfileCard 保持一致）
 * S金橙 / A史诗紫 / B稀有蓝 / C精良绿 / D普通灰
 */
const CHAR_TIER_STYLES: Record<string, { gradient: string; glow: string }> = {
  S: { gradient: 'linear-gradient(135deg, #f59e0b, #ef4444)', glow: '0 2px 8px rgba(245,158,11,0.35)' },
  A: { gradient: 'linear-gradient(135deg, #a855f7, #6366f1)', glow: '0 2px 8px rgba(168,85,247,0.3)' },
  B: { gradient: 'linear-gradient(135deg, #3b82f6, #06b6d4)', glow: '0 2px 8px rgba(59,130,246,0.3)' },
  C: { gradient: 'linear-gradient(135deg, #22c55e, #10b981)', glow: '0 2px 8px rgba(34,197,94,0.25)' },
  D: { gradient: 'linear-gradient(135deg, #9ca3af, #6b7280)', glow: '0 2px 6px rgba(156,163,175,0.2)' },
}

function AssetTag(props: { asset?: LxtProjectAsset; missingLabel: string }) {
  if (!props.asset) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)]">
        {props.missingLabel}
      </span>
    )
  }

  const { asset } = props

  // ── 角色标签：复用 S/A/B/C/D 等级渐变 badge（rounded-full）──────
  if (asset.kind === 'character') {
    const profile = parseProfileData(asset.profileData ?? null)
    const roleLevel = profile?.role_level
    const tierStyle = roleLevel ? (CHAR_TIER_STYLES[roleLevel] ?? null) : null
    const gradientStyle = tierStyle
      ? { background: tierStyle.gradient, boxShadow: tierStyle.glow }
      : { background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', boxShadow: '0 2px 8px rgba(59,130,246,0.3)' }
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
        style={gradientStyle}
      >
        {asset.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.imageUrl} alt="" className="w-3.5 h-3.5 rounded-full object-cover flex-shrink-0" />
        )}
        {roleLevel && <span className="opacity-80">{roleLevel}级</span>}
        {roleLevel && <span className="opacity-50">·</span>}
        <span>{asset.name}</span>
      </span>
    )
  }

  // ── 场景标签：参考角色风格，但用 rounded-md（方角）区分 ───────────
  if (asset.kind === 'location') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border bg-emerald-600/40 text-white border-emerald-500/50">
        {asset.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.imageUrl} alt="" className="w-3.5 h-3.5 rounded object-cover flex-shrink-0" />
        )}
        <span>{asset.name}</span>
      </span>
    )
  }

  // ── 道具标签：rounded-sm ──────────────────────────────────────────
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-medium border bg-orange-500/20 text-orange-300 border-orange-500/25">
      {asset.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.imageUrl} alt="" className="w-3.5 h-3.5 rounded object-cover flex-shrink-0" />
      )}
      <span>{asset.name}</span>
    </span>
  )
}

function BindingPanel(props: {
  characters: LxtProjectAsset[]
  scenes: LxtProjectAsset[]
  props: LxtProjectAsset[]
  boundCharacterIds: string[]
  boundSceneId: string | null
  boundPropIds: string[]
  labels: {
    characters: string
    scene: string
    props: string
    empty: string
    cancel: string
    save: string
  }
  onChange: (bindings: { characterAssetIds: string[]; sceneAssetId: string | null; propAssetIds: string[] }) => void
  onClose: () => void
}) {
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>(props.boundCharacterIds)
  const [selectedScene, setSelectedScene] = useState<string | null>(props.boundSceneId)
  const [selectedProps, setSelectedProps] = useState<string[]>(props.boundPropIds)

  const toggleChar = (id: string) => {
    setSelectedCharacters((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const toggleProp = (id: string) => {
    setSelectedProps((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  return (
    <div className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-3 flex flex-col gap-3">
      <div>
        <div className="text-xs font-semibold mb-1 text-[var(--glass-text-secondary)]">{props.labels.characters}</div>
        <div className="flex flex-wrap gap-1.5">
          {props.characters.length === 0 && (
            <span className="text-xs text-[var(--glass-text-tertiary)]">{props.labels.empty}</span>
          )}
          {props.characters.map((c) => {
            const active = selectedCharacters.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleChar(c.id)}
                className={[
                  'text-xs px-2 py-1 rounded-full border transition-all',
                  active
                    ? 'bg-[var(--glass-accent-from)] text-white border-transparent'
                    : 'bg-transparent text-[var(--glass-text-secondary)] border-[var(--glass-stroke-base)] hover:bg-[var(--glass-bg-hover)]',
                ].join(' ')}
              >
                {c.name}
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold mb-1 text-[var(--glass-text-secondary)]">{props.labels.scene}</div>
        <div className="flex flex-wrap gap-1.5">
          {props.scenes.length === 0 && (
            <span className="text-xs text-[var(--glass-text-tertiary)]">{props.labels.empty}</span>
          )}
          {props.scenes.map((s) => {
            const active = selectedScene === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedScene(active ? null : s.id)}
                className={[
                  'text-xs px-2 py-1 rounded-full border transition-all',
                  active
                    ? 'bg-[var(--glass-accent-from)] text-white border-transparent'
                    : 'bg-transparent text-[var(--glass-text-secondary)] border-[var(--glass-stroke-base)] hover:bg-[var(--glass-bg-hover)]',
                ].join(' ')}
              >
                {s.name}
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold mb-1 text-[var(--glass-text-secondary)]">{props.labels.props}</div>
        <div className="flex flex-wrap gap-1.5">
          {props.props.length === 0 && (
            <span className="text-xs text-[var(--glass-text-tertiary)]">{props.labels.empty}</span>
          )}
          {props.props.map((p) => {
            const active = selectedProps.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleProp(p.id)}
                className={[
                  'text-xs px-2 py-1 rounded-full border transition-all',
                  active
                    ? 'bg-[var(--glass-accent-from)] text-white border-transparent'
                    : 'bg-transparent text-[var(--glass-text-secondary)] border-[var(--glass-stroke-base)] hover:bg-[var(--glass-bg-hover)]',
                ].join(' ')}
              >
                {p.name}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={props.onClose}
          className="glass-btn-base glass-btn-secondary h-8 px-3 text-xs"
        >
          {props.labels.cancel}
        </button>
        <button
          type="button"
          onClick={() => {
            props.onChange({
              characterAssetIds: selectedCharacters,
              sceneAssetId: selectedScene,
              propAssetIds: selectedProps,
            })
            props.onClose()
          }}
          className="glass-btn-base glass-btn-primary h-8 px-3 text-xs"
        >
          {props.labels.save}
        </button>
      </div>
    </div>
  )
}
