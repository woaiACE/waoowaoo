'use client'

/**
 * IP 选角管理 hook — 项目级 IP 角色选角 CRUD
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import type { IpCastingSummary, CreateIpCastingInput } from '../types'

function castingsKey(projectId: string) {
  return ['ip-mode', 'castings', projectId] as const
}

export function useIpCastings(projectId: string) {
  const queryClient = useQueryClient()
  const key = castingsKey(projectId)

  const query = useQuery<IpCastingSummary[]>({
    queryKey: key,
    queryFn: async () => {
      const res = await apiFetch(`/api/novel-promotion/${projectId}/ip/cast`)
      if (!res.ok) throw new Error('Failed to load castings')
      const data = await res.json()
      return data.castings ?? []
    },
    staleTime: 30_000,
    enabled: !!projectId,
  })

  const createMutation = useMutation({
    mutationFn: async (input: CreateIpCastingInput) => {
      const res = await apiFetch(`/api/novel-promotion/${projectId}/ip/cast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error('Failed to create casting')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (castingId: string) => {
      const res = await apiFetch(`/api/novel-promotion/${projectId}/ip/cast/${castingId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete casting')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key })
    },
  })

  return {
    castings: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createCasting: createMutation.mutateAsync,
    deleteCasting: deleteMutation.mutateAsync,
    refresh: () => queryClient.invalidateQueries({ queryKey: key }),
  }
}
