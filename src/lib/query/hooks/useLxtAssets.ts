'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'
import { queryKeys } from '@/lib/query/keys'

export type LxtAssetKind = 'character' | 'location' | 'prop'

export interface LxtProjectAsset {
  id: string
  lxtProjectId: string
  kind: LxtAssetKind
  name: string
  summary?: string | null
  globalCharacterId?: string | null
  globalLocationId?: string | null
  globalPropId?: string | null
  voiceId?: string | null
  voiceType?: string | null
  customVoiceUrl?: string | null
  imageUrl?: string | null
  imageMediaId?: string | null
  createdAt: string
  updatedAt: string
}

interface AssetsResponse {
  assets: LxtProjectAsset[]
  counts: Record<LxtAssetKind, number>
}

async function readError(res: Response, fallback: string) {
  const error = await res.json().catch(() => ({}))
  throw new Error(resolveTaskErrorMessage(error, fallback))
}

export function useLxtAssets(projectId: string | null) {
  return useQuery({
    queryKey: queryKeys.lxtAssets.list(projectId ?? ''),
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID is required')
      const res = await apiFetch(`/api/lxt/${projectId}/assets`)
      if (!res.ok) await readError(res, 'Failed to load LXT assets')
      return await res.json() as AssetsResponse
    },
    enabled: !!projectId,
    staleTime: 5_000,
  })
}

function useInvalidate(projectId: string | null) {
  const queryClient = useQueryClient()
  return async () => {
    if (!projectId) return
    await queryClient.invalidateQueries({ queryKey: queryKeys.lxtAssets.all(projectId) })
  }
}

export function useInitializeLxtAssets(projectId: string | null) {
  const invalidate = useInvalidate(projectId)
  return useMutation({
    mutationFn: async (body?: { episodeId?: string | null }) => {
      if (!projectId) throw new Error('Project ID is required')
      const res = await apiFetch(`/api/lxt/${projectId}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      if (!res.ok) await readError(res, 'Failed to initialize LXT assets')
      return await res.json() as AssetsResponse
    },
    onSuccess: invalidate,
  })
}

export function useUpdateLxtAsset(projectId: string | null) {
  const invalidate = useInvalidate(projectId)
  return useMutation({
    mutationFn: async ({ assetId, ...body }: Partial<LxtProjectAsset> & { assetId: string }) => {
      if (!projectId) throw new Error('Project ID is required')
      const res = await apiFetch(`/api/lxt/${projectId}/assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) await readError(res, 'Failed to update LXT asset')
      return await res.json()
    },
    onSuccess: invalidate,
  })
}

export function useDeleteLxtAsset(projectId: string | null) {
  const invalidate = useInvalidate(projectId)
  return useMutation({
    mutationFn: async (assetId: string) => {
      if (!projectId) throw new Error('Project ID is required')
      const res = await apiFetch(`/api/lxt/${projectId}/assets/${assetId}`, { method: 'DELETE' })
      if (!res.ok) await readError(res, 'Failed to delete LXT asset')
      return await res.json()
    },
    onSuccess: invalidate,
  })
}

export function useClearLxtAssets(projectId: string | null) {
  const invalidate = useInvalidate(projectId)
  return useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('Project ID is required')
      const res = await apiFetch(`/api/lxt/${projectId}/assets`, { method: 'DELETE' })
      if (!res.ok) await readError(res, 'Failed to clear LXT assets')
      return await res.json() as { deleted: number }
    },
    onSuccess: invalidate,
  })
}

export function useBindGlobalLxtAsset(projectId: string | null) {
  const invalidate = useInvalidate(projectId)
  return useMutation({
    mutationFn: async ({ assetId, globalAssetId }: { assetId: string; globalAssetId: string }) => {
      if (!projectId) throw new Error('Project ID is required')
      const res = await apiFetch(`/api/lxt/${projectId}/assets/${assetId}/bind-global`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ globalAssetId }),
      })
      if (!res.ok) await readError(res, 'Failed to bind global asset')
      return await res.json()
    },
    onSuccess: invalidate,
  })
}

export function useUpdateLxtAssetVoice(projectId: string | null) {
  const invalidate = useInvalidate(projectId)
  return useMutation({
    mutationFn: async ({ assetId, voiceId, voiceType, customVoiceUrl }: { assetId: string; voiceId?: string | null; voiceType?: string | null; customVoiceUrl?: string | null }) => {
      if (!projectId) throw new Error('Project ID is required')
      const res = await apiFetch(`/api/lxt/${projectId}/assets/${assetId}/voice`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId, voiceType, customVoiceUrl }),
      })
      if (!res.ok) await readError(res, 'Failed to update voice binding')
      return await res.json()
    },
    onSuccess: invalidate,
  })
}
