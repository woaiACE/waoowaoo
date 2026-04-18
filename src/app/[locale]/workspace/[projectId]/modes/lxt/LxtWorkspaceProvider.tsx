'use client'

import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query/keys'

interface LxtWorkspaceContextValue {
  projectId: string
  episodeId?: string
  onRefresh: (options?: { scope?: string }) => Promise<void>
}

const LxtWorkspaceContext = createContext<LxtWorkspaceContextValue | null>(null)

export function LxtWorkspaceProvider({
  projectId,
  episodeId,
  children,
}: {
  projectId: string
  episodeId?: string
  children: ReactNode
}) {
  const queryClient = useQueryClient()

  const onRefresh = useCallback(async () => {
    const promises: Promise<unknown>[] = [
      queryClient.refetchQueries({ queryKey: queryKeys.projectData(projectId) }),
    ]
    if (episodeId) {
      // LXT episode 数据用独立 key
      promises.push(
        queryClient.refetchQueries({
          queryKey: ['lxtEpisodeData', projectId, episodeId],
        })
      )
    }
    await Promise.all(promises)
  }, [projectId, episodeId, queryClient])

  return (
    <LxtWorkspaceContext.Provider value={{ projectId, episodeId, onRefresh }}>
      {children}
    </LxtWorkspaceContext.Provider>
  )
}

export function useLxtWorkspaceProvider() {
  const ctx = useContext(LxtWorkspaceContext)
  if (!ctx) throw new Error('useLxtWorkspaceProvider must be used within LxtWorkspaceProvider')
  return ctx
}
