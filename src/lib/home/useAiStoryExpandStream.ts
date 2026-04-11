'use client'

/**
 * useAiStoryExpandStream
 *
 * 封装 AI 帮我写的完整任务生命周期：
 * 1. POST /api/user/ai-story-expand → 拿到 taskId
 * 2. 订阅 /api/sse?projectId=home-ai-write → 流式消费 token
 * 3. task.lifecycle completed → 提取 expandedText
 * 4. 降级：SSE 失败时 poll waitForTaskResult
 *
 * SSE 事件结构（来自 publisher.ts 的 SSEEvent）：
 *   task.stream:    { taskId, payload: { stream: { delta: string } } }
 *   task.lifecycle: { taskId, payload: { lifecycleType: string, expandedText?: string, errorMessage?: string } }
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import { waitForTaskResult } from '@/lib/task/client'

export type AiExpandStatus = 'idle' | 'streaming' | 'completed' | 'error'

export interface AiStoryExpandParams {
  prompt: string
  screenplayTone?: string
  storyRewriteMode?: string
  sourceText?: string
  lengthTarget?: string
  readerProfile?: string
}

export interface UseAiStoryExpandStreamReturn {
  status: AiExpandStatus
  outputText: string
  expandedResult: string
  errorMessage: string
  run: (params: AiStoryExpandParams) => Promise<void>
  stop: () => void
  reset: () => void
}

export function useAiStoryExpandStream(): UseAiStoryExpandStreamReturn {
  const [status, setStatus] = useState<AiExpandStatus>('idle')
  const [outputText, setOutputText] = useState('')
  const [expandedResult, setExpandedResult] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const abortRef = useRef<AbortController | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const taskIdRef = useRef<string | null>(null)
  const outputAccRef = useRef('')
  const reasoningAccRef = useRef('')
  const textAccRef = useRef('')

  const closeSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    closeSSE()
    setStatus('idle')
  }, [closeSSE])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    closeSSE()
    taskIdRef.current = null
    outputAccRef.current = ''
    reasoningAccRef.current = ''
    textAccRef.current = ''
    setStatus('idle')
    setOutputText('')
    setExpandedResult('')
    setErrorMessage('')
  }, [closeSSE])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      closeSSE()
    }
  }, [closeSSE])

  const run = useCallback(async (params: AiStoryExpandParams) => {
    // 重置上次状态
    closeSSE()
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    outputAccRef.current = ''
    reasoningAccRef.current = ''
    textAccRef.current = ''
    setOutputText('')
    setExpandedResult('')
    setErrorMessage('')
    setStatus('streaming')

    let taskId: string
    try {
      const res = await apiFetch('/api/user/ai-story-expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: params.prompt,
          screenplayTone: params.screenplayTone || undefined,
          storyRewriteMode: params.storyRewriteMode || undefined,
          sourceText: params.sourceText || undefined,
          lengthTarget: params.lengthTarget || undefined,
          readerProfile: params.readerProfile || undefined,
        }),
        signal: ac.signal,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        const msg = (err as Record<string, unknown>)?.error as string || `HTTP ${res.status}`
        throw new Error(msg)
      }
      const data = await res.json().catch(() => null)
      if (!data || typeof data !== 'object' || !('taskId' in data)) {
        throw new Error('Invalid response: missing taskId')
      }
      taskId = (data as { taskId: string }).taskId
      taskIdRef.current = taskId
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setErrorMessage((err as Error).message || 'Failed to start')
      setStatus('error')
      return
    }

    // 尝试 SSE 流式消费
    let sseSuccess = false
    try {
      await new Promise<void>((resolve, reject) => {
        if (ac.signal.aborted) {
          reject(new Error('AbortError'))
          return
        }

        const source = new EventSource(`/api/sse?projectId=home-ai-write`)
        eventSourceRef.current = source

        // 超时保底（30 分钟）
        const timeout = setTimeout(() => {
          source.close()
          reject(new Error('SSE timeout'))
        }, 30 * 60 * 1000)

        ac.signal.addEventListener('abort', () => {
          clearTimeout(timeout)
          source.close()
          reject(new Error('AbortError'))
        })

        // 处理 task.lifecycle 事件
        // SSEEvent 结构: { taskId, payload: { lifecycleType, expandedText?, errorMessage? } }
        const handleLifecycle = (event: MessageEvent<string>) => {
          try {
            const envelope = JSON.parse(event.data || '{}') as Record<string, unknown>
            if (envelope.taskId !== taskId) return
            const inner = (envelope.payload ?? {}) as Record<string, unknown>
            const lifecycleType = typeof inner.lifecycleType === 'string' ? inner.lifecycleType : ''
            if (lifecycleType === 'task.completed') {
              clearTimeout(timeout)
              // 优先用服务端返回的 expandedText（纯正文），否则用本地积累的纯文本
              const result = typeof inner.expandedText === 'string'
                ? inner.expandedText.trim()
                : textAccRef.current.trim() || outputAccRef.current.trim()
              sseSuccess = true
              source.close()
              eventSourceRef.current = null
              setExpandedResult(result)
              setOutputText(result)
              setStatus('completed')
              resolve()
            } else if (lifecycleType === 'task.failed') {
              clearTimeout(timeout)
              const errMsg = typeof inner.errorMessage === 'string'
                ? inner.errorMessage
                : 'Generation failed'
              source.close()
              eventSourceRef.current = null
              reject(new Error(errMsg))
            }
          } catch {
            // 忽略 JSON 解析错误
          }
        }

        // 处理 task.stream 事件
        // SSEEvent 结构: { taskId, payload: { stream: { kind: 'reasoning'|'text', delta: string } } }
        const handleStream = (event: MessageEvent<string>) => {
          try {
            const envelope = JSON.parse(event.data || '{}') as Record<string, unknown>
            if (envelope.taskId !== taskId) return
            const inner = (envelope.payload ?? {}) as Record<string, unknown>
            const streamObj = (inner.stream ?? {}) as Record<string, unknown>
            const delta = typeof streamObj.delta === 'string' ? streamObj.delta : ''
            if (!delta) return
            const kind = typeof streamObj.kind === 'string' ? streamObj.kind : 'text'
            if (kind === 'reasoning') {
              reasoningAccRef.current += delta
            } else {
              textAccRef.current += delta
            }
            // 构建结构化输出字符串，与 getStageOutput 保持一致
            const reasoning = reasoningAccRef.current
            const text = textAccRef.current
            if (reasoning && text) {
              outputAccRef.current = `【思考过程】\n${reasoning}\n\n【最终结果】\n${text}`
            } else if (reasoning) {
              outputAccRef.current = `【思考过程】\n${reasoning}`
            } else {
              outputAccRef.current = text
            }
            setOutputText(outputAccRef.current)
          } catch {
            // 忽略 JSON 解析错误
          }
        }

        source.addEventListener('task.lifecycle', handleLifecycle as EventListener)
        source.addEventListener('task.stream', handleStream as EventListener)

        source.onerror = () => {
          clearTimeout(timeout)
          source.close()
          eventSourceRef.current = null
          if (!sseSuccess) {
            reject(new Error('SSE_ERROR'))
          }
        }
      })
    } catch (err) {
      const msg = (err as Error).message || ''
      if (msg === 'AbortError' || (err as Error).name === 'AbortError') return
      if (sseSuccess) return

      // SSE 失败降级为轮询
      try {
        const result = await waitForTaskResult(taskId, {
          intervalMs: 1500,
          timeoutMs: 30 * 60 * 1000,
        })
        const expanded = typeof (result as Record<string, unknown>)?.expandedText === 'string'
          ? ((result as Record<string, unknown>).expandedText as string).trim()
          : ''
        if (!expanded) throw new Error('Empty result')
        setExpandedResult(expanded)
        setOutputText(expanded)
        setStatus('completed')
      } catch (pollErr) {
        if (ac.signal.aborted) return
        setErrorMessage((pollErr as Error).message || 'Generation failed')
        setStatus('error')
      }
    }
  }, [closeSSE])

  return { status, outputText, expandedResult, errorMessage, run, stop, reset }
}
