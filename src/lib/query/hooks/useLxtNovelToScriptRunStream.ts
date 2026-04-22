'use client'

import { useRunStreamState, type RunResult } from './run-stream/run-stream-state-runtime'
import { TASK_TYPE } from '@/lib/task/types'
import { apiFetch } from '@/lib/api-fetch'
import { selectRecoverableRun } from '@/lib/run-runtime/recovery'

export type LxtNovelToScriptRunParams = {
  episodeId: string
  instruction?: string
  model?: string
  locale?: string
}

export type LxtNovelToScriptRunResult = RunResult

type UseLxtNovelToScriptRunStreamOptions = {
  projectId: string
  episodeId?: string | null
}

export function useLxtNovelToScriptRunStream({ projectId, episodeId }: UseLxtNovelToScriptRunStreamOptions) {
  return useRunStreamState<LxtNovelToScriptRunParams>({
    projectId,
    endpoint: (pid) => `/api/lxt-script/${pid}/novel-to-script-stream`,
    storageKeyPrefix: 'lxt:novel-to-script-run',
    storageScopeKey: episodeId || undefined,
    resolveActiveRunId: async ({ projectId: pid, storageScopeKey }) => {
      if (!storageScopeKey) return null
      const search = new URLSearchParams({
        projectId: pid,
        workflowType: TASK_TYPE.LXT_NOVEL_TO_SCRIPT,
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
      instruction: params.instruction || undefined,
      model: params.model || undefined,
      locale: params.locale || undefined,
      async: true,
      displayMode: 'detail',
    }),
  })
}
