'use client'

/**
 * IP 角色卡片组件
 */

import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type { IpCharacterSummary } from './types'

interface IpCharacterCardProps {
  character: IpCharacterSummary
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  onVariants: () => void
}

export default function IpCharacterCard({
  character,
  isSelected,
  onSelect,
  onDelete,
  onVariants,
}: IpCharacterCardProps) {
  const t = useTranslations('ipMode')

  const statusColor = {
    draft: 'var(--glass-tone-warning-fg)',
    ready: 'var(--glass-tone-success-fg)',
    archived: 'var(--glass-text-tertiary)',
  }[character.status]

  return (
    <div
      className={`
        glass-surface-elevated rounded-xl p-3 cursor-pointer transition-all
        hover:shadow-[var(--glass-shadow-md)]
        ${isSelected ? 'ring-2 ring-[var(--glass-accent)]' : ''}
      `}
      onClick={onSelect}
    >
      {/* Face thumbnail */}
      <div className="aspect-square rounded-lg overflow-hidden bg-[var(--glass-bg-muted)] mb-3">
        {character.faceReferenceUrl ? (
          <img
            src={character.faceReferenceUrl}
            alt={character.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <AppIcon name="user" className="w-10 h-10 text-[var(--glass-text-tertiary)]" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm glass-text-primary truncate">
            {character.name}
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded-full"
            style={{ color: statusColor }}
          >
            {t(`status.${character.status}`)}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs glass-text-tertiary">
          {character.voiceId && (
            <span className="flex items-center gap-0.5">
              <AppIcon name="mic" className="w-3 h-3" />
              {t('character.voiceBound')}
            </span>
          )}
          {character.variantCount > 0 && (
            <span>{character.variantCount} {t('character.variants')}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-[var(--glass-border)]">
        <button
          className="flex-1 text-xs glass-text-tertiary hover:glass-text-primary py-1 rounded transition-colors"
          onClick={(e) => { e.stopPropagation(); onVariants() }}
        >
          {t('character.manageVariants')}
        </button>
        <button
          className="text-xs text-[var(--glass-tone-danger-fg)] hover:bg-[var(--glass-tone-danger-bg)]/30 px-2 py-1 rounded transition-colors"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
        >
          <AppIcon name="trash" className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
