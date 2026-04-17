'use client'

import { useTranslations } from 'next-intl'
import GlassTextarea from '@/components/ui/primitives/GlassTextarea'
import HistoryPanel from '../HistoryPanel'
import type { HistoryEntry } from '../HistoryPanel'

interface Step4FinalScriptProps {
  storyboardText: string
  finalScriptText: string
  onFinalScriptTextChange: (v: string) => void
  onPrev: () => void
  onNewTask: () => void
  history: HistoryEntry[]
  onRestoreHistory: (entry: HistoryEntry) => void
}

export default function Step4FinalScript({
  storyboardText,
  finalScriptText,
  onFinalScriptTextChange,
  onPrev,
  onNewTask,
  history,
  onRestoreHistory,
}: Step4FinalScriptProps) {
  const t = useTranslations('lxtScript')

  return (
    <div className="flex flex-col gap-4">
      {/* Top hint + history */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--glass-text-secondary)]">{t('step4.hint')}</p>
        <HistoryPanel entries={history} onRestore={onRestoreHistory} />
      </div>

      {/* Split panels */}
      <div className="grid grid-cols-2 gap-4">
        {/* Left: Storyboard (read-only) */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-[var(--glass-text-secondary)] uppercase tracking-wide">
            {t('step4.storyboardLabel')}
          </span>
          <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] overflow-hidden">
            <GlassTextarea
              readOnly
              value={storyboardText}
              className="w-full min-h-[360px] !border-0 !bg-transparent !rounded-none opacity-70"
            />
          </div>
        </div>

        {/* Right: Final script editor */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-[var(--glass-accent)] uppercase tracking-wide">
            {t('step4.editorLabel')}
          </span>
          <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] overflow-hidden ring-1 ring-[var(--glass-accent)]/20">
            <GlassTextarea
              value={finalScriptText}
              onChange={(e) => onFinalScriptTextChange(e.target.value)}
              placeholder={t('step4.placeholder')}
              className="w-full min-h-[360px] !border-0 !bg-transparent !rounded-none"
            />
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onPrev}
          className="glass-btn-base glass-btn-secondary h-10 px-6 text-sm font-medium"
        >
          {t('prevBtn')}
        </button>
        <button
          type="button"
          onClick={onNewTask}
          className="glass-btn-base glass-btn-primary h-10 px-6 text-sm font-medium"
        >
          {t('step4.newTaskBtn')}
        </button>
      </div>
    </div>
  )
}
