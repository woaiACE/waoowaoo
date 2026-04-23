'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import GlassTextarea from '@/components/ui/primitives/GlassTextarea'
import { RatioSelector } from '@/components/selectors/RatioStyleSelectors'
import StyleSelectorModal from '@/components/shared/assets/character-creation/StyleSelectorModal'
import { useLxtNovelToScriptRunStream } from '@/lib/query/hooks/useLxtNovelToScriptRunStream'
import { useSetLxtVideoRatio, useSetLxtArtStyle } from '@/lib/query/hooks/useLxtFinalFilm'
import { apiFetch } from '@/lib/api-fetch'
import { readApiErrorMessage } from '@/lib/api/read-error-message'
import { parseFinalFilmContent, DEFAULT_VIDEO_RATIO, DEFAULT_ART_STYLE } from '@/lib/lxt/final-film'
import { VIDEO_RATIOS } from '@/lib/constants'
import { getStyleConfigById } from '@/lib/style-categories'
import type { StyleItem } from '@/lib/style-categories'
import { useLxtWorkspaceEpisodeStageData } from '../hooks/useLxtWorkspaceEpisodeStageData'
import { useLxtWorkspaceProvider } from '../LxtWorkspaceProvider'
import { useLxtWorkspaceStageRuntime } from '../LxtWorkspaceStageRuntimeContext'
import { queryKeys } from '@/lib/query/keys'

/**
 * LXT 剧本模式 Stage — 在 workspace 内运行
 *
 * 从 episode.novelText 读取输入   → AI 流式生成剧本
 * 右侧分为上下两栏：上半 reasoning（思考过程）、下半 text（最终剧本）
 * 结果同步保存到 episode.srtContent
 */
