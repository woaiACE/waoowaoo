import { buildOpenAIChatCompletion } from '@/lib/llm/providers/openai-compat'
import { emitStreamChunk, emitStreamStage } from '@/lib/llm/stream-helpers'
import type { ChatCompletionStreamCallbacks } from '@/lib/llm/types'
import { buildReasoningAwareContent } from '@/lib/llm/utils'
import type { OpenAICompatChatRequest } from '../types'
import { resolveOpenAICompatClientConfig } from './common'

type ResponsesUsage = {
  promptTokens: number
  completionTokens: number
}

type ErrorWithStatus = Error & { status?: number }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function toEndpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function collectText(node: unknown, acc: string[]) {
  if (typeof node === 'string') {
    acc.push(node)
    return
  }
  if (Array.isArray(node)) {
    node.forEach((item) => collectText(item, acc))
    return
  }
  const record = asRecord(node)
  if (!record) return

  const type = typeof record.type === 'string' ? record.type : ''
  if (type.includes('reasoning')) return
  if (typeof record.output_text === 'string') acc.push(record.output_text)
  if (typeof record.text === 'string') acc.push(record.text)
  if (typeof record.content === 'string') acc.push(record.content)
  if (record.content !== undefined && typeof record.content !== 'string') collectText(record.content, acc)
  if (record.output !== undefined) collectText(record.output, acc)
}

function collectReasoning(node: unknown, acc: string[]) {
  if (Array.isArray(node)) {
    node.forEach((item) => collectReasoning(item, acc))
    return
  }
  const record = asRecord(node)
  if (!record) return

  const type = typeof record.type === 'string' ? record.type : ''
  if (type.includes('reasoning')) {
    if (typeof record.text === 'string') acc.push(record.text)
    if (typeof record.content === 'string') acc.push(record.content)
    if (record.content !== undefined && typeof record.content !== 'string') {
      collectReasoning(record.content, acc)
    }
  }

  if (record.reasoning !== undefined) collectReasoning(record.reasoning, acc)
  if (record.reasoning_content !== undefined) collectReasoning(record.reasoning_content, acc)
  if (record.output !== undefined) collectReasoning(record.output, acc)
}

function extractResponsesText(payload: unknown): string {
  const root = asRecord(payload)
  if (!root) return ''
  if (typeof root.output_text === 'string') return root.output_text

  const parts: string[] = []
  collectText(root.output ?? root, parts)
  return parts.join('')
}

function extractResponsesReasoning(payload: unknown): string {
  const root = asRecord(payload)
  if (!root) return ''

  const parts: string[] = []
  collectReasoning(root.output ?? root, parts)
  return parts.join('')
}

function extractResponsesUsage(payload: unknown): ResponsesUsage {
  const usage = asRecord(asRecord(payload)?.usage) || {}
  const promptTokens = typeof usage.input_tokens === 'number'
    ? usage.input_tokens
    : (typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0)
  const completionTokens = typeof usage.output_tokens === 'number'
    ? usage.output_tokens
    : (typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0)
  return {
    promptTokens,
    completionTokens,
  }
}

function buildResponsesRequestBody(input: OpenAICompatChatRequest, stream = false) {
  return {
    model: input.modelId,
    input: input.messages.map((message) => ({
      role: message.role,
      content: [{ type: 'input_text', text: message.content }],
    })),
    temperature: input.temperature,
    ...(stream ? { stream: true } : {}),
  }
}

async function* iterateSseData(response: Response): AsyncIterable<string> {
  if (!response.body) return

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''

    for (const part of parts) {
      const dataLines = part
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())

      if (dataLines.length === 0) continue
      const raw = dataLines.join('\n').trim()
      if (!raw || raw === '[DONE]') continue
      yield raw
    }
  }
}

function getEventTextDelta(event: Record<string, unknown>): string {
  if (typeof event.delta === 'string' && event.delta) return event.delta
  if (typeof event.text === 'string' && event.text) return event.text
  return ''
}

export async function runOpenAICompatResponsesCompletion(input: OpenAICompatChatRequest) {
  const config = await resolveOpenAICompatClientConfig(input.userId, input.providerId)
  const endpoint = toEndpoint(config.baseUrl, '/responses')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(buildResponsesRequestBody(input)),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    const error = new Error(
      `OPENAI_COMPAT_RESPONSES_FAILED: ${response.status} ${errorBody.slice(0, 300)}`,
    ) as ErrorWithStatus
    error.status = response.status
    throw error
  }

  const payload = await response.json() as unknown
  const text = extractResponsesText(payload)
  const reasoning = extractResponsesReasoning(payload)
  const usage = extractResponsesUsage(payload)

  return buildOpenAIChatCompletion(
    input.modelId,
    buildReasoningAwareContent(text, reasoning),
    usage,
  )
}

export async function runOpenAICompatResponsesStream(
  input: OpenAICompatChatRequest,
  callbacks?: ChatCompletionStreamCallbacks,
): Promise<ReturnType<typeof buildOpenAIChatCompletion>> {
  const config = await resolveOpenAICompatClientConfig(input.userId, input.providerId)
  const endpoint = toEndpoint(config.baseUrl, '/responses')

  emitStreamStage(callbacks, undefined, 'streaming', 'openai-compat')

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(buildResponsesRequestBody(input, true)),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    const error = new Error(
      `OPENAI_COMPAT_RESPONSES_FAILED: ${response.status} ${errorBody.slice(0, 300)}`,
    ) as ErrorWithStatus
    error.status = response.status
    throw error
  }

  let text = ''
  let reasoning = ''
  let usage: ResponsesUsage | undefined
  let seq = 1
  let lastPayload: unknown = null

  for await (const raw of iterateSseData(response)) {
    let payload: unknown
    try {
      payload = JSON.parse(raw) as unknown
    } catch {
      continue
    }

    lastPayload = payload
    const event = asRecord(payload)
    if (!event) continue

    const eventType = typeof event.type === 'string' ? event.type : ''
    const eventUsage = extractResponsesUsage(event.response ?? payload)
    if (eventUsage.promptTokens > 0 || eventUsage.completionTokens > 0) {
      usage = eventUsage
    }

    if (eventType === 'response.reasoning_text.delta' || eventType === 'response.reasoning_summary_text.delta') {
      const delta = getEventTextDelta(event)
      if (delta) {
        reasoning += delta
        emitStreamChunk(callbacks, undefined, {
          kind: 'reasoning',
          delta,
          seq,
          lane: 'reasoning',
        })
        seq += 1
      }
      continue
    }

    if (eventType === 'response.output_text.delta') {
      const delta = getEventTextDelta(event)
      if (delta) {
        text += delta
        emitStreamChunk(callbacks, undefined, {
          kind: 'text',
          delta,
          seq,
          lane: 'main',
        })
        seq += 1
      }
    }
  }

  const fallbackSource = asRecord(lastPayload)?.response ?? lastPayload
  if (!text) text = extractResponsesText(fallbackSource)
  if (!reasoning) reasoning = extractResponsesReasoning(fallbackSource)
  if (!usage) usage = extractResponsesUsage(fallbackSource)

  const completion = buildOpenAIChatCompletion(
    input.modelId,
    buildReasoningAwareContent(text, reasoning),
    usage,
  )

  emitStreamStage(callbacks, undefined, 'completed', 'openai-compat')
  callbacks?.onComplete?.(text)
  return completion
}

