'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'

const STORAGE_KEY = 'lxt-script-presets'

interface Preset {
  name: string
  content: string
}

function loadPresets(): Preset[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Preset[]) : []
  } catch {
    return []
  }
}

function savePresetsToStorage(presets: Preset[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
  } catch {
    // ignore
  }
}

interface InstructionManagerProps {
  stepIndex: number // 0-based (0=step1,1=step2,2=step3)
  value: string
  onChange: (val: string) => void
}

export default function InstructionManager({
  stepIndex,
  value,
  onChange,
}: InstructionManagerProps) {
  const t = useTranslations('lxtScript.instruction')
  const [presets, setPresets] = useState<Preset[]>(() => loadPresets())
  const [selectedPreset, setSelectedPreset] = useState<string>(t('defaultPreset'))

  const [presetName, setPresetName] = useState('')

  const titleKeys = ['titleStep1', 'titleStep2', 'titleStep3'] as const
  const titleKey = titleKeys[stepIndex] ?? 'title'

  const handleSave = useCallback(() => {
    const name = presetName.trim()
    if (!name || !value.trim()) return
    // 禁止以默认指令名称存入预设列表
    if (name === t('defaultPreset')) return
    const updated = presets.filter((p) => p.name !== name)
    updated.push({ name, content: value })
    setPresets(updated)
    savePresetsToStorage(updated)
    setSelectedPreset(name)
  }, [presets, presetName, value, t])

  const handleDelete = useCallback(() => {
    const updated = presets.filter((p) => p.name !== selectedPreset)
    setPresets(updated)
    savePresetsToStorage(updated)
    setSelectedPreset(t('defaultPreset'))
    onChange('')
  }, [presets, selectedPreset, onChange, t])

  const handlePresetChange = useCallback(
    (name: string) => {
      setSelectedPreset(name)
      if (name === t('defaultPreset')) {
        setPresetName('')
        onChange('')
        return
      }
      setPresetName(name)
      const preset = presets.find((p) => p.name === name)
      if (preset) onChange(preset.content)
    },
    [presets, onChange, t]
  )

  const allPresetNames = [t('defaultPreset'), ...presets.map((p) => p.name)]

  return (
    <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)]">
        <AppIcon name="brain" className="w-4 h-4 text-[var(--glass-accent)]" />
        <span className="text-sm font-semibold text-[var(--glass-text-primary)]">
          {t(titleKey)}
        </span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-[var(--glass-stroke-base)]">
        <span className="text-xs text-[var(--glass-text-secondary)] shrink-0">{t('presetLabel')}</span>
        <select
          value={selectedPreset}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="glass-input-base h-7 rounded-md px-2 text-xs min-w-[120px]"
        >
          {allPresetNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          placeholder={t('presetNamePlaceholder')}
          className="glass-input-base h-7 rounded-md px-2 text-xs min-w-[100px] flex-1"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!presetName.trim() || !value.trim()}
          className="glass-btn-base glass-btn-secondary h-7 px-3 text-xs flex items-center gap-1 disabled:opacity-40"
        >
          <AppIcon name="check" className="w-3 h-3" />
          {t('saveBtn')}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={selectedPreset === t('defaultPreset')}
          className="glass-btn-base glass-btn-danger h-7 px-3 text-xs flex items-center gap-1 disabled:opacity-40"
        >
          <AppIcon name="trash" className="w-3 h-3" />
          {t('deleteBtn')}
        </button>
      </div>

      {/* Textarea */}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('placeholder')}
        rows={3}
        className="w-full resize-none bg-transparent px-4 py-3 text-sm text-[var(--glass-text-primary)] placeholder:text-[var(--glass-text-tertiary)] outline-none"
      />
    </div>
  )
}
