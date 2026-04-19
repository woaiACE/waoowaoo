'use client'

import { useRunStreamState, type RunResult } from './run-stream/run-stream-state-runtime'
import { TASK_TYPE } from '@/lib/task/types'
import { apiFetch } from '@/lib/api-fetch'
import { selectRecoverableRun } from '@/lib/run-runtime/recovery'

export type LxtAnalyzeAssetsRunResult = RunResult

type UseLxtAnalyzeAssetsRunStreamOptions = {
  projectId: string
}

export function useLxtAnalyzeAssetsRunStream({ projectId }: UseLxtAnalyzeAssetsRunStreamOptions) {
  return useRunStreamState<Record<string, unknown>>({
    projectId,
    endpoint: (pid) => `/api/lxt/${pid}/assets/analyze`,
    storageKeyPrefix: 'lxt:analyze-assets',
    resolveActiveRunId: async ({ projectId: pid }) => {
      const search = new URLSearchParams({
        projectId: pid,
        workflowType: TASK_TYPE.LXT_ANALYZE_ASSETS,
        targetType: 'LxtProject',
        limit: '5',
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
      const runs =
        data && typeof data === 'object' && Array.isArray((data as { runs?: unknown[] }).runs)
          ? (
              data as {
                runs: Array<{
                  id?: unknown
                  status?: unknown
                  createdAt?: unknown
                  updatedAt?: unknown
                  leaseExpiresAt?: unknown
                  heartbeatAt?: unknown
                }>
              }
            ).runs
          : []
      const decision = selectRecoverableRun(
        runs.map((run) => ({
          id: typeof run?.id === 'string' ? run.id : null,
          status: typeof run?.status === 'string' ? run.status : null,
          createdAt: typeof run?.createdAt === 'string' ? run.createdAt : null,
          updatedAt: typeof run?.updatedAt === 'string' ? run.updatedAt : null,
          leaseExpiresAt: typeof run?.leaseExpiresAt === 'string' ? run.leaseExpiresAt : null,
          heartbeatAt: typeof run?.heartbeatAt === 'string' ? run.heartbeatAt : null,
        })),
      )
      return decision.runId
    },
    buildRequestBody: (params) => ({
      ...params,
      async: true,
      displayMode: 'detail',
    }),
  })
}
