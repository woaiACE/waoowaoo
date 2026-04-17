'use client'

import { useTranslations } from 'next-intl'
import GlassTextarea from '@/components/ui/primitives/GlassTextarea'
import InstructionManager from '../InstructionManager'
import HistoryPanel from '../HistoryPanel'
import type { HistoryEntry } from '../HistoryPanel'

interface Step1NovelInputProps {
  novelText: string
  onNovelTextChange: (v: string) => void
  instruction: string
  onInstructionChange: (v: string) => void
  onNext: () => void
  history: HistoryEntry[]
  onRestoreHistory: (entry: HistoryEntry) => void
}

export default function Step1NovelInput({
  novelText,
  onNovelTextChange,
  instruction,
  onInstructionChange,
  onNext,
  history,
  onRestoreHistory,
}: Step1NovelInputProps) {
  const t = useTranslations('lxtScript')

  return (
    <div className="flex flex-col gap-4">
      {/* Top hint + history */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--glass-text-secondary)]">{t('step1.hint')}</p>
        <HistoryPanel entries={history} onRestore={onRestoreHistory} />
      </div>

      {/* Novel textarea */}
      <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] overflow-hidden">
        <GlassTextarea
          value={novelText}
          onChange={(e) => onNovelTextChange(e.target.value)}
          placeholder={t('step1.placeholder')}
          className="w-full min-h-[280px] !border-0 !bg-transparent !rounded-none"
        />
      </div>

      {/* Instruction manager */}
      <InstructionManager
        stepIndex={0}
        value={instruction}
        onChange={onInstructionChange}
      />

      {/* Next button */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={!novelText.trim()}
          onClick={onNext}
          className="glass-btn-base glass-btn-primary h-10 px-6 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('step1.nextBtn')}
        </button>
      </div>
    </div>
  )
}
