import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { chatCompletionStream } from '@/lib/llm-client'
import { getPromptTemplate, PROMPT_IDS } from '@/lib/prompt-i18n'
import { resolveAnalysisModel } from '@/lib/workers/handlers/resolve-analysis-model'
import type { ChatCompletionStreamCallbacks } from '@/lib/llm-client'

/**
 * POST /api/lxt-script/generate-script
 * LXT 小说转剧本 — 流式 SSE 直接返回 reasoning + text
 *
 * SSE 事件格式：
 *   data: {"kind":"reasoning","delta":"..."}
 *   data: {"kind":"text","delta":"..."}
 *   data: {"kind":"done"}
 *   data: {"kind":"error","message":"..."}
 */
export const POST = apiHandler(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}))
  const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : ''
  const episodeId = typeof body?.episodeId === 'string' ? body.episodeId.trim() : ''

  if (!projectId || !episodeId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  // 加载 episode
  const episode = await prisma.lxtEpisode.findUnique({
    where: { id: episodeId },
    select: { id: true, novelText: true },
  })
  if (!episode?.novelText?.trim()) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 解析模型
  const novelData = await prisma.lxtProject.findUnique({
    where: { projectId },
    select: { analysisModel: true },
  })
  const analysisModel = await resolveAnalysisModel({
    userId: session.user.id,
    inputModel: body.model,
    projectAnalysisModel: novelData?.analysisModel,
  })

  // 构建 prompt
  const locale = typeof body.locale === 'string' && body.locale === 'en' ? 'en' : 'zh'
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : ''
  const template = getPromptTemplate(PROMPT_IDS.LXT_NOVEL_TO_SCRIPT, locale)
  const prompt = template
    .replace('{novel_text}', episode.novelText)
    .replace('{instruction}', instruction || '无')

  // 流式 SSE 返回
  const encoder = new TextEncoder()
  let fullText = ''

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch { /* controller closed */ }
      }

      const callbacks: ChatCompletionStreamCallbacks = {
        onChunk: (chunk) => {
          if (chunk.kind === 'reasoning') {
            enqueue({ kind: 'reasoning', delta: chunk.delta })
          } else {
            fullText += chunk.delta
            enqueue({ kind: 'text', delta: chunk.delta })
          }
        },
        onError: (err) => {
          enqueue({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
          controller.close()
        },
      }

      try {
        await chatCompletionStream(
          session.user.id,
          analysisModel,
          [{ role: 'user', content: prompt }],
          {
            temperature: 0.7,
            reasoning: true,
            reasoningEffort: 'high',
            projectId,
            action: 'lxt_novel_to_script',
          },
          callbacks,
        )

        // 保存结果到数据库
        if (fullText.trim()) {
          await prisma.lxtEpisode.update({
            where: { id: episodeId },
            data: { srtContent: fullText },
          })
        }

        enqueue({ kind: 'done' })
      } catch (err) {
        enqueue({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
})
