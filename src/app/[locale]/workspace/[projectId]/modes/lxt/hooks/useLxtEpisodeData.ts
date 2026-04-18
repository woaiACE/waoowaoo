'use client'

import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'

export interface LxtEpisode {
  id: string
  lxtProjectId: string
  episodeNumber: number
  name: string
  novelText?: string | null
  srtContent?: string | null
  shotListContent?: string | null
  scriptContent?: string | null
  createdAt: string
  updatedAt: string
}

export function useLxtEpisodeData(
  projectId: string | null,
  episodeId: string | null
) {
  return useQuery({
    queryKey: ['lxtEpisodeData', projectId, episodeId],
    queryFn: async () => {
      if (!projectId || !episodeId) throw new Error('Project ID and Episode ID are required')
      const res = await apiFetch(`/api/lxt/${projectId}/episodes/${episodeId}`)
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(resolveTaskErrorMessage(error, 'Failed to load episode'))
      }
      const data = await res.json()
      return data.episode as LxtEpisode
    },
    enabled: !!projectId && !!episodeId,
    staleTime: 5000,
  })
}
