export type LmStudioModelType = 'llm' | 'embedding'

export interface LmStudioNativeModel {
  key: string
  displayName: string
  type: LmStudioModelType
  isLoaded: boolean
  loadedInstanceIds: string[]
  contextLength?: number
  maxContextLength?: number
  sizeBytes?: number
  quantizationBits?: number
}

export interface ListLmStudioModelsInput {
  baseUrl: string
  apiKey?: string
}

export interface LoadLmStudioModelInput extends ListLmStudioModelsInput {
  model: string
  contextLength?: number
  flashAttention?: boolean
}

export interface UnloadLmStudioModelInput extends ListLmStudioModelsInput {
  instanceId: string
}

export interface LmStudioLoadResult {
  instanceId: string
  status: 'loaded'
  contextLength?: number
  loadTimeSeconds?: number
  type?: LmStudioModelType
}

export interface LmStudioUnloadResult {
  instanceId: string
}

function toErrorMessage(status: number, bodyText: string): string {
  const detail = bodyText.trim().slice(0, 300)
  return `LMSTUDIO_NATIVE_REQUEST_FAILED: ${status}${detail ? ` ${detail}` : ''}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function buildAuthHeaders(apiKey?: string, json = false): HeadersInit {
  const headers: Record<string, string> = {}
  if (json) headers['Content-Type'] = 'application/json'
  const token = typeof apiKey === 'string' ? apiKey.trim() : ''
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export function toLmStudioNativeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  if (!trimmed) throw new Error('LMSTUDIO_BASE_URL_REQUIRED')

  try {
    const parsed = new URL(trimmed)
    const cleanPath = parsed.pathname.replace(/\/+$/, '')

    if (cleanPath === '/api/v1') {
      parsed.pathname = '/api/v1'
      return parsed.toString().replace(/\/$/, '')
    }

    if (cleanPath.endsWith('/v1')) {
      parsed.pathname = `${cleanPath.slice(0, -3) || ''}/api/v1`
      return parsed.toString().replace(/\/$/, '')
    }

    parsed.pathname = `${cleanPath === '' || cleanPath === '/' ? '' : cleanPath}/api/v1`
    return parsed.toString().replace(/\/$/, '')
  } catch {
    throw new Error('LMSTUDIO_BASE_URL_INVALID')
  }
}

export async function listLmStudioModels(input: ListLmStudioModelsInput): Promise<LmStudioNativeModel[]> {
  const endpoint = `${toLmStudioNativeBaseUrl(input.baseUrl)}/models`
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: buildAuthHeaders(input.apiKey),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(toErrorMessage(response.status, errorText))
  }

  const payload = await response.json() as unknown
  const record = asRecord(payload)
  const rawModels = Array.isArray(record?.models) ? record.models : null
  if (!rawModels) throw new Error('LMSTUDIO_MODELS_RESPONSE_INVALID')

  return rawModels
    .map((item) => {
      const model = asRecord(item)
      if (!model) return null
      const key = typeof model.key === 'string' ? model.key : ''
      if (!key) return null
      const loadedInstances = Array.isArray(model.loaded_instances) ? model.loaded_instances : []
      const firstLoaded = asRecord(loadedInstances[0])
      const firstConfig = asRecord(firstLoaded?.config)
      const quantization = asRecord(model.quantization)
      const maxContextLength = typeof model.max_context_length === 'number' ? model.max_context_length : undefined
      const contextLength = typeof firstConfig?.context_length === 'number' ? firstConfig.context_length : undefined
      const sizeBytes = typeof model.size_bytes === 'number' ? model.size_bytes : undefined
      const quantizationBits = typeof quantization?.bits_per_weight === 'number' ? quantization.bits_per_weight : undefined
      return {
        key,
        displayName: typeof model.display_name === 'string' && model.display_name.trim() ? model.display_name : key,
        type: model.type === 'embedding' ? 'embedding' : 'llm',
        isLoaded: loadedInstances.length > 0,
        loadedInstanceIds: loadedInstances
          .map((instance) => asRecord(instance))
          .filter((instance): instance is Record<string, unknown> => !!instance)
          .map((instance) => typeof instance.id === 'string' ? instance.id : '')
          .filter(Boolean),
        ...(typeof contextLength === 'number' ? { contextLength } : {}),
        ...(typeof maxContextLength === 'number' ? { maxContextLength } : {}),
        ...(typeof sizeBytes === 'number' ? { sizeBytes } : {}),
        ...(typeof quantizationBits === 'number' ? { quantizationBits } : {}),
      } satisfies LmStudioNativeModel
    })
    .filter((model): model is LmStudioNativeModel => model !== null)
}

export async function loadLmStudioModel(input: LoadLmStudioModelInput): Promise<LmStudioLoadResult> {
  const endpoint = `${toLmStudioNativeBaseUrl(input.baseUrl)}/models/load`
  const body: Record<string, unknown> = {
    model: input.model,
    echo_load_config: true,
  }
  if (typeof input.contextLength === 'number' && Number.isFinite(input.contextLength) && input.contextLength > 0) {
    body.context_length = input.contextLength
  }
  if (typeof input.flashAttention === 'boolean') {
    body.flash_attention = input.flashAttention
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: buildAuthHeaders(input.apiKey, true),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(toErrorMessage(response.status, errorText))
  }

  const payload = await response.json() as Record<string, unknown>
  return {
    instanceId: typeof payload.instance_id === 'string' ? payload.instance_id : input.model,
    status: 'loaded',
    ...(typeof payload.load_time_seconds === 'number' ? { loadTimeSeconds: payload.load_time_seconds } : {}),
    ...(payload.type === 'embedding' || payload.type === 'llm' ? { type: payload.type } : {}),
    ...(typeof asRecord(payload.load_config)?.context_length === 'number'
      ? { contextLength: asRecord(payload.load_config)?.context_length as number }
      : {}),
  }
}

export async function unloadLmStudioModel(input: UnloadLmStudioModelInput): Promise<LmStudioUnloadResult> {
  const endpoint = `${toLmStudioNativeBaseUrl(input.baseUrl)}/models/unload`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: buildAuthHeaders(input.apiKey, true),
    body: JSON.stringify({ instance_id: input.instanceId }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(toErrorMessage(response.status, errorText))
  }

  const payload = await response.json() as Record<string, unknown>
  return {
    instanceId: typeof payload.instance_id === 'string' ? payload.instance_id : input.instanceId,
  }
}
