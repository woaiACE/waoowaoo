'use client'

/**
 * IP 选角面板 — 为项目从全局资产库分配角色
 */

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useToast } from '@/contexts/ToastContext'
import { AppIcon } from '@/components/ui/icons'
import GlassButton from '@/components/ui/primitives/GlassButton'
import GlobalAssetPicker from '@/components/shared/assets/GlobalAssetPicker'
import type { IpCastingSummary } from './types'
import { useIpCastings } from './hooks/useIpCastings'

interface IpCastingPanelProps {
  projectId: string
}

export default function IpCastingPanel({ projectId }: IpCastingPanelProps) {
  const t = useTranslations('ipMode')
  const { showToast } = useToast()

  // 资产选择器状态
  const [pickerOpen, setPickerOpen] = useState(false)
  // 已从选择器选中但待填写角色名的角色 ID
  const [pendingCharId, setPendingCharId] = useState('')
  const [roleLabel, setRoleLabel] = useState('')

  const { castings, isLoading, createCasting, deleteCasting } = useIpCastings(projectId)

  // 已选角的 globalCharacterId 集合（防重复选角）
  const castCharacterIds = new Set(castings.map((c: IpCastingSummary) => c.globalCharacterId))

  /** 从 GlobalAssetPicker 选中角色后 */
  const handlePickerSelect = useCallback((globalAssetId: string) => {
    setPickerOpen(false)
    if (castCharacterIds.has(globalAssetId)) {
      showToast(t('casting.alreadyCast'), 'error')
      return
    }
    setPendingCharId(globalAssetId)
    setRoleLabel('')
  }, [castCharacterIds, showToast, t])

  /** 提交选角 */
  const handleConfirm = useCallback(async () => {
    if (!pendingCharId) return
    try {
      await createCasting({
        globalCharacterId: pendingCharId,
        castRole: roleLabel.trim() || undefined,
      })
      setPendingCharId('')
      setRoleLabel('')
      showToast(t('casting.created'), 'success')
    } catch {
      showToast(t('casting.createFailed'), 'error')
    }
  }, [pendingCharId, roleLabel, createCasting, showToast, t])

  const handleCancelPending = useCallback(() => {
    setPendingCharId('')
    setRoleLabel('')
  }, [])

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
          onClick={() => setPickerOpen(true)}
        >
          {t('casting.addCasting')}
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
                  <p className="text-xs glass-text-tertiary">{t('casting.roleAs')} {casting.roleLabel}</p>
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

      {/* 待确认角色名表单 */}
      {pendingCharId && (
        <div className="mt-3 p-3 rounded-lg bg-[var(--glass-bg-muted)] flex flex-col gap-2">
          <p className="text-xs glass-text-secondary">{t('casting.roleLabelHint')}</p>
          <input
            className="glass-input w-full text-sm"
            value={roleLabel}
            onChange={(e) => setRoleLabel(e.target.value)}
            placeholder={t('casting.roleLabelPlaceholder')}
          />
          <div className="flex justify-end gap-2">
            <GlassButton variant="ghost" size="sm" onClick={handleCancelPending}>
              {t('editor.cancel')}
            </GlassButton>
            <GlassButton variant="primary" size="sm" onClick={handleConfirm}>
              {t('casting.confirm')}
            </GlassButton>
          </div>
        </div>
      )}

      {/* 全局资产库角色选择器 */}
      <GlobalAssetPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickerSelect}
        type="character"
      />
    </div>
  )
}
