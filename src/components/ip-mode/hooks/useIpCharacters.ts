'use client'

/**
 * IP 角色列表 hook — 用户全局 IP 角色 CRUD
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import type { IpCharacterSummary, CreateIpCharacterInput } from '../types'

const IP_CHARACTERS_KEY = ['ip-hub', 'characters'] as const

export function useIpCharacters() {
  const queryClient = useQueryClient()

  const query = useQuery<IpCharacterSummary[]>({
    queryKey: IP_CHARACTERS_KEY,
    queryFn: async () => {
      const res = await apiFetch('/api/ip-hub/characters')
      if (!res.ok) throw new Error('Failed to load IP characters')
      const data = await res.json()
      return data.characters ?? []
    },
    staleTime: 30_000,
  })

  const createMutation = useMutation({
    mutationFn: async (input: CreateIpCharacterInput) => {
      const res = await apiFetch('/api/ip-hub/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error('Failed to create IP character')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: IP_CHARACTERS_KEY })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (characterId: string) => {
      const res = await apiFetch(`/api/ip-hub/characters/${characterId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete IP character')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: IP_CHARACTERS_KEY })
    },
  })

  return {
    characters: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createCharacter: createMutation.mutateAsync,
    deleteCharacter: deleteMutation.mutateAsync,
    refresh: () => queryClient.invalidateQueries({ queryKey: IP_CHARACTERS_KEY }),
  }
}
