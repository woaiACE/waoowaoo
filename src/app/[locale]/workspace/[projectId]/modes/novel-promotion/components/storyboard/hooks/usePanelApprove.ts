'use client'

import { useCallback, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query/keys'

interface UsePanelApproveOptions {
  projectId: string
  episodeId: string
}

/**
 * 管理 Panel 图片审核状态
 * - approvePanels(panelIds): 批量审核通过
 * - revokePanels(panelIds): 撤销审核
 * - approveStoryboard(storyboardId): 批准某分镜下全部有图帧
 * - optimistic: 乐观更新，不等服务端响应即更新 UI
 */
export function usePanelApprove({ projectId, episodeId }: UsePanelApproveOptions) {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)

  const setApprovalOptimistic = useCallback((panelIds: string[], approved: boolean) => {
    if (panelIds.length === 0) return
    const panelIdSet = new Set(panelIds)
    const approvedAt = approved ? new Date().toISOString() : null
    queryClient.setQueryData(queryKeys.episodeData(projectId, episodeId), (previous: unknown) => {
      if (!previous || typeof previous !== 'object') return previous
      const episode = previous as { storyboards?: Array<{ panels?: Array<{ id: string; imageApproved?: boolean; imageApprovedAt?: string | null }> }> }
      if (!Array.isArray(episode.storyboards)) return previous

      let changed = false
      const nextStoryboards = episode.storyboards.map((storyboard) => {
        if (!Array.isArray(storyboard.panels)) return storyboard
        const nextPanels = storyboard.panels.map((panel) => {
          if (!panelIdSet.has(panel.id)) return panel
          changed = true
          return {
            ...panel,
            imageApproved: approved,
            imageApprovedAt: approvedAt,
          }
        })
        return nextPanels === storyboard.panels ? storyboard : { ...storyboard, panels: nextPanels }
      })

      if (!changed) return previous
      return {
        ...episode,
        storyboards: nextStoryboards,
      }
    })
  }, [episodeId, projectId, queryClient])

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.storyboards.all(episodeId) })
  }, [queryClient, projectId, episodeId])

  const approvePanels = useCallback(async (panelIds: string[]) => {
    if (panelIds.length === 0) return
    setPending(true)
    try {
      setApprovalOptimistic(panelIds, true)
      await apiFetch(`/api/novel-promotion/${projectId}/panel/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ panelIds }),
      })
      invalidate()
    } catch (error) {
      // 回滚到服务端状态
      invalidate()
      throw error
    } finally {
      setPending(false)
    }
  }, [projectId, invalidate, setApprovalOptimistic])

  const revokePanels = useCallback(async (panelIds: string[]) => {
    if (panelIds.length === 0) return
    setPending(true)
    try {
      setApprovalOptimistic(panelIds, false)
      await apiFetch(`/api/novel-promotion/${projectId}/panel/approve`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ panelIds }),
      })
      invalidate()
    } catch (error) {
      // 回滚到服务端状态
      invalidate()
      throw error
    } finally {
      setPending(false)
    }
  }, [projectId, invalidate, setApprovalOptimistic])

  const approveStoryboard = useCallback(async (storyboardId: string) => {
    setPending(true)
    try {
      await apiFetch(`/api/novel-promotion/${projectId}/panel/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyboardId }),
      })
      invalidate()
    } finally {
      setPending(false)
    }
  }, [projectId, invalidate])

  return { approvePanels, revokePanels, approveStoryboard, pending }
}
