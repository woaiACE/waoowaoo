'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'
import { waitForTaskResult } from '@/lib/task/client'
import { queryKeys } from '@/lib/query/keys'

export type LxtAssetKind = 'character' | 'location' | 'prop'

export interface LxtProjectAsset {
  id: string
  lxtProjectId: string
  kind: LxtAssetKind
  name: string
  summary?: string | null
  profileData?: string | null       // JSON: CharacterProfileData (仅 character)
  description?: string | null       // LLM 生成的视觉形象描述提示词
  profileConfirmed?: boolean        // 是否已确认档案并生成描述
  globalCharacterId?: string | null
  globalLocationId?: string | null
  globalPropId?: string | null
  voiceId?: string | null
  voiceType?: string | null
  voicePrompt?: string | null
  customVoiceUrl?: string | null
  imageUrl?: string | null
  imageUrls?: string | null  // JSON array of generated image URLs
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

/** 更新角色档案（profileData）并立即刷新列表 */
export function useUpdateLxtAssetProfile(projectId: string | null) {
  const invalidate = useInvalidate(projectId)
  return useMutation({
    mutationFn: async ({ assetId, profileData }: { assetId: string; profileData: string }) => {
      if (!projectId) throw new Error('Project ID is required')
      const res = await apiFetch(`/api/lxt/${projectId}/assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileData }),
      })
      if (!res.ok) await readError(res, 'Failed to update asset profile')
      return await res.json()
    },
    onSuccess: invalidate,
  })
}

/** 提交 AI 图像生成任务 */
export function useGenerateLxtAssetImage(projectId: string | null) {
  const invalidate = useInvalidate(projectId)
  return useMutation({
    mutationFn: async ({ assetId, count = 1 }: { assetId: string; count?: number }) => {
      if (!projectId) throw new Error('Project ID is required')
      const res = await apiFetch(`/api/lxt/${projectId}/assets/${assetId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count }),
      })
      if (!res.ok) await readError(res, 'Failed to submit image generation')
      return await res.json()
    },
    onSuccess: invalidate,
  })
}

/** 选择主图（从多图生成结果中选一张设为 imageUrl）*/
export function useSelectLxtAssetImage(projectId: string | null) {
  const invalidate = useInvalidate(projectId)
  return useMutation({
    mutationFn: async ({ assetId, imageUrl }: { assetId: string; imageUrl: string }) => {
      if (!projectId) throw new Error('Project ID is required')
      const res = await apiFetch(`/api/lxt/${projectId}/assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl }),
      })
      if (!res.ok) await readError(res, 'Failed to select image')
      return await res.json()
    },
    onSuccess: invalidate,
  })
}

/** 上传自定义音色音频文件 */
export function useUploadLxtAssetVoice(projectId: string | null) {
  const invalidate = useInvalidate(projectId)
  return useMutation({
    mutationFn: async ({ assetId, file }: { assetId: string; file: File }) => {
      if (!projectId) throw new Error('Project ID is required')
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiFetch(`/api/lxt/${projectId}/assets/${assetId}/voice-upload`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) await readError(res, 'Failed to upload voice')
      return await res.json() as { audioUrl?: string }
    },
    onSuccess: invalidate,
  })
}

/** 保存 AI 设计的声音（base64 音频写回）*/
export function useSaveLxtAssetDesignedVoice(projectId: string | null) {
  const invalidate = useInvalidate(projectId)
  return useMutation({
    mutationFn: async ({
      assetId,
      voiceId,
      audioBase64,
    }: {
      assetId: string
      voiceId: string
      audioBase64: string
    }) => {
      if (!projectId) throw new Error('Project ID is required')
      const res = await apiFetch(`/api/lxt/${projectId}/assets/${assetId}/voice-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceDesign: { voiceId, audioBase64 } }),
      })
      if (!res.ok) await readError(res, 'Failed to save designed voice')
      return await res.json() as { audioUrl?: string }
    },
    onSuccess: invalidate,
  })
}

/** 提交 AI 音色参数推理任务并等待结果（LLM 根据角色档案推理 voicePrompt）*/
export function useInferLxtAssetVoicePrompt(projectId: string | null) {
  return useMutation({
    mutationFn: async (assetId: string): Promise<{ voicePrompt: string; params?: Record<string, unknown> }> => {
      if (!projectId) throw new Error('Project ID is required')
      const res = await apiFetch(`/api/lxt/${projectId}/assets/${assetId}/voice-infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) await readError(res, 'Failed to submit voice prompt inference')
      const { taskId } = await res.json() as { taskId: string }
      // 轮询等待 LLM 推理完成（通常 10~30s）
      const result = await waitForTaskResult(taskId, { intervalMs: 2000 }) as {
        voicePrompt?: string
        params?: Record<string, unknown>
      }
      if (!result.voicePrompt) throw new Error('推理结果为空，请重试')
      return { voicePrompt: result.voicePrompt, params: result.params }
    },
  })
}

/** AI 声音设计 — 提交任务并等待完成（任务 handler 自动写回资产）*/
export function useDesignLxtAssetVoice(projectId: string | null) {
  const invalidate = useInvalidate(projectId)
  return useMutation({
    mutationFn: async ({
      assetId,
      voicePrompt,
      previewText,
    }: {
      assetId: string
      voicePrompt: string
      previewText: string
    }) => {
      if (!projectId) throw new Error('Project ID is required')
      const res = await apiFetch(`/api/lxt/${projectId}/assets/${assetId}/voice-design`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voicePrompt, previewText }),
      })
      if (!res.ok) await readError(res, 'Failed to submit voice design')
      const { taskId } = await res.json() as { taskId: string }
      // 等待 BullMQ 任务完成（任务 handler 自动写回 LxtProjectAsset.voiceId）
      await waitForTaskResult(taskId, { intervalMs: 2000 })
    },
    onSuccess: invalidate,
  })
}
