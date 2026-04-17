'use client'

import { useTranslations } from 'next-intl'
import GlassTextarea from '@/components/ui/primitives/GlassTextarea'
import InstructionManager from '../InstructionManager'
import HistoryPanel from '../HistoryPanel'
import type { HistoryEntry } from '../HistoryPanel'

interface Step2ScriptEditorProps {
  novelText: string
  scriptText: string
  onScriptTextChange: (v: string) => void
  instruction: string
  onInstructionChange: (v: string) => void
  onPrev: () => void
  onNext: () => void
  history: HistoryEntry[]
  onRestoreHistory: (entry: HistoryEntry) => void
}

export default function Step2ScriptEditor({
  novelText,
  scriptText,
  onScriptTextChange,
  instruction,
  onInstructionChange,
  onPrev,
  onNext,
  history,
  onRestoreHistory,
}: Step2ScriptEditorProps) {
  const t = useTranslations('lxtScript')

  return (
    <div className="flex flex-col gap-4">
      {/* Top hint + history */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--glass-text-secondary)]">{t('step2.hint')}</p>
        <HistoryPanel entries={history} onRestore={onRestoreHistory} />
      </div>

      {/* Split panels */}
      <div className="grid grid-cols-2 gap-4">
        {/* Left: Original */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-[var(--glass-text-secondary)] uppercase tracking-wide">
            {t('step2.originalLabel')}
          </span>
          <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] overflow-hidden">
            <GlassTextarea
              readOnly
              value={novelText}
              className="w-full min-h-[280px] !border-0 !bg-transparent !rounded-none opacity-70"
            />
          </div>
        </div>

        {/* Right: Script editor */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-[var(--glass-accent)] uppercase tracking-wide">
            {t('step2.editorLabel')}
          </span>
          <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] overflow-hidden ring-1 ring-[var(--glass-accent)]/20">
            <GlassTextarea
              value={scriptText}
              onChange={(e) => onScriptTextChange(e.target.value)}
              placeholder={t('step2.placeholder')}
              className="w-full min-h-[280px] !border-0 !bg-transparent !rounded-none"
            />
          </div>
        </div>
      </div>

      {/* Instruction manager */}
      <InstructionManager
        stepIndex={1}
        value={instruction}
        onChange={onInstructionChange}
      />

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
          onClick={onNext}
          className="glass-btn-base glass-btn-primary h-10 px-6 text-sm font-medium"
        >
          {t('step2.nextBtn')}
        </button>
      </div>
    </div>
  )
}
