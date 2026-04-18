import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { chatCompletionStream } from '@/lib/llm-client'
import { getPromptTemplate, PROMPT_IDS } from '@/lib/prompt-i18n'
import { resolveAnalysisModel } from '@/lib/workers/handlers/resolve-analysis-model'
import type { ChatCompletionStreamCallbacks } from '@/lib/llm-client'

/**
 * POST /api/lxt-script/generate-storyboard
 * LXT 剧本转分镜 — 流式 SSE 直接返回 reasoning + text
 *
 * 读取 episode.srtContent（Step2 生成的剧本），AI 拆解为逐镜分镜脚本，
 * 完成后写入 episode.shotListContent。
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

  // 加载 episode 的剧本内容（Step2 输出）
  const episode = await prisma.lxtEpisode.findUnique({
    where: { id: episodeId },
    select: { id: true, srtContent: true },
  })
  if (!episode?.srtContent?.trim()) {
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
  const template = getPromptTemplate(PROMPT_IDS.LXT_SCRIPT_TO_STORYBOARD, locale)
  const prompt = template.replace('{script}', episode.srtContent)

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
            action: 'lxt_script_to_storyboard',
          },
          callbacks,
        )

        // 保存分镜结果到数据库
        if (fullText.trim()) {
          await prisma.lxtEpisode.update({
            where: { id: episodeId },
            data: { shotListContent: fullText },
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
      'X-Accel-Buffering': 'no',
    },
  })
})
