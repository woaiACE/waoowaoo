import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalVoiceDesign, synthesizeWithLocalIndexTTS } from '@/lib/providers/local-indextts'

describe('local indextts bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the configured endpoint and voice token for local speech synthesis', async () => {
    const fetchMock = vi.fn(async () => new Response(Buffer.from('RIFF1234WAVEfmt '), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await synthesizeWithLocalIndexTTS({
      text: '你好，世界',
      voiceToken: 'warm_female',
      endpoint: 'http://127.0.0.1:7861/v1',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7861/v1/audio/speech',
      expect.objectContaining({ method: 'POST' }),
    )
    const requestInit = (fetchMock.mock.calls[0] as unknown[] | undefined)?.[1] as { body?: string } | undefined
    expect(JSON.parse(requestInit?.body || '{}')).toEqual({
      model: 'indextts',
      input: '你好，世界',
      voice: 'warm_female',
    })
    expect(result.audioData.length).toBeGreaterThan(0)
  })

  it('creates a local voice-design preview result with audio payload', async () => {
    const fetchMock = vi.fn(async () => new Response(Buffer.from('RIFF1234WAVEfmt '), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createLocalVoiceDesign({
      voicePrompt: 'warm narrator',
      previewText: '这是一段测试语音。',
      preferredName: 'demo_voice',
      language: 'zh',
    }, 'http://127.0.0.1:7861')

    expect(result.success).toBe(true)
    expect(result.voiceId).toMatch(/^local_/)
    expect(typeof result.audioBase64).toBe('string')
    expect((result.audioBase64 || '').length).toBeGreaterThan(0)
  })
})
