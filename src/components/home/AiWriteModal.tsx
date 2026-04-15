'use client'

/**
 * AI 帮我写 — 双栏流式模态框
 *
 * 左栏：功能控件区（始终可见）
 *   - 提示词输入
 *   - 篇幅目标、改写强度（有 sourceText 时）、读者画像
 *   - 影视风格选择器（ScreenplayTonePicker）
 *   - 操作按钮
 * 右栏：实时流式预览区（始终可见）
 *   - idle 占位 UI
 *   - streaming 流式文字 + 光标
 *   - completed 完整结果
 *   - error 错误信息
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { AppIcon } from '@/components/ui/icons'
import {
  STORY_REWRITE_MODES,
  AI_EXPAND_LENGTH_TARGETS,
  AI_EXPAND_READER_PROFILES,
} from '@/lib/screenplay-tone-presets'
import { ScreenplayTonePicker } from '@/components/selectors/ScreenplayTonePicker'
import { useAiStoryExpandStream } from '@/lib/home/useAiStoryExpandStream'
import { splitStructuredOutput } from '@/components/llm-console/LLMStageStreamCard'

interface AiWriteModalProps {
  open: boolean
  onClose: () => void
  /** 用户点击"接受"后回调，将生成文本回填 */
  onAccept: (text: string) => void
  /** 如果存在，表示将在此文本基础上改写，显示改写提示和改写强度控件 */
  sourceText?: string
  /** 继承自上层的剧本风格基调（作为 ScreenplayTonePicker 的初始值） */
  initialScreenplayTone?: string
  /** 项目 ID，存在时注入项目角色和世界观上下文 */
  projectId?: string
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
  projectId,
  t,
}: AiWriteModalProps) {
  const [promptText, setPromptText] = useState('')
  const [screenplayTone, setScreenplayTone] = useState(initialScreenplayTone)
  const [storyRewriteMode, setStoryRewriteMode] = useState('none')
  const [lengthTarget, setLengthTarget] = useState('medium')
  const [readerProfile, setReaderProfile] = useState('general')
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
      readerProfile: readerProfile !== 'general' ? readerProfile : undefined,
      projectId: projectId || undefined,
    })
  }, [promptText, status, run, screenplayTone, storyRewriteMode, sourceText, lengthTarget, readerProfile, projectId])

  const handleRegenerate = useCallback(() => {
    if (!promptText.trim()) return
    void run({
      prompt: promptText.trim(),
      screenplayTone: screenplayTone !== 'auto' ? screenplayTone : undefined,
      storyRewriteMode: storyRewriteMode !== 'none' ? storyRewriteMode : undefined,
      sourceText: sourceText || undefined,
      lengthTarget: lengthTarget !== 'medium' ? lengthTarget : undefined,
      readerProfile: readerProfile !== 'general' ? readerProfile : undefined,
      projectId: projectId || undefined,
    })
  }, [promptText, run, screenplayTone, storyRewriteMode, sourceText, lengthTarget, readerProfile, projectId])

  const handleAccept = useCallback(() => {
    const rawText = expandedResult || outputText
    if (!rawText) return
    const structured = splitStructuredOutput(rawText)
    const text = structured.hasStructured && structured.finalText ? structured.finalText : rawText
    onAccept(text)
    reset()
    setPromptText('')
    onClose()
  }, [expandedResult, outputText, onAccept, reset, onClose])

  if (!open) return null

  const displayText = status === 'completed' ? expandedResult : outputText
  const structured = splitStructuredOutput(displayText)
  const charCount = structured.hasStructured && structured.finalText
    ? structured.finalText.length
    : displayText.length
  const isGenerating = status === 'streaming'

  const segmentBtnClass = (active: boolean) =>
    `flex-1 rounded-lg px-1.5 py-1 text-xs font-medium transition-all border ${
      active
        ? 'bg-[var(--glass-accent-from)]/10 text-[var(--glass-accent-from)] border-[var(--glass-accent-from)]'
        : 'text-[var(--glass-text-secondary)] border-[var(--glass-stroke-soft)] hover:border-[var(--glass-stroke-strong)]'
    }`
  const primaryBtnStyle = { background: 'linear-gradient(135deg, #3b82f6, #7c3aed)' }
  const primaryBtnClass =
    'w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50'
  const cancelBtnClass =
    'w-full py-2.5 text-sm text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)] transition-colors rounded-xl'

  return (
    <div
      className="fixed inset-0 glass-overlay flex items-center justify-center z-50 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-6xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="glass-surface-modal rounded-2xl overflow-hidden flex flex-col">

          {/* ── 顶部标题栏（固定，不随状态变化） ── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--glass-stroke-soft)] flex-shrink-0">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))' }}
              >
                <AppIcon name="sparkles" className="w-5 h-5 text-[#7c3aed]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[var(--glass-text-primary)]">
                  {t('modalTitle')}
                </h3>
                <p className="text-xs text-[var(--glass-text-tertiary)]">{t('modalSubtitle')}</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="glass-icon-btn-sm"
              disabled={isGenerating}
            >
              <AppIcon name="close" className="w-4 h-4" />
            </button>
          </div>

          {/* ── 双栏主体 ── */}
          <div className="flex flex-col lg:flex-row" style={{ minHeight: '60vh', maxHeight: '75vh' }}>

            {/* ── 左栏：功能控件区（始终可见） ── */}
            <div className="lg:w-5/12 flex flex-col p-5 gap-4 border-b lg:border-b-0 lg:border-r border-[var(--glass-stroke-soft)] overflow-y-auto app-scrollbar">

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
              <div className="space-y-2.5">

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

                {/* 读者画像 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--glass-text-tertiary)] flex-shrink-0 w-10">
                    {t('readerProfileLabel')}
                  </span>
                  <div className="flex gap-1 flex-1">
                    {AI_EXPAND_READER_PROFILES.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setReaderProfile(opt.value)}
                        title={opt.description}
                        className={segmentBtnClass(readerProfile === opt.value)}
                      >
                        {t(`reader${opt.value.charAt(0).toUpperCase()}${opt.value.slice(1)}`)}
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* 影视风格选择器 */}
              <div>
                <span className="text-xs text-[var(--glass-text-tertiary)] block mb-1.5">
                  {t('toneSectionLabel')}
                </span>
                <ScreenplayTonePicker
                  value={screenplayTone}
                  onChange={setScreenplayTone}
                  disabled={isGenerating}
                />
              </div>

              {/* 操作按钮 */}
              <div className="mt-auto pt-2">
                {status === 'idle' || status === 'error' ? (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleStart}
                      disabled={!promptText.trim()}
                      className={primaryBtnClass}
                      style={primaryBtnStyle}
                    >
                      <AppIcon name="sparkles" className="w-4 h-4" />
                      <span>{t('startAiWrite')}</span>
                    </button>
                    <button onClick={handleClose} className={cancelBtnClass}>
                      {t('cancel')}
                    </button>
                  </div>
                ) : status === 'streaming' ? (
                  <button
                    onClick={stop}
                    className="w-full py-3 rounded-xl text-sm font-semibold border border-[var(--glass-stroke-strong)] text-[var(--glass-text-secondary)] hover:bg-[var(--glass-surface-soft)] transition-colors flex items-center justify-center gap-2"
                  >
                    <span className="inline-block w-3 h-3 rounded-sm bg-current" />
                    <span>{t('stop')}</span>
                  </button>
                ) : (
                  // completed
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleAccept}
                      className={primaryBtnClass}
                      style={primaryBtnStyle}
                    >
                      <span>{t('accept')}</span>
                    </button>
                    <button
                      onClick={handleRegenerate}
                      disabled={!promptText.trim()}
                      className="w-full py-2.5 text-sm text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)] transition-colors rounded-xl border border-[var(--glass-stroke-soft)] flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      <AppIcon name="sparkles" className="w-3.5 h-3.5" />
                      <span>{t('regenerate')}</span>
                    </button>
                  </div>
                )}
              </div>

            </div>

            {/* ── 右栏：实时预览区（始终可见） ── */}
            <div className="lg:w-7/12 flex flex-col p-5">

              {/* 右栏顶部：状态徽章 + 字数 */}
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <div className="flex items-center gap-2">
                  {status === 'streaming' && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--glass-accent-from)]">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--glass-accent-from)] animate-pulse" />
                      {t('statusStreaming')}
                    </span>
                  )}
                  {status === 'completed' && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-500">
                      <AppIcon name="check" className="w-3 h-3" />
                      {t('statusCompleted')}
                    </span>
                  )}
                  {(status === 'idle' || status === 'error') && (
                    <span className="text-xs text-[var(--glass-text-tertiary)]">
                      {t('statusIdle')}
                    </span>
                  )}
                </div>
                {charCount > 0 && (
                  <span className="text-xs text-[var(--glass-text-tertiary)]">
                    {t('charCount').replace('{n}', String(charCount))}
                  </span>
                )}
              </div>

              {/* 右栏内容 */}
              <div className="flex-1 relative overflow-hidden" style={{ minHeight: '300px' }}>

                {/* idle 占位 UI */}
                {status === 'idle' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--glass-stroke-soft)]">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center opacity-20"
                      style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.2))' }}
                    >
                      <AppIcon name="sparkles" className="w-7 h-7 text-[#7c3aed]" />
                    </div>
                    <p className="text-sm font-medium text-[var(--glass-text-tertiary)] opacity-60">
                      {t('idlePlaceholderTitle')}
                    </p>
                    <p className="text-xs text-[var(--glass-text-tertiary)] opacity-40">
                      {t('idlePlaceholderSubtitle')}
                    </p>
                  </div>
                )}

                {/* 错误态 */}
                {status === 'error' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                    <div className="w-full rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-500">
                      {errorMessage || t('generationFailed')}
                    </div>
                  </div>
                )}

                {/* 流式 / 完成态文字 */}
                {(status === 'streaming' || status === 'completed') && (
                  structured.hasStructured ? (
                    <div
                      ref={outputRef}
                      className="absolute inset-0 overflow-y-auto app-scrollbar px-1 py-1 space-y-3"
                    >
                      {structured.showReasoning && (
                        <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]">
                          <div className="border-b border-[var(--glass-stroke-base)] px-3 py-2 text-xs font-semibold text-[var(--glass-text-secondary)]">
                            {'【思考过程】'}
                          </div>
                          <pre className="min-h-[80px] whitespace-pre-wrap break-words px-3 py-3 text-sm text-[var(--glass-text-secondary)] leading-relaxed font-mono">
                            {structured.reasoning}
                            {status === 'streaming' && !structured.finalText && (
                              <span className="inline-block w-0.5 h-4 bg-[var(--glass-accent-from)] animate-pulse align-middle ml-0.5" />
                            )}
                          </pre>
                        </div>
                      )}
                      {structured.showFinal && (
                        <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]">
                          <div className="border-b border-[var(--glass-stroke-base)] px-3 py-2 text-xs font-semibold text-[var(--glass-text-primary)]">
                            {'【生成内容】'}
                          </div>
                          <pre className="min-h-[80px] whitespace-pre-wrap break-words px-3 py-3 text-sm text-[var(--glass-text-primary)] leading-relaxed font-mono">
                            {structured.finalText}
                            {status === 'streaming' && !!structured.finalText && (
                              <span className="inline-block w-0.5 h-4 bg-[var(--glass-accent-from)] animate-pulse align-middle ml-0.5" />
                            )}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      ref={outputRef}
                      className="absolute inset-0 overflow-y-auto app-scrollbar glass-surface-soft rounded-xl px-4 py-3 text-sm text-[var(--glass-text-primary)] leading-relaxed whitespace-pre-wrap"
                    >
                      {displayText}
                      {status === 'streaming' && (
                        <span className="inline-block w-0.5 h-4 bg-[var(--glass-accent-from)] animate-pulse align-middle ml-0.5" />
                      )}
                    </div>
                  )
                )}

              </div>

            </div>

          </div>

        </div>
      </div>
    </div>
  )
}

