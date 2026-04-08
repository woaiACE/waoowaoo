'use client'

import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'

export type CharacterRelation = {
  id: string
  novelPromotionProjectId: string
  fromName: string
  toName: string
  relationType: string
  direction: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export type CharacterNode = {
  id: string
  name: string
  aliases: string[]
  roleLevel: string
  profileConfirmed: boolean
  imageUrl: string | null
}

export type CharacterRelationsData = {
  relations: CharacterRelation[]
  characters: CharacterNode[]
  hasRelations: boolean
  hasCompletedGlobalAnalyze: boolean
  lastGlobalAnalyzeAt: string | null
}

export function useCharacterRelations(projectId: string) {
  return useQuery<CharacterRelationsData>({
    queryKey: ['characterRelations', projectId],
    queryFn: async () => {
      const response = await apiFetch(`/api/projects/${projectId}/character-relations`)
      if (!response.ok) {
        throw new Error('Failed to fetch character relations')
      }
      return response.json() as Promise<CharacterRelationsData>
    },
    staleTime: 30_000,
  })
}
