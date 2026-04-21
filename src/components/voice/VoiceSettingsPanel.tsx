'use client'

/**
 * VoiceSettingsPanel — 跨模式复用的音色设置面板
 *
 * 通过 VoiceOpsAdapter 接口注入数据操作，
 * 组件本身不依赖任何具体 API 或模式。
 *
 * 使用方式：
 *   // LXT 模式
 *   const adapter = useLxtVoiceOpsAdapter(projectId, assetId)
 *   <VoiceSettingsPanel adapter={adapter} />
 *
 *   // 通用模式
 *   const adapter = useNovelVoiceOpsAdapter(projectId, characterId)
 *   <VoiceSettingsPanel adapter={adapter} />
 */

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '@/components/ui/icons'
import type { VoiceOpsAdapter } from './voice-ops-adapter'

// 声音风格预设（与 VoiceDesignGeneratorSection 保持一致）
const VOICE_PRESETS = [
  { label: '男播音', prompt: '沉稳的中年男性播音员，音色低沉浑厚，语速平稳，吐字清晰' },
  { label: '温柔女', prompt: '温柔甜美的年轻女性，声音清脆悦耳，语调轻柔' },
  { label: '成熟男', prompt: '成熟稳重的男性，声音富有磁性和感染力' },
  { label: '活泼女', prompt: '活泼开朗的少女，声音甜美可爱，充满活力' },
  { label: '知性女', prompt: '知性优雅的女性，声音清晰悦耳，语调平和' },
  { label: '旁白', prompt: '富有感情的叙述者，声音温暖有故事感' },
] as const

const DEFAULT_PREVIEW_TEXT =
  '你好，很高兴认识你。这是AI为你专属设计的声音，让我来为你展示它的特点。无论是温柔的对话，还是激动的讲述，我都能完美呈现。希望你喜欢这个声音，让我们一起创造精彩的内容吧。'

interface VoiceSettingsPanelProps {
  adapter: VoiceOpsAdapter
}

