'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'
import type { LxtFinalFilmRow, LxtFinalFilmRowBindings } from '@/lib/lxt/final-film'

async function readError(res: Response, fallback: string): Promise<never> {
  const error = await res.json().catch(() => ({}))
  throw new Error(resolveTaskErrorMessage(error, fallback))
}

function invalidateEpisode(
  qc: ReturnType<typeof useQueryClient>,
  projectId: string,
  episodeId: string,
) {
  return qc.invalidateQueries({ queryKey: ['lxtEpisodeData', projectId, episodeId] })
}

/** 行级字段 merge PATCH（推荐主通路）*/
export function usePatchLxtFinalFilmRow(projectId: string | null, episodeId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      shotIndex,
      patch,
    }: {
      shotIndex: number
      patch: Partial<LxtFinalFilmRow> & { bindings?: LxtFinalFilmRowBindings }
    }) => {
      if (!projectId || !episodeId) throw new Error('projectId/episodeId required')
      const res = await apiFetch(`/api/lxt/${projectId}/final-film/${episodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shotIndex, patch }),
      })
      if (!res.ok) await readError(res, 'Failed to update final-film row')
      return await res.json()
    },
    onSuccess: () => {
      if (projectId && episodeId) void invalidateEpisode(qc, projectId, episodeId)
    },
  })
}

/** 与当前 shotListContent 做骨架对齐 */
export function useReconcileLxtFinalFilm(projectId: string | null, episodeId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!projectId || !episodeId) throw new Error('projectId/episodeId required')
      const res = await apiFetch(`/api/lxt/${projectId}/final-film/${episodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reconcile: true }),
      })
      if (!res.ok) await readError(res, 'Failed to reconcile final-film rows')
      return await res.json()
    },
    onSuccess: () => {
      if (projectId && episodeId) void invalidateEpisode(qc, projectId, episodeId)
    },
  })
}

/** 提交行级图片生成 */
export function useGenerateLxtFinalFilmImage(projectId: string | null, episodeId: string | null) {
  return useMutation({
    mutationFn: async ({ shotIndex }: { shotIndex: number }) => {
      if (!projectId || !episodeId) throw new Error('projectId/episodeId required')
      const res = await apiFetch(
        `/api/lxt/${projectId}/final-film/${episodeId}/${shotIndex}/generate-image`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
      )
      if (!res.ok) await readError(res, 'Failed to submit image generation')
      return await res.json() as { taskId: string }
    },
  })
}

/** 提交行级视频生成 */
export function useGenerateLxtFinalFilmVideo(projectId: string | null, episodeId: string | null) {
  return useMutation({
    mutationFn: async ({ shotIndex }: { shotIndex: number }) => {
      if (!projectId || !episodeId) throw new Error('projectId/episodeId required')
      const res = await apiFetch(
        `/api/lxt/${projectId}/final-film/${episodeId}/${shotIndex}/generate-video`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
      )
      if (!res.ok) await readError(res, 'Failed to submit video generation')
      return await res.json() as { taskId: string }
    },
  })
}

/**
 * 从制作脚本自动填充文案/提示词 + 资产库自动绑定角色/场景
 *
 * 服务端策略：
 *  - 已有手动填写的字段不会被覆盖（只填空字段）
 *  - 角色/场景按名称精确匹配资产库
 *  - 同时执行骨架 reconcile（确保行数与分镜一致）
 */
export function useAutoFillLxtFinalFilm(projectId: string | null, episodeId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!projectId || !episodeId) throw new Error('projectId/episodeId required')
      const res = await apiFetch(`/api/lxt/${projectId}/final-film/${episodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoFillFromScript: true }),
      })
      if (!res.ok) await readError(res, 'Failed to auto-fill final-film rows')
      return await res.json()
    },
    onSuccess: () => {
      if (projectId && episodeId) void invalidateEpisode(qc, projectId, episodeId)
    },
  })
}
