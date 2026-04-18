'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { apiFetch } from '@/lib/api-fetch'
import { readApiErrorMessage } from '@/lib/api/read-error-message'
import { useQueryClient } from '@tanstack/react-query'
import GlassTextarea from '@/components/ui/primitives/GlassTextarea'
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
  const { novelText, episodeName, srtContent } = useLxtWorkspaceEpisodeStageData()
  const queryClient = useQueryClient()

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
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 流式输出状态
  const [reasoning, setReasoning] = useState('')
  const [scriptText, setScriptText] = useState(srtContent || '')
  // 用户手动编辑标记
  const [editedScript, setEditedScript] = useState<string | null>(null)

  // 自动滚动 refs
  const reasoningRef = useRef<HTMLTextAreaElement>(null)
  const scriptRef = useRef<HTMLTextAreaElement>(null)
  // AbortController for SSE stream cleanup
  const abortRef = useRef<AbortController | null>(null)

  // 组件卸载时取消进行中的流式请求
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  // SSE 刷新后同步 srtContent
  useEffect(() => {
    if (srtContent && editedScript === null && !isGenerating) {
      setScriptText(srtContent)
    }
  }, [srtContent, editedScript, isGenerating])

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

    // 取消任何进行中的流请求
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setIsGenerating(true)
    setError(null)
    setReasoning('')
    setScriptText('')
    setEditedScript(null)

    try {
      const res = await apiFetch('/api/lxt-script/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, episodeId, instruction, locale }),
        signal: ctrl.signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error?.message || `HTTP ${res.status}`)
      }

      if (!res.body) throw new Error('No response body')

      // 流式消费 SSE
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        // 保留最后一个可能不完整的行
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6)
          try {
            const event = JSON.parse(jsonStr) as {
              kind: 'reasoning' | 'text' | 'done' | 'error'
              delta?: string
              message?: string
            }
            if (event.kind === 'reasoning' && event.delta) {
              setReasoning((prev) => prev + event.delta)
              // 自动滚动
              requestAnimationFrame(() => {
                const el = reasoningRef.current
                if (el) el.scrollTop = el.scrollHeight
              })
            } else if (event.kind === 'text' && event.delta) {
              setScriptText((prev) => prev + event.delta)
              requestAnimationFrame(() => {
                const el = scriptRef.current
                if (el) el.scrollTop = el.scrollHeight
              })
            } else if (event.kind === 'error') {
              throw new Error(event.message || 'Unknown error')
            }
            // 'done' — 流结束，不做特殊处理
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue
            throw parseErr
          }
        }
      }

      // 刷新 episode 数据
      await onRefresh({ scope: 'all' })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsGenerating(false)
    }
  }, [projectId, episodeId, novelText, instruction, locale, isGenerating, onRefresh])

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
        <button
          type="button"
          disabled={!hasNovelText || isGenerating}
          onClick={handleGenerate}
          className="glass-btn-base glass-btn-primary h-9 px-5 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isGenerating ? t('stage.generating') : t('stage.generateBtn')}
        </button>
      </div>

      {error && (
        <div className="glass-surface p-3 text-sm text-[var(--glass-tone-danger-fg)] border border-[var(--glass-tone-danger-stroke)]">
          {error}
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
                value={editedScript ?? scriptText}
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
      {!isGenerating && !!(editedScript ?? scriptText) && (
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
