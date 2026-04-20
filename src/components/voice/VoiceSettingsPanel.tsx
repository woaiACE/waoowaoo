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
import { AppIcon } from '@/components/ui/icons'
import type { VoiceOpsAdapter } from './voice-ops-adapter'

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
  const [designExpanded, setDesignExpanded] = useState(false)
  const [voicePrompt, setVoicePrompt] = useState('')
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
      setDesignExpanded(false)
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
                <span>声音库</span>
              </div>
            </button>

            {/* AI Design toggle */}
            <button
              type="button"
              onClick={() => setDesignExpanded((v) => !v)}
              className="flex-1 min-w-[72px] glass-btn-base glass-btn-primary px-2 py-1.5 text-xs font-medium whitespace-nowrap"
            >
              <div className="flex items-center justify-center gap-1">
                <AppIcon name="sparkles" className="w-3 h-3 shrink-0" />
                <span>AI 设计</span>
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

          {/* AI Design form */}
          {designExpanded && (
            <div className="flex flex-col gap-2 p-3 rounded-lg bg-[var(--glass-bg-muted)] border border-[var(--glass-stroke-base)]">
              {/* Voice prompt */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-[var(--glass-text-secondary)]">声音描述（风格、音色特征）</label>
                  {/* AI infer button — LXT only, shown when adapter provides it */}
                  {inferVoicePrompt && (
                    <button
                      type="button"
                      onClick={() => void handleInfer()}
                      disabled={isInferringVoicePrompt}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] hover:opacity-80 transition-opacity disabled:opacity-40"
                      title="根据角色档案 AI 推理声音描述"
                    >
                      {isInferringVoicePrompt
                        ? <span className="w-2.5 h-2.5 border-2 border-[var(--glass-tone-info-fg)]/40 border-t-[var(--glass-tone-info-fg)] rounded-full animate-spin" />
                        : <AppIcon name="sparkles" className="w-2.5 h-2.5 shrink-0" />}
                      <span>{isInferringVoicePrompt ? '推理中…' : 'AI推理'}</span>
                    </button>
                  )}
                </div>
                <textarea
                  value={voicePrompt}
                  onChange={(e) => setVoicePrompt(e.target.value)}
                  className="glass-field-input w-full min-h-[56px] px-2 py-1.5 text-xs resize-none"
                  placeholder="例：年轻女性，声音温柔甘甜，带一丝活泼感…"
                />
              </div>

              {/* Preview text */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--glass-text-secondary)]">试听文本</label>
                <input
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  className="glass-field-input h-8 w-full px-2 text-xs"
                  placeholder="试听时朗读的文字…"
                />
              </div>

              {/* Submit */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleDesign()}
                  disabled={isDesigningVoice || !voicePrompt.trim() || !previewText.trim()}
                  className="glass-btn-base glass-btn-primary h-7 px-3 text-xs disabled:opacity-40"
                >
                  {isDesigningVoice ? '设计中…' : '开始设计'}
                </button>
                <button
                  type="button"
                  onClick={() => setDesignExpanded(false)}
                  className="glass-btn-base glass-btn-secondary h-7 px-3 text-xs"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
