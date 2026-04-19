'use client'

import { useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import GlobalAssetPicker from '@/components/shared/assets/GlobalAssetPicker'
import type { LxtProjectAsset } from '@/lib/query/hooks/useLxtAssets'

// ─── Types ────────────────────────────────────────────

export type AssetDraft = {
  name: string
  summary: string
  voiceId: string
  voiceType: string
  customVoiceUrl: string
}

export function buildDraft(asset: LxtProjectAsset): AssetDraft {
  return {
    name: asset.name ?? '',
    summary: asset.summary ?? '',
    voiceId: asset.voiceId ?? '',
    voiceType: asset.voiceType ?? 'library',
    customVoiceUrl: asset.customVoiceUrl ?? '',
  }
}

interface LxtAssetCardProps {
  asset: LxtProjectAsset
  draft: AssetDraft
  onDraftChange: (patch: Partial<AssetDraft>) => void
  onSave: () => void
  onDelete: () => void
  isSaving: boolean
  isDeleting: boolean
  onBindGlobal: (type: 'character' | 'location' | 'prop') => void
  onBindVoice: () => void
  isBindingGlobal: boolean
  isBindingVoice: boolean
  onVoiceDesign: (voicePrompt: string, previewText: string) => void
  isVoiceDesigning: boolean
}

// ─── Kind label helpers ────────────────────────────────

const KIND_LABELS: Record<string, string> = {
  character: '角色',
  location: '场景',
  prop: '道具',
}

// ─── Voice type label helpers ─────────────────────────

const VOICE_TYPE_OPTIONS = [
  { value: 'library', label: '声音库' },
  { value: 'custom', label: '自定义' },
  { value: 'uploaded', label: '上传' },
  { value: 'bailian', label: '百炼' },
]

// ─── Component ────────────────────────────────────────

export default function LxtAssetCard({
  asset,
  draft,
  onDraftChange,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
  onBindGlobal,
  onBindVoice,
  isBindingGlobal,
  isBindingVoice,
  onVoiceDesign,
  isVoiceDesigning,
}: LxtAssetCardProps) {
  const [voiceExpanded, setVoiceExpanded] = useState(false)
  const [voiceDesignExpanded, setVoiceDesignExpanded] = useState(false)
  const [voicePrompt, setVoicePrompt] = useState('')
  const [previewText, setPreviewText] = useState('')

  const globalBound =
    asset.globalCharacterId || asset.globalLocationId || asset.globalPropId
  const hasVoice = !!draft.voiceId || !!draft.customVoiceUrl

  return (
    <div className="glass-surface flex flex-col gap-0 overflow-hidden">
      {/* ── Header ─────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] font-medium">
            {KIND_LABELS[asset.kind] ?? asset.kind}
          </span>
        </div>
        {globalBound ? (
          <span className="text-xs text-emerald-400 flex items-center gap-1">
            <AppIcon name="check" className="w-3 h-3" />已绑定全局
          </span>
        ) : (
          <span className="text-xs text-[var(--glass-text-tertiary)]">未绑定全局</span>
        )}
      </div>

      {/* ── Name input ─────────────────────────── */}
      <div className="px-4 pb-2">
        <input
          value={draft.name}
          onChange={(e) => onDraftChange({ name: e.target.value })}
          className="glass-field-input h-9 w-full px-3 text-sm font-medium"
          placeholder="资产名称"
        />
      </div>

      {/* ── Summary textarea ──────────────────── */}
      <div className="px-4 pb-3">
        <textarea
          value={draft.summary}
          onChange={(e) => onDraftChange({ summary: e.target.value })}
          className="glass-field-input w-full min-h-[66px] px-3 py-2 text-sm resize-none"
          placeholder="角色设定 / 场景备注…"
        />
      </div>

      {/* ── Voice settings (characters only) ────── */}
      {asset.kind === 'character' && (
        <div className="border-t border-[var(--glass-stroke-base)] mx-4 pt-3 pb-3">
          <button
            type="button"
            onClick={() => setVoiceExpanded((v) => !v)}
            className="flex items-center gap-2 w-full text-left"
          >
            <AppIcon
              name="mic"
              className="w-4 h-4 text-[var(--glass-text-secondary)]"
            />
            <span className="text-xs font-medium text-[var(--glass-text-secondary)]">
              配音设置
            </span>
            {hasVoice && (
              <span className="text-xs text-emerald-400 ml-1">
                ● {draft.voiceId || '自定义'}
              </span>
            )}
            <AppIcon
              name={voiceExpanded ? 'chevronUp' : 'chevronDown'}
              className="w-3.5 h-3.5 text-[var(--glass-text-tertiary)] ml-auto"
            />
          </button>

          {voiceExpanded && (
            <div className="mt-3 flex flex-col gap-2">
              {/* Voice type */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--glass-text-secondary)] w-16 shrink-0">类型</span>
                <select
                  value={draft.voiceType}
                  onChange={(e) => onDraftChange({ voiceType: e.target.value })}
                  className="glass-field-input flex-1 h-8 px-2 text-xs"
                >
                  {VOICE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Voice ID */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--glass-text-secondary)] w-16 shrink-0">Voice ID</span>
                <input
                  value={draft.voiceId}
                  onChange={(e) => onDraftChange({ voiceId: e.target.value })}
                  className="glass-field-input flex-1 h-8 px-2 text-xs"
                  placeholder="留空则自动分配"
                />
              </div>

              {/* Custom URL */}
              {(draft.voiceType === 'custom' || draft.voiceType === 'uploaded') && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--glass-text-secondary)] w-16 shrink-0">音频 URL</span>
                  <input
                    value={draft.customVoiceUrl}
                    onChange={(e) => onDraftChange({ customVoiceUrl: e.target.value })}
                    className="glass-field-input flex-1 h-8 px-2 text-xs"
                    placeholder="https://…"
                  />
                </div>
              )}

              {/* Voice library button */}
              <button
                type="button"
                onClick={onBindVoice}
                disabled={isBindingVoice}
                className="glass-btn-base glass-btn-secondary h-8 px-3 text-xs flex items-center gap-1.5 w-fit"
              >
                <AppIcon name="mic" className="w-3.5 h-3.5" />
                从声音库选择
              </button>

              {/* AI voice design */}
              <button
                type="button"
                onClick={() => setVoiceDesignExpanded((v) => !v)}
                className="glass-btn-base glass-btn-secondary h-8 px-3 text-xs flex items-center gap-1.5 w-fit"
              >
                <AppIcon name="sparkles" className="w-3.5 h-3.5" />
                {isVoiceDesigning ? 'AI 设计中…' : 'AI 设计声音'}
              </button>

              {/* AI voice design inline form */}
              {voiceDesignExpanded && (
                <div className="flex flex-col gap-2 p-3 rounded-lg bg-[var(--glass-bg-muted)] border border-[var(--glass-stroke-base)]">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[var(--glass-text-secondary)]">声音描述（风格、音色特征）</label>
                    <textarea
                      value={voicePrompt}
                      onChange={(e) => setVoicePrompt(e.target.value)}
                      className="glass-field-input w-full min-h-[56px] px-2 py-1.5 text-xs resize-none"
                      placeholder="例：年轻女性，声音温柔甘甜，带一丝活泼感…"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[var(--glass-text-secondary)]">试听文本</label>
                    <input
                      value={previewText}
                      onChange={(e) => setPreviewText(e.target.value)}
                      className="glass-field-input h-8 w-full px-2 text-xs"
                      placeholder="试听时大声朝读的文字…"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onVoiceDesign(voicePrompt, previewText)
                        setVoiceDesignExpanded(false)
                      }}
                      disabled={isVoiceDesigning || !voicePrompt.trim() || !previewText.trim()}
                      className="glass-btn-base glass-btn-primary h-7 px-3 text-xs disabled:opacity-40"
                    >
                      {isVoiceDesigning ? '设计中…' : '开始设计'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoiceDesignExpanded(false)}
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
      )}

      {/* ── Actions ───────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap px-4 pb-4 border-t border-[var(--glass-stroke-base)] pt-3">
        <button
          type="button"
          onClick={() => onBindGlobal(asset.kind as 'character' | 'location' | 'prop')}
          disabled={isBindingGlobal}
          className="glass-btn-base glass-btn-secondary h-8 px-3 text-xs"
        >
          绑定全局{KIND_LABELS[asset.kind] ?? '资产'}
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="glass-btn-base glass-btn-primary h-8 px-4 text-xs disabled:opacity-40"
        >
          {isSaving ? '保存中…' : '保存'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="glass-btn-base glass-btn-secondary h-8 px-3 text-xs text-[var(--glass-tone-danger-fg)] disabled:opacity-40"
        >
          删除
        </button>
      </div>
    </div>
  )
}
