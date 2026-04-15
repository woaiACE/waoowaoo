'use client'

/**
 * IP 音色绑定器 — 为 IP 角色绑定固定音色 + 情感配置
 */

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useToast } from '@/contexts/ToastContext'
import { AppIcon } from '@/components/ui/icons'
import GlassButton from '@/components/ui/primitives/GlassButton'
import type { IpCharacterDetail } from './types'

interface IpVoiceBinderProps {
  character: IpCharacterDetail
  onRefresh: () => void
}

const EMOTION_PRESETS = [
  'neutral', 'happy', 'sad', 'angry', 'fearful',
  'surprised', 'disgusted', 'tender', 'excited',
] as const

export default function IpVoiceBinder({ character, onRefresh }: IpVoiceBinderProps) {
  const t = useTranslations('ipMode')
  const { showToast } = useToast()
  const [selectedVoiceId, setSelectedVoiceId] = useState(character.voiceId || '')
  const [isSaving, setIsSaving] = useState(false)

  const emotionConfig = (character.voiceEmotionConfigJson as Record<string, unknown>) || {}

  const handleBindVoice = useCallback(async () => {
    if (!selectedVoiceId.trim()) {
      showToast(t('voice.selectRequired'), 'error')
      return
    }
    try {
      setIsSaving(true)
      const res = await fetch(`/api/ip-hub/characters/${character.id}/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId: selectedVoiceId }),
      })
      if (!res.ok) throw new Error('failed')
      showToast(t('voice.bound'), 'success')
      onRefresh()
    } catch {
      showToast(t('voice.bindFailed'), 'error')
    } finally {
      setIsSaving(false)
    }
  }, [selectedVoiceId, character.id, showToast, t, onRefresh])

  const handleUnbind = useCallback(async () => {
    try {
      const res = await fetch(`/api/ip-hub/characters/${character.id}/voice`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('failed')
      showToast(t('voice.unbound'), 'success')
      setSelectedVoiceId('')
      onRefresh()
    } catch {
      showToast(t('voice.unbindFailed'), 'error')
    }
  }, [character.id, showToast, t, onRefresh])

  return (
    <div className="glass-surface-elevated rounded-2xl p-6">
      <h3 className="text-base font-semibold glass-text-primary mb-4">
        {t('voice.title')}
      </h3>

      {/* Current binding */}
      {character.voiceId ? (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--glass-bg-muted)] mb-4">
          <AppIcon name="mic" className="w-5 h-5 text-[var(--glass-tone-success-fg)]" />
          <div className="flex-1">
            <p className="text-sm glass-text-primary">
              {character.voiceModelKey || character.voiceId}
            </p>
            <p className="text-xs glass-text-tertiary">{t('voice.currentBinding')}</p>
          </div>
          <GlassButton variant="ghost" size="sm" onClick={handleUnbind}>
            {t('voice.unbind')}
          </GlassButton>
        </div>
      ) : (
        <p className="text-sm glass-text-tertiary mb-4">{t('voice.noBinding')}</p>
      )}

      {/* Voice selector */}
      <div className="flex flex-col gap-3">
        <div>
          <label className="glass-field-label text-sm mb-1 block">{t('voice.selectVoice')}</label>
          <input
            className="glass-input w-full"
            value={selectedVoiceId}
            onChange={(e) => setSelectedVoiceId(e.target.value)}
            placeholder={t('voice.voiceIdPlaceholder')}
          />
          <p className="glass-field-hint text-xs mt-1">{t('voice.voiceIdHint')}</p>
        </div>

        <GlassButton
          variant="primary"
          size="sm"
          loading={isSaving}
          onClick={handleBindVoice}
        >
          {t('voice.bind')}
        </GlassButton>
      </div>

      {/* Emotion presets preview */}
      {character.voiceId && (
        <div className="mt-4 pt-4 border-t border-[var(--glass-border)]">
          <h4 className="text-sm font-medium glass-text-primary mb-2">
            {t('voice.emotionPresets')}
          </h4>
          <div className="flex flex-wrap gap-2">
            {EMOTION_PRESETS.map((emotion) => (
              <span
                key={emotion}
                className={`
                  text-xs px-2 py-1 rounded-full
                  ${emotionConfig[emotion]
                    ? 'bg-[var(--glass-accent)]/20 text-[var(--glass-accent)]'
                    : 'bg-[var(--glass-bg-muted)] glass-text-tertiary'
                  }
                `}
              >
                {t(`emotion.${emotion}`)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
