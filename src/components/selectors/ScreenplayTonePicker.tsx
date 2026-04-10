'use client'

/**
 * ScreenplayTonePicker — 剧本风格二级选择器
 * L1：分组标签栏（通用/言情/喜剧/…）
 * L2：当前分组下的风格卡片
 * 参考 StylePresetSelector 的浮动 Portal 模式
 */

import { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '@/components/ui/icons'
import {
  SCREENPLAY_TONE_GROUPS,
  SCREENPLAY_TONE_PRESETS,
  type ScreenplayToneGroup,
} from '@/lib/screenplay-tone-presets'

const VIEWPORT_EDGE_GAP = 8

function useFloatingDropdown(isOpen: boolean, minWidth: number) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})

  const recalc = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_EDGE_GAP
    const spaceAbove = rect.top - VIEWPORT_EDGE_GAP
    const panelH = panelRef.current?.offsetHeight ?? 340
    const openDown = spaceBelow >= panelH || spaceBelow >= spaceAbove

    setPanelStyle({
      position: 'fixed',
      left: Math.max(VIEWPORT_EDGE_GAP, Math.min(rect.left, window.innerWidth - minWidth - VIEWPORT_EDGE_GAP)),
      width: Math.max(minWidth, rect.width),
      ...(openDown
        ? { top: rect.bottom + 4, maxHeight: spaceBelow }
        : { bottom: window.innerHeight - rect.top + 4, maxHeight: spaceAbove }),
      zIndex: 9999,
    })
  }, [minWidth])

  useEffect(() => {
    if (!isOpen) return
    recalc()
    window.addEventListener('resize', recalc)
    window.addEventListener('scroll', recalc, true)
    return () => {
      window.removeEventListener('resize', recalc)
      window.removeEventListener('scroll', recalc, true)
    }
  }, [isOpen, recalc])

  return { triggerRef, panelRef, panelStyle }
}

interface ScreenplayTonePickerProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function ScreenplayTonePicker({ value, onChange, disabled }: ScreenplayTonePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeGroup, setActiveGroup] = useState<string>(() => {
    const preset = SCREENPLAY_TONE_PRESETS.find((p) => p.value === value)
    return preset?.groupId ?? 'general'
  })
  const { triggerRef, panelRef, panelStyle } = useFloatingDropdown(isOpen, 340)

  // 当 value 从外部变化时同步 activeGroup
  useEffect(() => {
    const preset = SCREENPLAY_TONE_PRESETS.find((p) => p.value === value)
    if (preset) setActiveGroup(preset.groupId)
  }, [value])

  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, panelRef, triggerRef])

  const selectedPreset = SCREENPLAY_TONE_PRESETS.find((p) => p.value === value)
  const groupPresets = SCREENPLAY_TONE_PRESETS.filter((p) => p.groupId === activeGroup)

  function handleSelect(presetValue: string) {
    onChange(presetValue)
    setIsOpen(false)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((v) => !v)}
        className="glass-input-base flex h-10 w-full items-center justify-between gap-2 px-2.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="flex min-w-0 items-center gap-2">
          <AppIcon name="clapperboard" className="h-4 w-4 shrink-0 text-[var(--glass-accent-from)]" />
          <span className="text-[13px] font-medium text-[var(--glass-text-primary)] truncate">
            {selectedPreset?.label ?? '自动'}
          </span>
          {selectedPreset && selectedPreset.value !== 'auto' && (
            <span className="hidden sm:inline shrink-0 text-[11px] text-[var(--glass-text-tertiary)] truncate max-w-[120px]">
              {selectedPreset.description}
            </span>
          )}
        </div>
        <AppIcon
          name="chevronDown"
          className={`h-4 w-4 shrink-0 text-[var(--glass-text-tertiary)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          className="glass-surface-modal overflow-hidden"
          style={panelStyle}
        >
          {/* L1 分组标签栏 */}
          <div className="flex overflow-x-auto app-scrollbar border-b border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]">
            {SCREENPLAY_TONE_GROUPS.map((group: ScreenplayToneGroup) => {
              const isActive = group.id === activeGroup
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setActiveGroup(group.id)}
                  className={`flex shrink-0 items-center gap-1 px-3 py-2.5 text-[12px] font-medium transition-colors border-b-2 ${
                    isActive
                      ? 'border-[var(--glass-accent-from)] text-[var(--glass-accent-from)]'
                      : 'border-transparent text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)]'
                  }`}
                >
                  <span>{group.icon}</span>
                  <span>{group.label}</span>
                </button>
              )
            })}
          </div>

          {/* L2 风格卡片 */}
          <div className="overflow-y-auto app-scrollbar p-2.5" style={{ maxHeight: 260 }}>
            {/* 重置为自动 */}
            <button
              type="button"
              onClick={() => handleSelect('auto')}
              className={`mb-2 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-[13px] transition-all ${
                value === 'auto'
                  ? 'border-[var(--glass-accent-from)] bg-[var(--glass-accent-from)]/5 text-[var(--glass-accent-from)] font-medium'
                  : 'border-[var(--glass-stroke-soft)] text-[var(--glass-text-secondary)] hover:border-[var(--glass-stroke-strong)]'
              }`}
            >
              <AppIcon name="sparklesAlt" className="h-3.5 w-3.5 shrink-0" />
              <span>自动（不限定风格）</span>
              {value === 'auto' && <AppIcon name="check" className="ml-auto h-3.5 w-3.5 shrink-0" />}
            </button>
            <div className="grid grid-cols-2 gap-2">
              {groupPresets.map((preset) => {
                const isSelected = preset.value === value
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => handleSelect(preset.value)}
                    className={`relative flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-all ${
                      isSelected
                        ? 'border-[var(--glass-accent-from)] bg-[var(--glass-accent-from)]/5 shadow-sm'
                        : 'border-[var(--glass-stroke-soft)] hover:border-[var(--glass-stroke-strong)]'
                    }`}
                  >
                    <span
                      className={`text-[13px] font-medium ${
                        isSelected ? 'text-[var(--glass-accent-from)]' : 'text-[var(--glass-text-primary)]'
                      }`}
                    >
                      {preset.label}
                    </span>
                    <span className="text-[11px] text-[var(--glass-text-tertiary)] leading-tight">
                      {preset.description}
                    </span>
                    {isSelected && (
                      <AppIcon name="check" className="absolute top-2 right-2 h-3.5 w-3.5 text-[var(--glass-accent-from)]" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
