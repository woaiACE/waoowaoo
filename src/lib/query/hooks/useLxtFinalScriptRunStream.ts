'use client'

import { useRunStreamState, type RunResult } from './run-stream/run-stream-state-runtime'
import { TASK_TYPE } from '@/lib/task/types'
import { apiFetch } from '@/lib/api-fetch'
import { selectRecoverableRun } from '@/lib/run-runtime/recovery'

export type LxtFinalScriptRunParams = {
  episodeId: string
  model?: string
  locale?: string
}

export type LxtFinalScriptRunResult = RunResult

type UseLxtFinalScriptRunStreamOptions = {
  projectId: string
  episodeId?: string | null
}

export function useLxtFinalScriptRunStream({ projectId, episodeId }: UseLxtFinalScriptRunStreamOptions) {
  return useRunStreamState<LxtFinalScriptRunParams>({
    projectId,
    endpoint: (pid) => `/api/lxt-script/${pid}/generate-stream`,
    storageKeyPrefix: 'lxt:final-script-run',
    storageScopeKey: episodeId || undefined,
    resolveActiveRunId: async ({ projectId: pid, storageScopeKey }) => {
      if (!storageScopeKey) return null
      const search = new URLSearchParams({
        projectId: pid,
        workflowType: TASK_TYPE.LXT_STORYBOARD_TO_SCRIPT,
        targetType: 'LxtEpisode',
        targetId: storageScopeKey,
        episodeId: storageScopeKey,
        limit: '20',
      })
      search.append('status', 'queued')
      search.append('status', 'running')
      search.append('status', 'canceling')
      search.set('_v', '2')
      const response = await apiFetch(`/api/runs?${search.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      })
      if (!response.ok) return null
      const data = await response.json().catch(() => null)
      const runs = data && typeof data === 'object' && Array.isArray((data as { runs?: unknown[] }).runs)
        ? (data as {
          runs: Array<{
            id?: unknown
            status?: unknown
            createdAt?: unknown
            updatedAt?: unknown
            leaseExpiresAt?: unknown
            heartbeatAt?: unknown
          }>
        }).runs
        : []
      const decision = selectRecoverableRun(runs.map((run) => ({
        id: typeof run?.id === 'string' ? run.id : null,
        status: typeof run?.status === 'string' ? run.status : null,
        createdAt: typeof run?.createdAt === 'string' ? run.createdAt : null,
        updatedAt: typeof run?.updatedAt === 'string' ? run.updatedAt : null,
        leaseExpiresAt: typeof run?.leaseExpiresAt === 'string' ? run.leaseExpiresAt : null,
        heartbeatAt: typeof run?.heartbeatAt === 'string' ? run.heartbeatAt : null,
      })))
      return decision.runId
    },
    validateParams: (params) => {
      if (!params.episodeId) {
        throw new Error('episodeId is required')
      }
    },
    buildRequestBody: (params) => ({
      episodeId: params.episodeId,
      model: params.model || undefined,
      locale: params.locale || undefined,
      async: true,
      displayMode: 'detail',
    }),
  })
}
