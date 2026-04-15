'use client'

/**
 * IP 变体管理器 — 管理角色的服装/发型/配饰预设
 */

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useToast } from '@/contexts/ToastContext'
import { AppIcon } from '@/components/ui/icons'
import GlassButton from '@/components/ui/primitives/GlassButton'
import type { IpVariantSummary } from './types'
import { useIpVariants } from './hooks/useIpVariants'

interface IpVariantManagerProps {
  characterId: string
  characterName: string
  onClose: () => void
}

export default function IpVariantManager({
  characterId,
  characterName,
  onClose,
}: IpVariantManagerProps) {
  const t = useTranslations('ipMode')
  const { showToast } = useToast()
  const [isAdding, setIsAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')

  const { variants, isLoading, createVariant, deleteVariant } = useIpVariants(characterId)

  const handleAdd = useCallback(async () => {
    if (!newLabel.trim()) return
    try {
      await createVariant({ label: newLabel.trim() })
      setNewLabel('')
      setIsAdding(false)
      showToast(t('variant.created'), 'success')
    } catch {
      showToast(t('variant.createFailed'), 'error')
    }
  }, [newLabel, createVariant, showToast, t])

  const handleDelete = useCallback(async (variantId: string) => {
    try {
      await deleteVariant(variantId)
      showToast(t('variant.deleted'), 'success')
    } catch {
      showToast(t('variant.deleteFailed'), 'error')
    }
  }, [deleteVariant, showToast, t])

  return (
    <div className="glass-surface-elevated rounded-2xl p-6 mt-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold glass-text-primary">
            {t('variant.title')}
          </h3>
          <p className="text-xs glass-text-tertiary mt-0.5">{characterName}</p>
        </div>
        <button onClick={onClose} className="glass-text-tertiary hover:glass-text-primary">
          <AppIcon name="closeSm" className="w-5 h-5" />
        </button>
      </div>

      {/* Variant List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--glass-text-tertiary)] border-t-[var(--glass-accent)]" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {variants.map((variant: IpVariantSummary) => (
            <div
              key={variant.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-[var(--glass-bg-muted)] hover:bg-[var(--glass-bg-canvas)]"
            >
              {/* Preview */}
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-[var(--glass-bg-canvas)] flex-shrink-0">
                {variant.previewUrl ? (
                  <img src={variant.previewUrl} alt={variant.label} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <AppIcon name="image" className="w-5 h-5 text-[var(--glass-text-tertiary)]" />
                  </div>
                )}
              </div>

              <span className="flex-1 text-sm glass-text-primary">{variant.label}</span>

              <button
                className="text-xs text-[var(--glass-tone-danger-fg)] hover:bg-[var(--glass-tone-danger-bg)]/30 px-2 py-1 rounded"
                onClick={() => handleDelete(variant.id)}
              >
                <AppIcon name="trash" className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {variants.length === 0 && !isAdding && (
            <p className="text-sm glass-text-tertiary text-center py-6">
              {t('variant.empty')}
            </p>
          )}
        </div>
      )}

      {/* Add Variant */}
      {isAdding ? (
        <div className="flex items-center gap-2 mt-3">
          <input
            className="glass-input flex-1 text-sm"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={t('variant.labelPlaceholder')}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <GlassButton variant="primary" size="sm" onClick={handleAdd}>
            {t('variant.add')}
          </GlassButton>
          <GlassButton variant="ghost" size="sm" onClick={() => setIsAdding(false)}>
            {t('editor.cancel')}
          </GlassButton>
        </div>
      ) : (
        <GlassButton
          variant="secondary"
          size="sm"
          iconLeft={<AppIcon name="plus" className="w-4 h-4" />}
          onClick={() => setIsAdding(true)}
          className="mt-3"
        >
          {t('variant.addVariant')}
        </GlassButton>
      )}
    </div>
  )
}
