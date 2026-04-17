'use client'

import { useTranslations } from 'next-intl'

interface StepIndicatorProps {
  currentStep: number // 1-4
}

const STEPS = [
  { key: 'novelInput' },
  { key: 'generateScript' },
  { key: 'generateStoryboard' },
  { key: 'generateFinalScript' },
] as const

export default function StepIndicator({ currentStep }: StepIndicatorProps) {
  const t = useTranslations('lxtScript.steps')

  return (
    <div className="relative flex items-center w-full px-6 py-4">
      {/* 背景连线 */}
      <div
        className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-[var(--glass-stroke-base)]"
        style={{ zIndex: 0 }}
      />
      {/* 激活连线 */}
      {currentStep > 1 && (
        <div
          className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-[var(--glass-accent)] transition-all duration-500"
          style={{
            zIndex: 0,
            width: `${((currentStep - 1) / 3) * 100}%`,
          }}
        />
      )}

      {STEPS.map((step, index) => {
        const stepNum = index + 1
        const isActive = stepNum === currentStep
        const isDone = stepNum < currentStep

        return (
          <div
            key={step.key}
            className="relative flex flex-1 flex-col items-center gap-2"
            style={{ zIndex: 1 }}
          >
            {/* 圆形步骤号 */}
            <div
              className={[
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all duration-300',
                isActive
                  ? 'bg-[var(--glass-accent)] text-white shadow-[0_0_12px_2px_var(--glass-accent)] scale-110'
                  : isDone
                    ? 'bg-[var(--glass-accent)]/70 text-white'
                    : 'bg-[var(--glass-bg-surface-strong)] border border-[var(--glass-stroke-base)] text-[var(--glass-text-secondary)]',
              ].join(' ')}
            >
              {stepNum}
            </div>
            {/* 步骤标签 */}
            <span
              className={[
                'text-xs font-medium whitespace-nowrap transition-colors duration-300',
                isActive
                  ? 'text-[var(--glass-accent)]'
                  : isDone
                    ? 'text-[var(--glass-text-secondary)]'
                    : 'text-[var(--glass-text-tertiary)]',
              ].join(' ')}
            >
              {t(step.key)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
