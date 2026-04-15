'use client'

/**
 * IP 模式开关 — 项目级启用/禁用 IP 角色模式
 */

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useToast } from '@/contexts/ToastContext'
import GlassButton from '@/components/ui/primitives/GlassButton'
import { AppIcon } from '@/components/ui/icons'

interface IpModeSwitcherProps {
  projectId: string
  isEnabled: boolean
  onToggle: (enabled: boolean) => void
}

export default function IpModeSwitcher({
  projectId,
  isEnabled,
  onToggle,
}: IpModeSwitcherProps) {
  const t = useTranslations('ipMode')
  const { showToast } = useToast()
  const [isToggling, setIsToggling] = useState(false)

  const handleToggle = useCallback(async () => {
    const newState = !isEnabled
    const endpoint = newState ? 'enable' : 'disable'
    try {
      setIsToggling(true)
      const res = await fetch(`/api/novel-promotion/${projectId}/ip/${endpoint}`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('toggle failed')
      onToggle(newState)
      showToast(
        newState ? t('mode.enabled') : t('mode.disabled'),
        'success',
      )
    } catch {
      showToast(t('mode.toggleFailed'), 'error')
    } finally {
      setIsToggling(false)
    }
  }, [isEnabled, projectId, onToggle, showToast, t])

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl glass-surface-elevated">
      <AppIcon
        name="user"
        className={`w-5 h-5 ${isEnabled ? 'text-[var(--glass-accent)]' : 'glass-text-tertiary'}`}
      />
      <div className="flex-1">
        <p className="text-sm font-medium glass-text-primary">{t('mode.title')}</p>
        <p className="text-xs glass-text-tertiary">
          {isEnabled ? t('mode.enabledHint') : t('mode.disabledHint')}
        </p>
      </div>
      <GlassButton
        variant={isEnabled ? 'secondary' : 'primary'}
        size="sm"
        loading={isToggling}
        onClick={handleToggle}
      >
        {isEnabled ? t('mode.disable') : t('mode.enable')}
      </GlassButton>
    </div>
  )
}
