'use client'

import type { ReactNode } from 'react'
import { AppIcon } from '@/components/ui/icons'
import type { AppIconName } from '@/components/ui/icons'

type AssetLibraryShellProps = {
  variant?: 'modal' | 'inline'
  isOpen?: boolean
  title: string
  subtitle?: string
  iconName?: AppIconName
  onClose?: () => void
  closeOnOverlayClick?: boolean
  headerActions?: ReactNode
  children: ReactNode
  shellClassName?: string
  contentClassName?: string
}

export default function AssetLibraryShell({
  variant = 'modal',
  isOpen = true,
  title,
  subtitle,
  iconName = 'folderCards',
  onClose,
  closeOnOverlayClick = true,
  headerActions,
  children,
  shellClassName,
  contentClassName,
}: AssetLibraryShellProps) {
  if (variant === 'modal' && !isOpen) return null

  const body = (
    <div
      className={[
        'glass-surface-modal w-full flex flex-col overflow-hidden',
        variant === 'modal' ? 'h-full max-w-[95vw] max-h-[95vh]' : 'min-h-0',
        shellClassName ?? '',
      ].join(' ').trim()}
    >
      <div className="flex items-center justify-between gap-4 px-8 py-5 border-b border-[var(--glass-stroke-base)]">
        <div className="flex min-w-0 items-center gap-4">
          <div className="w-10 h-10 shrink-0 bg-[var(--glass-accent-from)] rounded-2xl flex items-center justify-center shadow-[var(--glass-shadow-md)]">
            <AppIcon name={iconName} className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-[var(--glass-text-primary)] truncate">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-[var(--glass-text-secondary)]">{subtitle}</p> : null}
          </div>
          {headerActions ? <div className="ml-2 flex items-center gap-2">{headerActions}</div> : null}
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 shrink-0 glass-btn-base glass-btn-secondary flex items-center justify-center"
          >
            <AppIcon name="close" className="w-5 h-5 text-[var(--glass-text-tertiary)]" />
          </button>
        ) : null}
      </div>

      <div className={['flex-1 overflow-y-auto', contentClassName ?? 'p-8'].join(' ').trim()}>{children}</div>
    </div>
  )

  if (variant === 'inline') {
    return body
  }

  return (
    <div
      className="fixed inset-0 glass-overlay z-[100] flex items-center justify-center p-6"
      onClick={(event) => {
        if (closeOnOverlayClick && event.target === event.currentTarget) {
          onClose?.()
        }
      }}
    >
      {body}
    </div>
  )
}
