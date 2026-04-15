'use client'

/**
 * IP 选角面板 — 为项目分配 IP 角色
 */

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useToast } from '@/contexts/ToastContext'
import { AppIcon } from '@/components/ui/icons'
import GlassButton from '@/components/ui/primitives/GlassButton'
import type { IpCastingSummary, IpCharacterSummary } from './types'
import { useIpCastings } from './hooks/useIpCastings'
import { useIpCharacters } from './hooks/useIpCharacters'

interface IpCastingPanelProps {
  projectId: string
}

export default function IpCastingPanel({ projectId }: IpCastingPanelProps) {
  const t = useTranslations('ipMode')
  const { showToast } = useToast()
  const [isAdding, setIsAdding] = useState(false)
  const [selectedCharId, setSelectedCharId] = useState('')
  const [roleLabel, setRoleLabel] = useState('')

  const { castings, isLoading, createCasting, deleteCasting } = useIpCastings(projectId)
  const { characters } = useIpCharacters()

  // Exclude already-cast characters
  const castCharacterIds = new Set(castings.map((c: IpCastingSummary) => c.ipCharacterId))
  const availableCharacters = characters.filter((c: IpCharacterSummary) => !castCharacterIds.has(c.id))

  const handleAdd = useCallback(async () => {
    if (!selectedCharId) {
      showToast(t('casting.selectRequired'), 'error')
      return
    }
    try {
      await createCasting({
        ipCharacterId: selectedCharId,
        roleLabel: roleLabel.trim() || undefined,
      })
      setSelectedCharId('')
      setRoleLabel('')
      setIsAdding(false)
      showToast(t('casting.added'), 'success')
    } catch {
      showToast(t('casting.addFailed'), 'error')
    }
  }, [selectedCharId, roleLabel, createCasting, showToast, t])

  const handleRemove = useCallback(async (castingId: string) => {
    try {
      await deleteCasting(castingId)
      showToast(t('casting.removed'), 'success')
    } catch {
      showToast(t('casting.removeFailed'), 'error')
    }
  }, [deleteCasting, showToast, t])

  return (
    <div className="glass-surface-elevated rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold glass-text-primary">
          {t('casting.title')}
        </h3>
        <GlassButton
          variant="secondary"
          size="sm"
          iconLeft={<AppIcon name="plus" className="w-4 h-4" />}
          onClick={() => setIsAdding(true)}
          disabled={availableCharacters.length === 0}
        >
          {t('casting.addCast')}
        </GlassButton>
      </div>

      {/* Casting List */}
      {isLoading ? (
        <div className="flex justify-center py-6">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--glass-text-tertiary)] border-t-[var(--glass-accent)]" />
        </div>
      ) : castings.length === 0 ? (
        <p className="text-sm glass-text-tertiary text-center py-6">
          {t('casting.empty')}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {castings.map((casting: IpCastingSummary) => (
            <div
              key={casting.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-[var(--glass-bg-muted)]"
            >
              <div className="w-10 h-10 rounded-full overflow-hidden bg-[var(--glass-bg-canvas)] flex-shrink-0">
                {casting.faceReferenceUrl ? (
                  <img src={casting.faceReferenceUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <AppIcon name="user" className="w-5 h-5 text-[var(--glass-text-tertiary)]" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium glass-text-primary">{casting.characterName}</p>
                {casting.roleLabel && (
                  <p className="text-xs glass-text-tertiary">{t('casting.as')} {casting.roleLabel}</p>
                )}
              </div>
              <button
                className="text-xs text-[var(--glass-tone-danger-fg)] hover:bg-[var(--glass-tone-danger-bg)]/30 px-2 py-1 rounded"
                onClick={() => handleRemove(casting.id)}
              >
                <AppIcon name="trash" className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Casting Form */}
      {isAdding && (
        <div className="mt-3 p-3 rounded-lg bg-[var(--glass-bg-muted)] flex flex-col gap-2">
          <select
            className="glass-input w-full text-sm"
            value={selectedCharId}
            onChange={(e) => setSelectedCharId(e.target.value)}
          >
            <option value="">{t('casting.selectCharacter')}</option>
            {availableCharacters.map((c: IpCharacterSummary) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input
            className="glass-input w-full text-sm"
            value={roleLabel}
            onChange={(e) => setRoleLabel(e.target.value)}
            placeholder={t('casting.roleLabelPlaceholder')}
          />
          <div className="flex justify-end gap-2">
            <GlassButton variant="ghost" size="sm" onClick={() => setIsAdding(false)}>
              {t('editor.cancel')}
            </GlassButton>
            <GlassButton variant="primary" size="sm" onClick={handleAdd}>
              {t('casting.confirm')}
            </GlassButton>
          </div>
        </div>
      )}
    </div>
  )
}
