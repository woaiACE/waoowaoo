'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'

export interface HistoryEntry {
  id: string
  step: number
  label: string
  content: string
  createdAt: number
}

interface HistoryPanelProps {
  entries: HistoryEntry[]
  onRestore: (entry: HistoryEntry) => void
}

export default function HistoryPanel({ entries, onRestore }: HistoryPanelProps) {
  const t = useTranslations('lxtScript.history')
  const [open, setOpen] = useState(false)

  const handleRestore = useCallback(
    (entry: HistoryEntry) => {
      onRestore(entry)
      setOpen(false)
    },
    [onRestore]
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-btn-base glass-btn-secondary h-7 px-3 text-xs flex items-center gap-1.5"
      >
        <AppIcon name="clock" className="w-3.5 h-3.5" />
        {t('title')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* Drawer */}
          <div className="relative ml-auto h-full w-80 bg-[var(--glass-bg-surface)] border-l border-[var(--glass-stroke-base)] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-stroke-base)]">
              <span className="text-sm font-semibold text-[var(--glass-text-primary)] flex items-center gap-2">
                <AppIcon name="clock" className="w-4 h-4 text-[var(--glass-accent)]" />
                {t('title')}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 hover:bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]"
              >
                <AppIcon name="close" className="w-4 h-4" />
              </button>
            </div>
            {/* List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {entries.length === 0 ? (
                <p className="text-center text-sm text-[var(--glass-text-tertiary)] py-8">
                  {t('empty')}
                </p>
              ) : (
                entries
                  .slice()
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => handleRestore(entry)}
                      className="w-full text-left rounded-lg p-3 border border-[var(--glass-stroke-base)] hover:border-[var(--glass-accent)]/50 hover:bg-[var(--glass-bg-muted)] transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-[var(--glass-text-primary)]">
                          {entry.label}
                        </span>
                        <span className="text-[10px] text-[var(--glass-text-tertiary)]">
                          {new Date(entry.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--glass-text-secondary)] line-clamp-2">
                        {entry.content}
                      </p>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
