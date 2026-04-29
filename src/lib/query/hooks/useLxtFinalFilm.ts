'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'
import type { LxtFinalFilmRow, LxtFinalFilmRowBindings } from '@/lib/lxt/final-film'
import { FINAL_FILM_TARGET_TYPE, buildFinalFilmTargetId } from '@/lib/lxt/final-film'
import { upsertTaskTargetOverlay, clearTaskTargetOverlay } from '../task-target-overlay'
import { queryKeys } from '../keys'

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
  const qc = useQueryClient()
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
    onMutate: async ({ shotIndex }) => {
      if (!projectId || !episodeId) return
      const targetId = buildFinalFilmTargetId(episodeId, shotIndex)
      // Immediately reflect "queued" state in the overlay so the UI shows loading without waiting for polling
      upsertTaskTargetOverlay(qc, {
        projectId,
        targetType: FINAL_FILM_TARGET_TYPE,
        targetId,
        phase: 'queued',
        intent: 'generate',
      })
      // Invalidate task state so the polling activates right away
      await qc.invalidateQueries({ queryKey: queryKeys.tasks.all(projectId), exact: false })
    },
    onError: (_err, { shotIndex }) => {
      if (!projectId || !episodeId) return
      clearTaskTargetOverlay(qc, {
        projectId,
        targetType: FINAL_FILM_TARGET_TYPE,
        targetId: buildFinalFilmTargetId(episodeId, shotIndex),
      })
    },
  })
}

/** 提交行级视频生成 */
export function useGenerateLxtFinalFilmVideo(projectId: string | null, episodeId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ shotIndex }: { shotIndex: number }) => {
      if (!projectId || !episodeId) throw new Error('projectId/episodeId required')
      const res = await apiFetch(
        `/api/lxt/${projectId}/final-film/${episodeId}/${shotIndex}/generate-video`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
      )
      if (!res.ok) await readError(res, 'Failed to submit video generation')
      return await res.json() as { taskId: string; generationMode?: string }
    },
    onMutate: async ({ shotIndex }) => {
      if (!projectId || !episodeId) return
      const targetId = buildFinalFilmTargetId(episodeId, shotIndex)
      upsertTaskTargetOverlay(qc, {
        projectId,
        targetType: FINAL_FILM_TARGET_TYPE,
        targetId,
        phase: 'queued',
        intent: 'generate',
      })
      await qc.invalidateQueries({ queryKey: queryKeys.tasks.all(projectId), exact: false })
    },
    onError: (_err, { shotIndex }) => {
      if (!projectId || !episodeId) return
      clearTaskTargetOverlay(qc, {
        projectId,
        targetType: FINAL_FILM_TARGET_TYPE,
        targetId: buildFinalFilmTargetId(episodeId, shotIndex),
      })
    },
  })
}

/** 设置成片画风风格 */
export function useSetLxtArtStyle(projectId: string | null, episodeId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ artStyle }: { artStyle: string }) => {
      if (!projectId || !episodeId) throw new Error('projectId/episodeId required')
      const res = await apiFetch(`/api/lxt/${projectId}/final-film/${episodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setArtStyle: artStyle }),
      })
      if (!res.ok) await readError(res, 'Failed to set art style')
      return await res.json()
    },
    onSuccess: () => {
      if (projectId && episodeId) void invalidateEpisode(qc, projectId, episodeId)
    },
  })
}

/** 设置成片图片/视频生成比例 */
export function useSetLxtVideoRatio(projectId: string | null, episodeId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ videoRatio }: { videoRatio: string }) => {
      if (!projectId || !episodeId) throw new Error('projectId/episodeId required')
      const res = await apiFetch(`/api/lxt/${projectId}/final-film/${episodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setVideoRatio: videoRatio }),
      })
      if (!res.ok) await readError(res, 'Failed to set video ratio')
      return await res.json()
    },
    onSuccess: () => {
      if (projectId && episodeId) void invalidateEpisode(qc, projectId, episodeId)
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

/** 设置旁白音色 ID（P1-3） */
export function useSetLxtNarratorVoiceId(projectId: string | null, episodeId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ narratorVoiceId }: { narratorVoiceId: string }) => {
      if (!projectId || !episodeId) throw new Error('projectId/episodeId required')
      const res = await apiFetch(`/api/lxt/${projectId}/final-film/${episodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setNarratorVoiceId: narratorVoiceId }),
      })
      if (!res.ok) await readError(res, 'Failed to set narrator voice ID')
      return await res.json()
    },
    onSuccess: () => {
      if (projectId && episodeId) void invalidateEpisode(qc, projectId, episodeId)
    },
  })
}

/** 设置旁白声音描述文本（P1-3） */
export function useSetLxtNarratorVoicePrompt(projectId: string | null, episodeId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ narratorVoicePrompt }: { narratorVoicePrompt: string }) => {
      if (!projectId || !episodeId) throw new Error('projectId/episodeId required')
      const res = await apiFetch(`/api/lxt/${projectId}/final-film/${episodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setNarratorVoicePrompt: narratorVoicePrompt }),
      })
      if (!res.ok) await readError(res, 'Failed to set narrator voice prompt')
      return await res.json()
    },
    onSuccess: () => {
      if (projectId && episodeId) void invalidateEpisode(qc, projectId, episodeId)
    },
  })
}

/** 提交行级音频生成（P1-3） */
export function useGenerateLxtFinalFilmAudio(projectId: string | null, episodeId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ shotIndex }: { shotIndex: number }) => {
      if (!projectId || !episodeId) throw new Error('projectId/episodeId required')
      const res = await apiFetch(
        `/api/lxt/${projectId}/final-film/${episodeId}/${shotIndex}/generate-audio`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
      )
      if (!res.ok) await readError(res, 'Failed to submit audio generation')
      return await res.json() as { taskId: string }
    },
    onMutate: async ({ shotIndex }) => {
      if (!projectId || !episodeId) return
      const targetId = buildFinalFilmTargetId(episodeId, shotIndex)
      upsertTaskTargetOverlay(qc, {
        projectId,
        targetType: FINAL_FILM_TARGET_TYPE,
        targetId,
        phase: 'queued',
        intent: 'generate',
      })
      await qc.invalidateQueries({ queryKey: queryKeys.tasks.all(projectId), exact: false })
    },
    onError: (_err, { shotIndex }) => {
      if (!projectId || !episodeId) return
      clearTaskTargetOverlay(qc, {
        projectId,
        targetType: FINAL_FILM_TARGET_TYPE,
        targetId: buildFinalFilmTargetId(episodeId, shotIndex),
      })
    },
  })
}