export default function LxtScriptStage() {
  const t = useTranslations('lxtScript')
  const tc = useTranslations('common')
  const locale = useLocale()
  const params = useParams<{ projectId: string }>()
  const projectId = params?.projectId ?? ''

  const { episodeId, onRefresh } = useLxtWorkspaceProvider()
  const runtime = useLxtWorkspaceStageRuntime()
  const { novelText, episodeName, srtContent, finalFilmContent } = useLxtWorkspaceEpisodeStageData()
  const queryClient = useQueryClient()

  // 比例 & 画风（从 finalFilmContent 读取，fallback 到默认值）
  const parsedFinalFilm = parseFinalFilmContent(finalFilmContent)
  const currentVideoRatio = parsedFinalFilm.videoRatio ?? DEFAULT_VIDEO_RATIO
  const currentArtStyle = parsedFinalFilm.artStyle ?? DEFAULT_ART_STYLE
  const setVideoRatioMutation = useSetLxtVideoRatio(projectId, episodeId ?? null)
  const setArtStyleMutation = useSetLxtArtStyle(projectId, episodeId ?? null)
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false)
  const currentStyleConfig = getStyleConfigById(currentArtStyle)

  // 原文内联编辑状态
  const [novelTextDraft, setNovelTextDraft] = useState(novelText || '')
  const [isSavingNovelText, setIsSavingNovelText] = useState(false)
  const [novelTextError, setNovelTextError] = useState<string | null>(null)

  // 服务端数据加载后同步初始 draft（仅首次有值时）
  const didInitNovelText = useRef(false)
  useEffect(() => {
    if (!didInitNovelText.current && novelText) {
      didInitNovelText.current = true
      setNovelTextDraft(novelText)
    }
  }, [novelText])

  const novelTextDirty = novelTextDraft !== (novelText || '')

  const [instruction, setInstruction] = useState('')
  // 用户手动编辑标记
  const [editedScript, setEditedScript] = useState<string | null>(null)

  // 自动滚动 refs
  const reasoningRef = useRef<HTMLTextAreaElement>(null)
  const scriptRef = useRef<HTMLTextAreaElement>(null)

  const stream = useLxtNovelToScriptRunStream({ projectId, episodeId: episodeId ?? null })

  // 任务完成时刷新数据
  const prevStatusRef = useRef<string>('idle')
  useEffect(() => {
    const status = stream.status
    if (prevStatusRef.current !== status) {
      prevStatusRef.current = status
      if (status === 'completed') {
        setEditedScript(null)
        void onRefresh({ scope: 'all' })
      }
    }
  }, [stream.status, onRefresh])

  // 从 stream step 读取实时文本
  const activeStep = stream.orderedSteps.find((s) => s.id === 'lxt_novel_to_script') ?? stream.orderedSteps[0]
  const streamReasoning = activeStep?.reasoningOutput ?? ''
  const streamScriptText = activeStep?.textOutput ?? ''

  // 自动滚动 reasoning
  useEffect(() => {
    const el = reasoningRef.current
    if (el && streamReasoning) el.scrollTop = el.scrollHeight
  }, [streamReasoning])

  // 自动滚动 script
  useEffect(() => {
    const el = scriptRef.current
    if (el && streamScriptText) el.scrollTop = el.scrollHeight
  }, [streamScriptText])

  const isGenerating = stream.isRunning || stream.isRecoveredRunning || stream.status === 'running'

  // 展示文本：运行时用流式输出，否则用 DB 中的 srtContent（或用户编辑）
  const reasoning = isGenerating ? streamReasoning : ''
  const scriptText = isGenerating ? streamScriptText : (editedScript ?? srtContent ?? '')

  const handleSaveNovelText = useCallback(async () => {
    if (!projectId || !episodeId) return
    setIsSavingNovelText(true)
    setNovelTextError(null)
    try {
      const res = await apiFetch(`/api/lxt/${projectId}/episodes/${episodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ novelText: novelTextDraft }),
      })
      if (!res.ok) throw new Error(await readApiErrorMessage(res, tc('saveFailed')))
      queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) })
      queryClient.invalidateQueries({ queryKey: ['lxtEpisodeData', projectId, episodeId] })
    } catch (err) {
      setNovelTextError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSavingNovelText(false)
    }
  }, [projectId, episodeId, novelTextDraft, queryClient, tc])

  const handleGenerate = useCallback(async () => {
    if (!projectId || !episodeId || !novelText?.trim() || isGenerating) return
    setEditedScript(null)
    stream.reset()
    await stream.run({ episodeId, instruction: instruction || undefined, locale })
  }, [projectId, episodeId, novelText, isGenerating, instruction, locale, stream])

  const handleReanalyze = useCallback(async () => {
    if (!window.confirm(t('stage.reanalyzeConfirm'))) return
    if (!projectId || !episodeId || isGenerating) return
    try {
      const res = await apiFetch(`/api/lxt/${projectId}/episodes/${episodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ srtContent: null }),
      })
      if (!res.ok) throw new Error(await readApiErrorMessage(res, tc('saveFailed')))
      queryClient.invalidateQueries({ queryKey: ['lxtEpisodeData', projectId, episodeId] })
      setEditedScript(null)
    } catch (err) {
      setNovelTextError(err instanceof Error ? err.message : String(err))
      return
    }
    await handleGenerate()
  }, [projectId, episodeId, isGenerating, handleGenerate, queryClient, t, tc])

  const hasNovelText = !!novelText?.trim()

  return (
    <div className="flex flex-col gap-6">
      {/* 标题 & 状态 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--glass-text-primary)]">
            {t('stage.title')}
          </h2>
          <p className="text-sm text-[var(--glass-text-secondary)] mt-1">
            {episodeName ? `${episodeName} — ` : ''}{t('stage.description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!!srtContent?.trim() && !isGenerating && (
            <button
              type="button"
              onClick={() => void handleReanalyze()}
              className="glass-btn-base glass-btn-secondary h-9 px-4 text-sm font-medium"
            >
              {t('stage.reanalyzeBtn')}
            </button>
          )}
          <button
            type="button"
            disabled={!hasNovelText || isGenerating}
            onClick={handleGenerate}
            className="glass-btn-base glass-btn-primary h-9 px-5 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isGenerating ? t('stage.generating') : t('stage.generateBtn')}
          </button>
        </div>
      </div>

      {stream.status === 'failed' && stream.errorMessage && (
        <div className="glass-surface p-3 text-sm text-[var(--glass-tone-danger-fg)] border border-[var(--glass-tone-danger-stroke)]">
          {stream.errorMessage}
        </div>
      )}

      {/* 双栏面板：左原文 / 右上思考 + 右下剧本 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 左: 原文 (可内联编辑) */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--glass-text-secondary)] uppercase tracking-wide">
              {t('stage.originalLabel')}
            </span>
            {novelTextDirty && (
              <button
                type="button"
                onClick={() => void handleSaveNovelText()}
                disabled={isSavingNovelText}
                className="glass-btn-base glass-btn-primary h-6 px-3 text-xs disabled:opacity-40"
              >
                {isSavingNovelText ? tc('loading') : tc('save')}
              </button>
            )}
          </div>
          {novelTextError && (
            <p className="text-xs text-[var(--glass-tone-danger-fg)]">{novelTextError}</p>
          )}
          <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] overflow-hidden">
            <GlassTextarea
              value={novelTextDraft}
              onChange={(e) => setNovelTextDraft(e.target.value)}
              placeholder={t('stage.noNovelText')}
              className="w-full min-h-[560px] !border-0 !bg-transparent !rounded-none"
            />
          </div>
        </div>

        {/* 右: 思考 + 剧本 */}
        <div className="flex flex-col gap-3">
          {/* 右上: 思考过程 */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-[var(--glass-text-tertiary)] uppercase tracking-wide">
              {t('stage.reasoningLabel')}
            </span>
            <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] overflow-hidden">
              <GlassTextarea
                ref={reasoningRef}
                readOnly
                value={reasoning}
                placeholder={t('stage.reasoningPlaceholder')}
                className="w-full min-h-[160px] max-h-[200px] !border-0 !bg-transparent !rounded-none text-xs opacity-60"
              />
            </div>
          </div>

          {/* 右下: 最终剧本 */}
          <div className="flex flex-col gap-1 flex-1">
            <span className="text-xs font-semibold text-[var(--glass-accent)] uppercase tracking-wide">
              {t('stage.scriptLabel')}
            </span>
            <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] overflow-hidden ring-1 ring-[var(--glass-accent)]/20">
              <GlassTextarea
                ref={scriptRef}
                value={scriptText}
                onChange={(e) => setEditedScript(e.target.value)}
                placeholder={t('stage.scriptPlaceholder')}
                readOnly={isGenerating}
                className="w-full min-h-[360px] !border-0 !bg-transparent !rounded-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 附加指令 */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-[var(--glass-text-secondary)] uppercase tracking-wide">
          {t('stage.instructionLabel')}
        </label>
        <GlassTextarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={t('stage.instructionPlaceholder')}
          className="w-full min-h-[60px]"
        />
      </div>

      {/* 生成设置：比例 + 画风 */}
      <div className="glass-surface p-4 flex flex-col gap-4">
        <span className="text-xs font-semibold text-[var(--glass-text-secondary)] uppercase tracking-wide">
          {t('stage.generationSettings')}
        </span>

        <div className="flex flex-wrap items-start gap-6">
          {/* 图片/视频比例 */}
          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <span className="text-xs text-[var(--glass-text-tertiary)]">
              {t('stage.videoRatioLabel')}
            </span>
            <div className="w-[160px]">
              <RatioSelector
                value={currentVideoRatio}
                onChange={(value) => {
                  void setVideoRatioMutation.mutateAsync({ videoRatio: value })
                }}
                options={VIDEO_RATIOS.map((option) => ({
                  ...option,
                  recommended: option.value === '9:16',
                }))}
              />
            </div>
          </div>

          {/* 画风选择 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--glass-text-tertiary)]">
              {t('stage.artStyleLabel')}
            </span>
            <button
              type="button"
              onClick={() => setIsStyleModalOpen(true)}
              className="glass-input-base flex h-10 items-center gap-2.5 px-3 transition-colors cursor-pointer hover:border-[var(--glass-stroke-strong)]"
            >
              <span className="w-5 h-5 rounded-md bg-[var(--glass-accent-from)]/10 flex items-center justify-center text-[11px] font-bold text-[var(--glass-accent-from)] flex-shrink-0">
                {currentStyleConfig.name[0]}
              </span>
              <span className="text-[13px] font-medium text-[var(--glass-text-primary)] truncate max-w-[140px]">
                {currentStyleConfig.name}
              </span>
              <span className="ml-auto text-[var(--glass-text-tertiary)]">▾</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-[var(--glass-text-tertiary)]">
          {t('stage.generationSettingsHint')}
        </p>
      </div>

      <StyleSelectorModal
        open={isStyleModalOpen}
        currentStyleId={currentArtStyle}
        onSelect={(style: StyleItem) => {
          void setArtStyleMutation.mutateAsync({ artStyle: style.id })
          setIsStyleModalOpen(false)
        }}
        onClose={() => setIsStyleModalOpen(false)}
      />

      {/* 无原文提示 */}
      {!hasNovelText && (
        <div className="glass-surface p-4 text-center">
          <p className="text-sm text-[var(--glass-text-secondary)]">
            {t('stage.noNovelTextHint')}
          </p>
          <button
            type="button"
            onClick={() => runtime.onStageChange('lxt-script')}
            className="glass-btn-base glass-btn-secondary h-8 px-4 text-xs mt-3"
          >
            {t('stage.goToStoryStage')}
          </button>
        </div>
      )}

      {/* 下一步按鈕 */}
      {!isGenerating && !!scriptText && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => runtime.onStageChange('lxt-storyboard')}
            className="glass-btn-base glass-btn-primary h-9 px-6 text-sm font-medium"
          >
            {t('stage.nextStepBtn')}
          </button>
        </div>
      )}
    </div>
  )
}
