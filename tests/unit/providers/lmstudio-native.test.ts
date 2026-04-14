import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listLmStudioModels,
  loadLmStudioModel,
  toLmStudioNativeBaseUrl,
  unloadLmStudioModel,
} from '@/lib/lmstudio/native'

describe('lmstudio native model management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes openai-compatible base urls to native /api/v1 endpoints', () => {
    expect(toLmStudioNativeBaseUrl('http://127.0.0.1:5000/v1')).toBe('http://127.0.0.1:5000/api/v1')
    expect(toLmStudioNativeBaseUrl('http://127.0.0.1:5000/api/v1')).toBe('http://127.0.0.1:5000/api/v1')
    expect(toLmStudioNativeBaseUrl('http://127.0.0.1:5000')).toBe('http://127.0.0.1:5000/api/v1')
  })

  it('lists models and exposes loaded-state metadata', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      models: [
        {
          type: 'llm',
          key: 'qwen/qwen3.5-9b',
          display_name: 'Qwen 3.5 9B',
          max_context_length: 65536,
          size_bytes: 4294967296,
          quantization: { bits_per_weight: 8 },
          loaded_instances: [{ id: 'qwen/qwen3.5-9b', config: { context_length: 32768 } }],
        },
        {
          type: 'embedding',
          key: 'text-embedding-nomic-embed-text-v1.5-embedding',
          display_name: 'Nomic Embed',
          max_context_length: 2048,
          size_bytes: 268435456,
          quantization: { bits_per_weight: 16 },
          loaded_instances: [],
        },
      ],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const models = await listLmStudioModels({
      baseUrl: 'http://127.0.0.1:5000/v1',
      apiKey: '',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:5000/api/v1/models',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(models).toHaveLength(2)
    expect(models[0]).toEqual(expect.objectContaining({
      key: 'qwen/qwen3.5-9b',
      type: 'llm',
      isLoaded: true,
      contextLength: 32768,
      maxContextLength: 65536,
      sizeBytes: 4294967296,
      quantizationBits: 8,
    }))
    expect(models[1]).toEqual(expect.objectContaining({
      key: 'text-embedding-nomic-embed-text-v1.5-embedding',
      type: 'embedding',
      isLoaded: false,
      sizeBytes: 268435456,
      quantizationBits: 16,
    }))
  })

  it('loads a model with native LM Studio config', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      type: 'llm',
      instance_id: 'qwen/qwen3.5-9b',
      status: 'loaded',
      load_time_seconds: 1.2,
      load_config: { context_length: 32768, flash_attention: true },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await loadLmStudioModel({
      baseUrl: 'http://127.0.0.1:5000/v1',
      apiKey: '',
      model: 'qwen/qwen3.5-9b',
      contextLength: 32768,
      flashAttention: true,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:5000/api/v1/models/load',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    const loadCall = (fetchMock.mock.calls[0] as unknown[] | undefined)?.[1] as { body?: string } | undefined
    expect(JSON.parse(loadCall?.body || '{}')).toEqual({
      model: 'qwen/qwen3.5-9b',
      echo_load_config: true,
      context_length: 32768,
      flash_attention: true,
    })
    expect(result).toEqual(expect.objectContaining({
      instanceId: 'qwen/qwen3.5-9b',
      status: 'loaded',
      contextLength: 32768,
    }))
  })

  it('unloads a model by instance id', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      instance_id: 'qwen/qwen3.5-9b',
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await unloadLmStudioModel({
      baseUrl: 'http://127.0.0.1:5000/v1',
      apiKey: '',
      instanceId: 'qwen/qwen3.5-9b',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:5000/api/v1/models/unload',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ instance_id: 'qwen/qwen3.5-9b' }),
      }),
    )
    expect(result).toEqual({ instanceId: 'qwen/qwen3.5-9b' })
  })
})
