'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { apiFetch } from '@/lib/api-fetch'
import GlassTextarea from '@/components/ui/primitives/GlassTextarea'
import { useLxtWorkspaceEpisodeStageData } from '../hooks/useLxtWorkspaceEpisodeStageData'
import { useLxtWorkspaceProvider } from '../LxtWorkspaceProvider'
import { useLxtWorkspaceStageRuntime } from '../LxtWorkspaceStageRuntimeContext'

/**
 * LXT 分镜模式 Stage — 在 workspace 内运行
 *
 * 从 episode.srtContent 读取输入（Step2 剧本）→ AI 流式生成分镜脚本
 * 右侧分为上下两栏：上半 reasoning（思考过程）、下半 text（分镜输出）
 * 结果同步保存到 episode.shotListContent
 */
export default function LxtStoryboardStage() {
  const t = useTranslations('lxtScript')
  const locale = useLocale()
  const params = useParams<{ projectId: string }>()
  const projectId = params?.projectId ?? ''

  const { episodeId, onRefresh } = useLxtWorkspaceProvider()
  const runtime = useLxtWorkspaceStageRuntime()
  const { episodeName, srtContent, shotListContent } = useLxtWorkspaceEpisodeStageData()

  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 流式输出状态
  const [reasoning, setReasoning] = useState('')
  const [storyboardText, setStoryboardText] = useState(shotListContent || '')
  // 用户手动编辑标记
  const [editedStoryboard, setEditedStoryboard] = useState<string | null>(null)

  // 自动滚动 refs
  const reasoningRef = useRef<HTMLTextAreaElement>(null)
  const storyboardRef = useRef<HTMLTextAreaElement>(null)
  // AbortController for SSE stream cleanup
  const abortRef = useRef<AbortController | null>(null)

  // 组件卸载时取消进行中的流式请求
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  // SSE 刷新后同步 shotListContent
  useEffect(() => {
    if (shotListContent && editedStoryboard === null && !isGenerating) {
      setStoryboardText(shotListContent)
    }
  }, [shotListContent, editedStoryboard, isGenerating])

  const handleGenerate = useCallback(async () => {
    if (!projectId || !episodeId || !srtContent?.trim() || isGenerating) return

    // 取消任何进行中的流请求
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setIsGenerating(true)
    setError(null)
    setReasoning('')
    setStoryboardText('')
    setEditedStoryboard(null)

    try {
      const res = await apiFetch('/api/lxt-script/generate-storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, episodeId, locale }),
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
              requestAnimationFrame(() => {
                const el = reasoningRef.current
                if (el) el.scrollTop = el.scrollHeight
              })
            } else if (event.kind === 'text' && event.delta) {
              setStoryboardText((prev) => prev + event.delta)
              requestAnimationFrame(() => {
                const el = storyboardRef.current
                if (el) el.scrollTop = el.scrollHeight
              })
            } else if (event.kind === 'error') {
              throw new Error(event.message || 'Unknown error')
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue
            throw parseErr
          }
        }
      }

      await onRefresh({ scope: 'all' })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsGenerating(false)
    }
  }, [projectId, episodeId, srtContent, locale, isGenerating, onRefresh])

  const hasScript = !!srtContent?.trim()

  return (
    <div className="flex flex-col gap-6">
      {/* 标题 & 状态 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--glass-text-primary)]">
            {t('storyboard.title')}
          </h2>
          <p className="text-sm text-[var(--glass-text-secondary)] mt-1">
            {episodeName ? `${episodeName} — ` : ''}{t('storyboard.description')}
          </p>
        </div>
        <button
          type="button"
          disabled={!hasScript || isGenerating}
          onClick={handleGenerate}
          className="glass-btn-base glass-btn-primary h-9 px-5 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isGenerating ? t('storyboard.generating') : t('storyboard.generateButton')}
        </button>
      </div>

      {error && (
        <div className="glass-surface p-3 text-sm text-[var(--glass-tone-danger-fg)] border border-[var(--glass-tone-danger-stroke)]">
          {error}
        </div>
      )}

      {/* 双栏面板：左剧本 / 右上思考 + 右下分镜 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 左: 剧本 */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-[var(--glass-text-secondary)] uppercase tracking-wide">
            {t('storyboard.scriptLabel')}
          </span>
          <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] overflow-hidden">
            <GlassTextarea
              readOnly
              value={srtContent || ''}
              placeholder={t('storyboard.scriptPlaceholder')}
              className="w-full min-h-[560px] !border-0 !bg-transparent !rounded-none opacity-70"
            />
          </div>
        </div>

        {/* 右: 思考 + 分镜 */}
        <div className="flex flex-col gap-3">
          {/* 右上: 思考过程 */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-[var(--glass-text-tertiary)] uppercase tracking-wide">
              {t('storyboard.reasoningLabel')}
            </span>
            <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] overflow-hidden">
              <GlassTextarea
                ref={reasoningRef}
                readOnly
                value={reasoning}
                placeholder={t('storyboard.reasoningPlaceholder')}
                className="w-full min-h-[160px] max-h-[200px] !border-0 !bg-transparent !rounded-none text-xs opacity-60"
              />
            </div>
          </div>

          {/* 右下: 分镜输出 */}
          <div className="flex flex-col gap-1 flex-1">
            <span className="text-xs font-semibold text-[var(--glass-accent)] uppercase tracking-wide">
              {t('storyboard.outputLabel')}
            </span>
            <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] overflow-hidden ring-1 ring-[var(--glass-accent)]/20">
              <GlassTextarea
                ref={storyboardRef}
                value={editedStoryboard ?? storyboardText}
                onChange={(e) => setEditedStoryboard(e.target.value)}
                placeholder={t('storyboard.outputPlaceholder')}
                readOnly={isGenerating}
                className="w-full min-h-[360px] !border-0 !bg-transparent !rounded-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 无剧本提示 */}
      {!hasScript && (
        <div className="glass-surface p-4 text-center">
          <p className="text-sm text-[var(--glass-text-secondary)]">
            {t('storyboard.noScript')}
          </p>
          <button
            type="button"
            onClick={() => runtime.onStageChange('lxt-script')}
            className="glass-btn-base glass-btn-secondary h-8 px-4 text-xs mt-3"
          >
            {t('storyboard.goToScriptStage')}
          </button>
        </div>
      )}

      {/* 下一步按鈕 */}
      {!isGenerating && !!(editedStoryboard ?? storyboardText) && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => runtime.onStageChange('lxt-assets')}
            className="glass-btn-base glass-btn-primary h-9 px-6 text-sm font-medium"
          >
            {t('storyboard.nextStepBtn')}
          </button>
        </div>
      )}
    </div>
  )
}