export default function VoiceSettingsPanel({ adapter }: VoiceSettingsPanelProps) {
  const {
    customVoiceUrl,
    characterName,
    uploadVoice,
    isUploadingVoice,
    designVoice,
    isDesigningVoice,
    openVoiceLibraryPicker,
    inferVoicePrompt,
    isInferringVoicePrompt,
  } = adapter

  // ── Local state ──────────────────────────────────────
  const [expanded, setExpanded] = useState(false)
  const [voiceDesignModalOpen, setVoiceDesignModalOpen] = useState(false)
  const [voicePrompt, setVoicePrompt] = useState(() => adapter.voicePrompt ?? '')
  const [previewText, setPreviewText] = useState(DEFAULT_PREVIEW_TEXT)
  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasVoice = !!customVoiceUrl

  // ── Handlers ─────────────────────────────────────────

  const handlePreviewVoice = () => {
    if (!customVoiceUrl) return
    if (isPreviewingVoice && audioRef.current) {
      audioRef.current.pause()
      setIsPreviewingVoice(false)
      return
    }
    if (audioRef.current) audioRef.current.pause()
    const audio = new Audio(customVoiceUrl)
    audioRef.current = audio
    audio.play().catch(() => setIsPreviewingVoice(false))
    audio.onended = () => setIsPreviewingVoice(false)
    audio.onerror = () => setIsPreviewingVoice(false)
    setIsPreviewingVoice(true)
  }

  const handleDownloadVoice = () => {
    if (!customVoiceUrl) return
    const a = document.createElement('a')
    a.href = customVoiceUrl
    a.download = `${characterName}_voice.wav`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void uploadVoice(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDesign = async () => {
    if (!voicePrompt.trim() || !previewText.trim()) return
    try {
      await designVoice(voicePrompt, previewText)
      setVoiceDesignModalOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : '音色设计失败，请重试'
      window.alert(message)
    }
  }

  const handleInfer = async () => {
    if (!inferVoicePrompt) return
    try {
      const inferred = await inferVoicePrompt()
      if (inferred) setVoicePrompt(inferred)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 推理失败，请稍后再试'
      window.alert(message)
    }
  }

  // ── Render ───────────────────────────────────────────

  return (
    <div className="border-t border-[var(--glass-stroke-base)] pt-3 pb-3">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full text-left"
      >
        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${hasVoice ? 'bg-[var(--glass-bg-muted)]' : 'bg-[var(--glass-tone-warning-bg)]'}`}>
          <AppIcon name="mic" className={`w-3 h-3 ${hasVoice ? 'text-[var(--glass-text-secondary)]' : 'text-[var(--glass-tone-warning-fg)]'}`} />
        </div>
        <span className="text-xs font-medium text-[var(--glass-text-secondary)]">配音音色</span>
        <span className={`w-2 h-2 rounded-full ${hasVoice ? 'bg-[var(--glass-tone-success-fg)]' : 'bg-[var(--glass-tone-warning-fg)]'}`} />
        <AppIcon
          name="chevronDown"
          className={`w-3.5 h-3.5 text-[var(--glass-text-tertiary)] ml-auto transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-[var(--glass-stroke-base)] flex flex-col gap-2">
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {/* Upload */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingVoice}
              className="flex-1 min-w-[72px] px-2 py-1.5 bg-[var(--glass-bg-surface)] border border-[var(--glass-stroke-base)] rounded-lg text-xs text-[var(--glass-text-secondary)] font-medium hover:border-[var(--glass-stroke-success)] hover:text-[var(--glass-tone-success-fg)] transition-all whitespace-nowrap"
            >
              <div className="flex items-center justify-center gap-1">
                {customVoiceUrl && <span className="w-1.5 h-1.5 bg-[var(--glass-tone-success-fg)] rounded-full" />}
                <span>{isUploadingVoice ? '上传中…' : customVoiceUrl ? '已上传' : '上传音频'}</span>
              </div>
            </button>

            {/* Library picker */}
            <button
              type="button"
              onClick={openVoiceLibraryPicker}
              className="flex-1 min-w-[72px] px-2 py-1.5 bg-[var(--glass-bg-surface)] border border-[var(--glass-stroke-focus)] rounded-lg text-xs text-[var(--glass-tone-info-fg)] font-medium hover:bg-[var(--glass-tone-info-bg)] transition-all whitespace-nowrap"
            >
              <div className="flex items-center justify-center gap-1">
                <AppIcon name="copy" className="w-3 h-3 shrink-0" />
                <span>资产库</span>
              </div>
            </button>

            {/* AI Design — opens modal */}
            <button
              type="button"
              onClick={() => setVoiceDesignModalOpen(true)}
              className="flex-1 min-w-[72px] glass-btn-base glass-btn-primary px-2 py-1.5 text-xs font-medium whitespace-nowrap"
            >
              <div className="flex items-center justify-center gap-1">
                <AppIcon name="sparkles" className="w-3 h-3 shrink-0" />
                <span>AI智能设计</span>
              </div>
            </button>
          </div>

          {/* Preview */}
          {customVoiceUrl && (
            <button
              type="button"
              onClick={handlePreviewVoice}
              className={`w-full px-3 py-2 border rounded-lg text-sm font-medium transition-all ${
                isPreviewingVoice
                  ? 'bg-[var(--glass-accent-from)] border-[var(--glass-stroke-focus)] text-white'
                  : 'bg-[var(--glass-tone-info-bg)] border-[var(--glass-stroke-focus)] text-[var(--glass-tone-info-fg)]'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <AppIcon name={isPreviewingVoice ? 'pause' : 'play'} className="w-4 h-4" />
                {isPreviewingVoice ? '暂停试听' : '试听音色'}
              </div>
            </button>
          )}

          {/* Download */}
          {customVoiceUrl && (
            <button
              type="button"
              onClick={handleDownloadVoice}
              className="px-2 py-1.5 bg-[var(--glass-bg-surface)] border border-[var(--glass-stroke-base)] rounded-lg text-xs text-[var(--glass-text-secondary)] font-medium hover:border-[var(--glass-stroke-focus)] hover:text-[var(--glass-tone-info-fg)] transition-all w-fit"
            >
              <div className="flex items-center gap-1">
                <AppIcon name="download" className="w-3.5 h-3.5 shrink-0" />
                下载音色
              </div>
            </button>
          )}

          {/* AI Voice Design Modal */}
          {voiceDesignModalOpen && typeof document !== 'undefined' && createPortal(
            <>
              <div
                className="fixed inset-0 z-[9999] glass-overlay"
                onClick={() => setVoiceDesignModalOpen(false)}
              />
              <div
                className="fixed z-[10000] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 glass-surface-modal w-full max-w-xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)]">
                  <div className="flex items-center gap-2">
                    <AppIcon name="mic" className="w-5 h-5 text-[var(--glass-tone-info-fg)]" />
                    <h2 className="font-semibold text-[var(--glass-text-primary)]">为「{characterName}」设计AI声音</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVoiceDesignModalOpen(false)}
                    className="glass-btn-base glass-btn-soft p-1 text-[var(--glass-text-tertiary)]"
                  >
                    <AppIcon name="close" className="w-5 h-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-5 space-y-4">
                  {/* Preset style tabs */}
                  <div>
                    <div className="text-sm text-[var(--glass-text-secondary)] mb-2">选择声音风格：</div>
                    <div className="flex flex-wrap gap-1.5">
                      {VOICE_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setVoicePrompt(preset.prompt)}
                          className={`glass-btn-base px-2.5 py-1 text-xs rounded-md border transition-all ${
                            voicePrompt === preset.prompt
                              ? 'glass-btn-tone-info border-[var(--glass-stroke-focus)]'
                              : 'glass-btn-soft text-[var(--glass-text-secondary)] border-[var(--glass-stroke-base)] hover:border-[var(--glass-stroke-focus)]'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom description */}
                  <div>
                    <div className="text-sm text-[var(--glass-text-secondary)] mb-1">或自定义描述：</div>
                    <textarea
                      value={voicePrompt}
                      onChange={(e) => setVoicePrompt(e.target.value)}
                      placeholder="描述声音特征：年龄、性别、音色、语调…"
                      className="glass-textarea-base w-full px-3 py-2 text-sm resize-none"
                      rows={2}
                    />
                  </div>

                  {/* Preview text (collapsible) */}
                  <details className="text-sm">
                    <summary className="text-[var(--glass-text-secondary)] cursor-pointer hover:text-[var(--glass-text-primary)]">修改预览文本</summary>
                    <input
                      type="text"
                      value={previewText}
                      onChange={(e) => setPreviewText(e.target.value)}
                      className="glass-input-base w-full mt-2 px-3 py-2 text-sm"
                    />
                  </details>

                  {/* AI infer (LXT only) */}
                  {inferVoicePrompt && (
                    <button
                      type="button"
                      onClick={() => void handleInfer()}
                      disabled={isInferringVoicePrompt}
                      className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] hover:opacity-80 transition-opacity disabled:opacity-40"
                    >
                      {isInferringVoicePrompt
                        ? <span className="w-3 h-3 border-2 border-[var(--glass-tone-info-fg)]/40 border-t-[var(--glass-tone-info-fg)] rounded-full animate-spin" />
                        : <AppIcon name="sparkles" className="w-3 h-3 shrink-0" />}
                      <span>{isInferringVoicePrompt ? 'AI推理中…' : 'AI推理声音特征'}</span>
                    </button>
                  )}

                  {/* Submit */}
                  <button
                    type="button"
                    onClick={() => void handleDesign()}
                    disabled={isDesigningVoice || !voicePrompt.trim()}
                    className="glass-btn-base glass-btn-primary w-full py-2 rounded-lg text-sm disabled:opacity-40"
                  >
                    {isDesigningVoice ? '声音设计中…' : '生成声音方案'}
                  </button>
                </div>
              </div>
            </>,
            document.body,
          )}
        </div>
      )}
    </div>
  )
}
