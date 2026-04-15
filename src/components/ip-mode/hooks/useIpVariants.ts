'use client'

/**
 * IP 变体管理 hook — 角色级变体 CRUD
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import type { IpVariantSummary, CreateIpVariantInput } from '../types'

function variantsKey(characterId: string) {
  return ['ip-hub', 'characters', characterId, 'variants'] as const
}

export function useIpVariants(characterId: string) {
  const queryClient = useQueryClient()
  const key = variantsKey(characterId)

  const query = useQuery<IpVariantSummary[]>({
    queryKey: key,
    queryFn: async () => {
      const res = await apiFetch(`/api/ip-hub/characters/${characterId}/variants`)
      if (!res.ok) throw new Error('Failed to load variants')
      const data = await res.json()
      return data.variants ?? []
    },
    staleTime: 30_000,
    enabled: !!characterId,
  })

  const createMutation = useMutation({
    mutationFn: async (input: CreateIpVariantInput) => {
      const res = await apiFetch(`/api/ip-hub/characters/${characterId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error('Failed to create variant')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (variantId: string) => {
      const res = await apiFetch(`/api/ip-hub/characters/${characterId}/variants/${variantId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete variant')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key })
    },
  })

  return {
    variants: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createVariant: createMutation.mutateAsync,
    deleteVariant: deleteMutation.mutateAsync,
    refresh: () => queryClient.invalidateQueries({ queryKey: key }),
  }
}
