import { describe, expect, it } from 'vitest'
import { PRESET_MODELS, PRESET_PROVIDERS } from '@/app/[locale]/profile/components/api-config/types'

describe('api-config minimax preset', () => {
  it('uses official minimax baseUrl in preset provider', () => {
    const minimaxProvider = PRESET_PROVIDERS.find((provider) => provider.id === 'minimax')
    expect(minimaxProvider).toBeDefined()
    expect(minimaxProvider?.baseUrl).toBe('https://api.minimaxi.com/v1')
  })

  it('includes the LM Studio local preset provider', () => {
    const lmStudioProvider = PRESET_PROVIDERS.find((provider) => provider.id === 'lmstudio')
    expect(lmStudioProvider).toBeDefined()
    expect(lmStudioProvider?.baseUrl).toBe('http://127.0.0.1:5000/v1')
    expect(lmStudioProvider?.gatewayRoute).toBe('openai-compat')
  })

  it('includes the local audio bridge preset provider and models', () => {
    const localProvider = PRESET_PROVIDERS.find((provider) => provider.id === 'local')
    expect(localProvider).toBeDefined()
    expect(localProvider?.baseUrl).toBe('http://127.0.0.1:7861')

    const localModelIds = PRESET_MODELS
      .filter((model) => model.provider === 'local' && model.type === 'audio')
      .map((model) => model.modelId)

    expect(localModelIds).toContain('local-indextts-speech')
    expect(localModelIds).toContain('local-indextts-voice-design')
  })

  it('includes all required minimax official llm preset models', () => {
    const minimaxLlmModelIds = PRESET_MODELS
      .filter((model) => model.provider === 'minimax' && model.type === 'llm')
      .map((model) => model.modelId)

    expect(minimaxLlmModelIds).toContain('MiniMax-M2.5')
    expect(minimaxLlmModelIds).toContain('MiniMax-M2.5-highspeed')
    expect(minimaxLlmModelIds).toContain('MiniMax-M2.1')
    expect(minimaxLlmModelIds).toContain('MiniMax-M2.1-highspeed')
    expect(minimaxLlmModelIds).toContain('MiniMax-M2')
  })
})
