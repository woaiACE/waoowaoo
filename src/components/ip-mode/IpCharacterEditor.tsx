'use client'

/**
 * IP 角色编辑器 — 创建/编辑角色详情
 */

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useToast } from '@/contexts/ToastContext'
import { AppIcon } from '@/components/ui/icons'
import GlassButton from '@/components/ui/primitives/GlassButton'
import type { IpCharacterSummary, CreateIpCharacterInput } from './types'

interface IpCharacterEditorProps {
  character?: IpCharacterSummary
  onClose: () => void
  onSave?: (data: CreateIpCharacterInput) => Promise<void>
  onRefresh: () => void
}

export default function IpCharacterEditor({
  character,
  onClose,
  onSave,
  onRefresh,
}: IpCharacterEditorProps) {
  const t = useTranslations('ipMode')
  const { showToast } = useToast()
  const isNew = !character
  const [name, setName] = useState(character?.name || '')
  const [faceUrl, setFaceUrl] = useState(character?.faceReferenceUrl || '')
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      showToast(t('editor.nameRequired'), 'error')
      return
    }
    try {
      setIsSaving(true)
      if (onSave) {
        await onSave({
          name: name.trim(),
          faceReferenceUrl: faceUrl.trim() || undefined,
        })
      }
      onRefresh()
    } catch {
      showToast(t('editor.saveFailed'), 'error')
    } finally {
      setIsSaving(false)
    }
  }, [name, faceUrl, onSave, onRefresh, showToast, t])

  return (
    <div className="glass-surface-elevated rounded-2xl p-6 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold glass-text-primary">
          {isNew ? t('editor.createTitle') : t('editor.editTitle')}
        </h3>
        <button onClick={onClose} className="glass-text-tertiary hover:glass-text-primary">
          <AppIcon name="closeSm" className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {/* Name */}
        <div>
          <label className="glass-field-label text-sm mb-1 block">
            {t('editor.name')}
          </label>
          <input
            className="glass-input w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('editor.namePlaceholder')}
          />
        </div>

        {/* Face Reference */}
        <div>
          <label className="glass-field-label text-sm mb-1 block">
            {t('editor.faceReference')}
          </label>
          <div className="flex gap-2">
            <input
              className="glass-input flex-1"
              value={faceUrl}
              onChange={(e) => setFaceUrl(e.target.value)}
              placeholder={t('editor.faceReferencePlaceholder')}
            />
            {/* TODO: 集成 MediaUpload 组件 */}
          </div>
          {faceUrl && (
            <div className="mt-2 w-24 h-24 rounded-lg overflow-hidden bg-[var(--glass-bg-muted)]">
              <img src={faceUrl} alt="face" className="w-full h-full object-cover" />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <GlassButton variant="ghost" size="sm" onClick={onClose}>
            {t('editor.cancel')}
          </GlassButton>
          <GlassButton
            variant="primary"
            size="sm"
            loading={isSaving}
            onClick={handleSave}
          >
            {isNew ? t('editor.create') : t('editor.save')}
          </GlassButton>
        </div>
      </div>
    </div>
  )
}
