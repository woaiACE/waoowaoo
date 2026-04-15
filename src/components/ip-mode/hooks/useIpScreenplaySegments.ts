'use client'

/**
 * IP 剧本片段 hook — 获取 clip 级别的结构化剧本片段
 */

import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import type { IpScreenplaySegment } from '../types'

function segmentsKey(projectId: string, clipId: string) {
  return ['ip-mode', 'screenplay-segments', projectId, clipId] as const
}

export function useIpScreenplaySegments(projectId: string, clipId: string) {
  const query = useQuery<IpScreenplaySegment[]>({
    queryKey: segmentsKey(projectId, clipId),
    queryFn: async () => {
      const res = await apiFetch(
        `/api/novel-promotion/${projectId}/ip/screenplay-segments/${clipId}`,
      )
      if (!res.ok) throw new Error('Failed to load screenplay segments')
      const data = await res.json()
      return data.segments ?? []
    },
    staleTime: 30_000,
    enabled: !!projectId && !!clipId,
  })

  return {
    segments: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  }
}
