import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import {
  listLmStudioModels,
  loadLmStudioModel,
  unloadLmStudioModel,
} from '@/lib/lmstudio/native'
import { getLmStudioRuntimeStats } from '@/lib/lmstudio/runtime'

type ManageAction = 'list' | 'load' | 'unload'

type RequestBody = {
  action?: unknown
  baseUrl?: unknown
  apiKey?: unknown
  model?: unknown
  instanceId?: unknown
  contextLength?: unknown
  flashAttention?: unknown
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'LMSTUDIO_NATIVE_INVALID',
      field,
    })
  }
  return value.trim()
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function readOptionalPositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return value
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as RequestBody
  const action = readRequiredString(body.action, 'action') as ManageAction
  const baseUrl = readRequiredString(body.baseUrl, 'baseUrl')
  const apiKey = readOptionalString(body.apiKey) || ''

  try {
    if (action === 'list') {
      const models = await listLmStudioModels({ baseUrl, apiKey })
      const runtime = await getLmStudioRuntimeStats(models)
      return NextResponse.json({ success: true, models, runtime })
    }

    if (action === 'load') {
      const model = readRequiredString(body.model, 'model')
      const result = await loadLmStudioModel({
        baseUrl,
        apiKey,
        model,
        contextLength: readOptionalPositiveNumber(body.contextLength),
        flashAttention: readOptionalBoolean(body.flashAttention),
      })
      return NextResponse.json({ success: true, result })
    }

    if (action === 'unload') {
      const instanceId = readRequiredString(body.instanceId, 'instanceId')
      const result = await unloadLmStudioModel({ baseUrl, apiKey, instanceId })
      return NextResponse.json({ success: true, result })
    }

    throw new ApiError('INVALID_PARAMS', {
      code: 'LMSTUDIO_NATIVE_ACTION_INVALID',
      field: 'action',
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'LMSTUDIO_NATIVE_UNKNOWN_ERROR',
    })
  }
})
