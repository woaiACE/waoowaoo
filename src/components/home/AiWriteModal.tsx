'use client'

/**
 * AI 帮我写 — 自包含流式模态框（P1 重构）
 *
 * - 自己管理 SSE 订阅和任务生命周期（通过 useAiStoryExpandStream）
 * - 三阶段 UI：idle（输入）→ streaming（流式预览）→ completed（接受/重新生成）
 * - 支持篇幅目标、改写强度（有 sourceText 时）参数
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { STORY_REWRITE_MODES, AI_EXPAND_LENGTH_TARGETS } from '@/lib/screenplay-tone-presets'
import { useAiStoryExpandStream } from '@/lib/home/useAiStoryExpandStream'

interface AiWriteModalProps {
  open: boolean
  onClose: () => void
  /** 用户点击"接受"后回调，将生成文本回填 */
  onAccept: (text: string) => void
  /** 如果存在，表示将在此文本基础上改写，显示改写提示和改写强度控件 */
  sourceText?: string
  /** 继承自上层的剧本风格基调（当前仅传递给后端，暂不在 Modal 内提供选择器） */
  initialScreenplayTone?: string
  t: (key: string) => string
}

/** 从 AI_EXPAND_LENGTH_TARGETS 值取 i18n key（首字母大写） */
function getLengthLabel(value: string, t: (key: string) => string): string {
  const key = `length${value.charAt(0).toUpperCase()}${value.slice(1)}`
  return t(key)
}

