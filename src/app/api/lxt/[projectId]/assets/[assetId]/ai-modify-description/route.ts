import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { chatCompletionStream } from '@/lib/llm-client'
import { resolveAnalysisModel } from '@/lib/workers/handlers/resolve-analysis-model'
import type { ChatCompletionStreamCallbacks } from '@/lib/llm-client'

/**
 * POST /api/lxt/[projectId]/assets/[assetId]/ai-modify-description
 * 基于修改指令对 LXT 资产的形象描述提示词进行 AI 改写，结果通过 SSE 流式返回。
 *
 * Body: { currentDescription: string, modifyInstruction: string }
 *
 * SSE 事件格式：
 *   data: {"kind":"text","delta":"..."}
 *   data: {"kind":"done"}
 *   data: {"kind":"error","message":"..."}
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; assetId: string }> },
) => {
  const { projectId, assetId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json().catch(() => ({}))
  const currentDescription = typeof body?.currentDescription === 'string' ? body.currentDescription.trim() : ''
  const modifyInstruction = typeof body?.modifyInstruction === 'string' ? body.modifyInstruction.trim() : ''

  if (!currentDescription || !modifyInstruction) throw new ApiError('INVALID_PARAMS')

  const current = await prisma.lxtProjectAsset.findUnique({
    where: { id: assetId },
    include: { lxtProject: { select: { projectId: true, analysisModel: true } } },
  })
  if (!current || current.lxtProject.projectId !== projectId) throw new ApiError('NOT_FOUND')

  const analysisModel = await resolveAnalysisModel({
    userId: session.user.id,
    inputModel: body.model,
    projectAnalysisModel: current.lxtProject.analysisModel,
  })

  const prompt = buildModifyPrompt(current.kind as 'character' | 'location' | 'prop', current.name, currentDescription, modifyInstruction)

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch { /* closed */ }
      }

      const callbacks: ChatCompletionStreamCallbacks = {
        onChunk: (chunk) => {
          if (chunk.kind === 'text') {
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
          { temperature: 0.7, projectId, action: 'lxt_asset_ai_modify_description' },
          callbacks,
        )
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

function buildModifyPrompt(
  kind: 'character' | 'location' | 'prop',
  name: string,
  currentDescription: string,
  instruction: string,
): string {
  const kindLabel = kind === 'character' ? '角色' : kind === 'location' ? '场景' : '道具'
  return `你是一位专业的影视视觉描述优化师。以下是《${name}》${kindLabel}的当前形象描述提示词：

---
${currentDescription}
---

请根据以下修改指令对描述进行优化，保留原有结构和完整度，只修改指令所要求的部分。

修改指令：${instruction}

请直接输出修改后的完整描述，不需要任何前缀解释，用中文输出。`
}
