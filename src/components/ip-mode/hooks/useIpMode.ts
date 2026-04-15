'use client'

/**
 * IP 模式状态 hook — 项目级 IP 模式启用/禁用
 */

import { useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api-fetch'

export function useIpMode(projectId: string, initialEnabled: boolean = false) {
  const [isEnabled, setIsEnabled] = useState(initialEnabled)
  const [isToggling, setIsToggling] = useState(false)

  const toggle = useCallback(async () => {
    const newState = !isEnabled
    const endpoint = newState ? 'enable' : 'disable'
    try {
      setIsToggling(true)
      const res = await apiFetch(`/api/novel-promotion/${projectId}/ip/${endpoint}`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('toggle failed')
      setIsEnabled(newState)
      return newState
    } finally {
      setIsToggling(false)
    }
  }, [isEnabled, projectId])

  return {
    isEnabled,
    isToggling,
    toggle,
    setIsEnabled,
  }
}