export default function AiWriteModal({
  open,
  onClose,
  onAccept,
  sourceText,
  initialScreenplayTone = 'auto',
  t,
}: AiWriteModalProps) {
  const [promptText, setPromptText] = useState('')
  const [screenplayTone, setScreenplayTone] = useState(initialScreenplayTone)
  const [storyRewriteMode, setStoryRewriteMode] = useState('none')
  const [lengthTarget, setLengthTarget] = useState('medium')
  const outputRef = useRef<HTMLDivElement>(null)

  const { status, outputText, expandedResult, errorMessage, run, stop, reset } =
    useAiStoryExpandStream()

  // 当父级传入的 initialScreenplayTone 变化时同步
  useEffect(() => {
    setScreenplayTone(initialScreenplayTone)
  }, [initialScreenplayTone])

  // 流式/完成时自动滚到底部
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [outputText])

  const handleClose = useCallback(() => {
    if (status === 'streaming') return
    reset()
    setPromptText('')
    onClose()
  }, [status, reset, onClose])

  const handleStart = useCallback(() => {
    if (!promptText.trim() || status === 'streaming') return
    void run({
      prompt: promptText.trim(),
      screenplayTone: screenplayTone !== 'auto' ? screenplayTone : undefined,
      storyRewriteMode: storyRewriteMode !== 'none' ? storyRewriteMode : undefined,
      sourceText: sourceText || undefined,
      lengthTarget: lengthTarget !== 'medium' ? lengthTarget : undefined,
    })
  }, [promptText, status, run, screenplayTone, storyRewriteMode, sourceText, lengthTarget])

  const handleRegenerate = useCallback(() => {
    if (!promptText.trim()) return
    void run({
      prompt: promptText.trim(),
      screenplayTone: screenplayTone !== 'auto' ? screenplayTone : undefined,
      storyRewriteMode: storyRewriteMode !== 'none' ? storyRewriteMode : undefined,
      sourceText: sourceText || undefined,
      lengthTarget: lengthTarget !== 'medium' ? lengthTarget : undefined,
    })
  }, [promptText, run, screenplayTone, storyRewriteMode, sourceText, lengthTarget])

  const handleAccept = useCallback(() => {
    const text = expandedResult || outputText
    if (!text) return
    onAccept(text)
    reset()
    setPromptText('')
    onClose()
  }, [expandedResult, outputText, onAccept, reset, onClose])

  if (!open) return null

  const isOutputMode = status === 'streaming' || status === 'completed'
  const displayText = status === 'completed' ? expandedResult : outputText
  const charCount = displayText.length

  const segmentBtnClass = (active: boolean) =>
    `flex-1 rounded-lg px-1.5 py-1 text-xs font-medium transition-all border ${
      active
        ? 'bg-[var(--glass-accent-from)]/10 text-[var(--glass-accent-from)] border-[var(--glass-accent-from)]'
        : 'text-[var(--glass-text-secondary)] border-[var(--glass-stroke-soft)] hover:border-[var(--glass-stroke-strong)]'
    }`
  const primaryBtnStyle = { background: 'linear-gradient(135deg, #3b82f6, #7c3aed)' }
  const primaryBtnClass =
    'flex-1 py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50'
  const cancelBtnClass =
    'flex-1 py-2.5 text-sm text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)] transition-colors rounded-xl'

  return (
    <div
      className="fixed inset-0 glass-overlay flex items-center justify-center z-50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg mx-4 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="glass-surface-modal rounded-2xl p-6 space-y-4">

          {/* ── 头部 ── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))' }}
              >
                <AppIcon name="sparkles" className="w-5 h-5 text-[#7c3aed]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[var(--glass-text-primary)]">
                  {status === 'streaming'
                    ? t('streaming')
                    : status === 'completed'
                      ? t('completed')
                      : t('modalTitle')}
                </h3>
                <p className="text-xs text-[var(--glass-text-tertiary)]">
                  {status === 'completed'
                    ? t('charCount').replace('{n}', String(charCount))
                    : t('modalSubtitle')}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="glass-icon-btn-sm"
              disabled={status === 'streaming'}
            >
              <AppIcon name="close" className="w-4 h-4" />
            </button>
          </div>

          {/* ── 输入态 ── */}
          {!isOutputMode && status !== 'error' && (
            <>
              {/* 输入框 */}
              <div>
                <label className="text-sm font-medium text-[var(--glass-text-secondary)] mb-2 block">
                  {t('inputLabel')}
                </label>
                {sourceText && (
                  <div className="mb-2 px-2 py-1 rounded-lg text-xs text-[var(--glass-tone-info-fg)] bg-[var(--glass-tone-info-fg)]/10">
                    {t('sourceTextHint')}
                  </div>
                )}
                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder={t('placeholder')}
                  className="glass-textarea-base app-scrollbar h-28 px-4 py-3 text-sm resize-none placeholder:text-[var(--glass-text-tertiary)]"
                  autoFocus
                />
              </div>

              {/* 控制区 */}
              <div className="space-y-2">
                {/* 篇幅目标 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--glass-text-tertiary)] flex-shrink-0 w-10">
                    {t('lengthTargetLabel')}
                  </span>
                  <div className="flex gap-1 flex-1">
                    {AI_EXPAND_LENGTH_TARGETS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setLengthTarget(opt.value)}
                        title={opt.hint}
                        className={segmentBtnClass(lengthTarget === opt.value)}
                      >
                        {getLengthLabel(opt.value, t)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 改写强度（仅有 sourceText 时） */}
                {sourceText && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--glass-text-tertiary)] flex-shrink-0 w-10">
                      {t('rewriteModeLabel')}
                    </span>
                    <div className="flex gap-1 flex-1">
                      {STORY_REWRITE_MODES.map((mode) => (
                        <button
                          key={mode.value}
                          type="button"
                          onClick={() => setStoryRewriteMode(mode.value)}
                          title={mode.description}
                          className={segmentBtnClass(storyRewriteMode === mode.value)}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center gap-3">
                <button onClick={handleClose} className={cancelBtnClass}>
                  {t('cancel')}
                </button>
                <button
                  onClick={handleStart}
                  disabled={!promptText.trim()}
                  className={primaryBtnClass}
                  style={primaryBtnStyle}
                >
                  <AppIcon name="sparkles" className="w-4 h-4" />
                  <span>{t('startAiWrite')}</span>
                </button>
              </div>
            </>
          )}

          {/* ── 流式 / 完成态 ── */}
          {isOutputMode && (
            <>
              <div
                ref={outputRef}
                className="glass-surface-soft rounded-xl px-4 py-3 h-56 overflow-y-auto app-scrollbar text-sm text-[var(--glass-text-primary)] leading-relaxed whitespace-pre-wrap"
              >
                {displayText}
                {status === 'streaming' && (
                  <span className="inline-block w-0.5 h-4 bg-[var(--glass-accent-from)] animate-pulse align-middle ml-0.5" />
                )}
              </div>

              <div className="flex items-center gap-3">
                {status === 'streaming' ? (
                  <button
                    onClick={stop}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold border border-[var(--glass-stroke-strong)] text-[var(--glass-text-secondary)] hover:bg-[var(--glass-surface-soft)] transition-colors flex items-center justify-center gap-2"
                  >
                    <span className="inline-block w-3 h-3 rounded-sm bg-current" />
                    <span>{t('stop')}</span>
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleRegenerate}
                      disabled={!promptText.trim()}
                      className="flex-1 py-2.5 text-sm text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)] transition-colors rounded-xl border border-[var(--glass-stroke-soft)] flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      <AppIcon name="sparkles" className="w-3.5 h-3.5" />
                      <span>{t('regenerate')}</span>
                    </button>
                    <button
                      onClick={handleAccept}
                      className={primaryBtnClass}
                      style={primaryBtnStyle}
                    >
                      <span>{t('accept')}</span>
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {/* ── 错误态 ── */}
          {status === 'error' && (
            <>
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-500">
                {errorMessage || t('generationFailed')}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleClose} className={cancelBtnClass}>
                  {t('cancel')}
                </button>
                <button
                  onClick={handleRegenerate}
                  disabled={!promptText.trim()}
                  className={primaryBtnClass}
                  style={primaryBtnStyle}
                >
                  <AppIcon name="sparkles" className="w-4 h-4" />
                  <span>{t('retry')}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
