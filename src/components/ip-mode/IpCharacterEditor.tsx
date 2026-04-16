'use client'

/**
 * IP 角色编辑器 — 创建/编辑角色详情
 *
 * 创建模式支持多步对话框：
 *   Step 1: 基本信息（名称 + 面部参考图）
 *   Step 2: 添加形象变体（可选）
 */

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useToast } from '@/contexts/ToastContext'
import { AppIcon } from '@/components/ui/icons'
import GlassButton from '@/components/ui/primitives/GlassButton'
import { useIpVariants } from './hooks/useIpVariants'
import type { IpCharacterSummary, CreateIpCharacterInput } from './types'

interface IpCharacterEditorProps {
  character?: IpCharacterSummary
  onClose: () => void
  onSave?: (data: CreateIpCharacterInput) => Promise<{ id: string } | void>
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

  // Multi-step state (create mode only)
  const [step, setStep] = useState<1 | 2>(1)
  const [createdCharacterId, setCreatedCharacterId] = useState<string | null>(null)

  // Step 2: variant creation
  const [variantInputs, setVariantInputs] = useState<string[]>([])
  const [currentVariantLabel, setCurrentVariantLabel] = useState('')
  const [isSavingVariants, setIsSavingVariants] = useState(false)

  const { createVariant } = useIpVariants(createdCharacterId ?? '')

  const handleSaveBasicInfo = useCallback(async () => {
    if (!name.trim()) {
      showToast(t('editor.nameRequired'), 'error')
      return
    }
    try {
      setIsSaving(true)
      if (isNew && onSave) {
        const result = await onSave({
          name: name.trim(),
          faceReferenceUrl: faceUrl.trim() || undefined,
        })
        // If create returned an id, move to step 2
        if (result && 'id' in result) {
          setCreatedCharacterId(result.id)
          setStep(2)
          onRefresh()
          return
        }
      } else if (onSave) {
        await onSave({
          name: name.trim(),
          faceReferenceUrl: faceUrl.trim() || undefined,
        })
      }
      onRefresh()
      onClose()
    } catch {
      showToast(t('editor.saveFailed'), 'error')
    } finally {
      setIsSaving(false)
    }
  }, [name, faceUrl, isNew, onSave, onRefresh, onClose, showToast, t])

  const handleAddVariantInput = useCallback(() => {
    const label = currentVariantLabel.trim()
    if (!label) return
    if (variantInputs.includes(label)) return
    setVariantInputs((prev) => [...prev, label])
    setCurrentVariantLabel('')
  }, [currentVariantLabel, variantInputs])

  const handleRemoveVariantInput = useCallback((index: number) => {
    setVariantInputs((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleFinish = useCallback(async () => {
    if (!createdCharacterId || variantInputs.length === 0) {
      onRefresh()
      onClose()
      return
    }
    try {
      setIsSavingVariants(true)
      for (const label of variantInputs) {
        await createVariant({ label })
      }
      showToast(t('editor.variantsAdded'), 'success')
    } catch {
      showToast(t('variant.createFailed'), 'error')
    } finally {
      setIsSavingVariants(false)
      onRefresh()
      onClose()
    }
  }, [createdCharacterId, variantInputs, createVariant, onRefresh, onClose, showToast, t])

  const handleSkipVariants = useCallback(() => {
    onRefresh()
    onClose()
  }, [onRefresh, onClose])

  return (
    <div className="glass-surface-elevated rounded-2xl p-6 mt-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold glass-text-primary">
            {isNew
              ? (step === 1 ? t('editor.createTitle') : t('editor.addVariantsTitle'))
              : t('editor.editTitle')}
          </h3>
          {isNew && (
            <div className="flex items-center gap-1.5 text-xs glass-text-tertiary">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${step === 1 ? 'bg-[var(--glass-accent)] text-white' : 'bg-[var(--glass-bg-muted)]'}`}>1</span>
              <span className="w-4 h-px bg-[var(--glass-border)]" />
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${step === 2 ? 'bg-[var(--glass-accent)] text-white' : 'bg-[var(--glass-bg-muted)]'}`}>2</span>
            </div>
          )}
        </div>
        <button onClick={onClose} className="glass-text-tertiary hover:glass-text-primary">
          <AppIcon name="closeSm" className="w-5 h-5" />
        </button>
      </div>

      {/* Step 1: Basic Info */}
      {step === 1 && (
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
              onClick={handleSaveBasicInfo}
            >
              {isNew ? t('editor.nextStep') : t('editor.save')}
            </GlassButton>
          </div>
        </div>
      )}

      {/* Step 2: Add Variants */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          <p className="text-sm glass-text-secondary">
            {t('editor.variantsHint')}
          </p>

          {/* Variant chips */}
          {variantInputs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {variantInputs.map((label, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm bg-[var(--glass-accent)]/10 text-[var(--glass-accent)]"
                >
                  {label}
                  <button
                    onClick={() => handleRemoveVariantInput(index)}
                    className="hover:text-[var(--glass-tone-danger-fg)] transition-colors"
                  >
                    <AppIcon name="closeSm" className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Add variant input */}
          <div className="flex items-center gap-2">
            <input
              className="glass-input flex-1 text-sm"
              value={currentVariantLabel}
              onChange={(e) => setCurrentVariantLabel(e.target.value)}
              placeholder={t('variant.labelPlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && handleAddVariantInput()}
            />
            <GlassButton
              variant="secondary"
              size="sm"
              onClick={handleAddVariantInput}
              disabled={!currentVariantLabel.trim()}
            >
              {t('variant.add')}
            </GlassButton>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <GlassButton variant="ghost" size="sm" onClick={handleSkipVariants}>
              {t('editor.skipVariants')}
            </GlassButton>
            <GlassButton
              variant="primary"
              size="sm"
              loading={isSavingVariants}
              onClick={handleFinish}
              disabled={variantInputs.length === 0}
            >
              {t('editor.finishCreate')}
            </GlassButton>
          </div>
        </div>
      )}
    </div>
  )
}
