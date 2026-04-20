import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { chatCompletionStream } from '@/lib/llm-client'
import { resolveAnalysisModel } from '@/lib/workers/handlers/resolve-analysis-model'
import type { ChatCompletionStreamCallbacks } from '@/lib/llm-client'
import type { CharacterProfileData } from '@/types/character-profile'

/**
 * POST /api/lxt/[projectId]/assets/[assetId]/confirm-profile
 * 确认 LXT 资产档案并流式生成视觉形象描述提示词
 *
 * Body: { profileData?: CharacterProfileData }
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
  const profileDataInput = body?.profileData as CharacterProfileData | undefined

  // 加载资产
  const current = await prisma.lxtProjectAsset.findUnique({
    where: { id: assetId },
    include: { lxtProject: { select: { projectId: true, analysisModel: true } } },
  })
  if (!current || current.lxtProject.projectId !== projectId) throw new ApiError('NOT_FOUND')

  // 若提供了 profileData，先持久化
  if (profileDataInput) {
    await prisma.lxtProjectAsset.update({
      where: { id: assetId },
      data: { profileData: JSON.stringify(profileDataInput) },
    })
  }

  const effectiveProfileData: CharacterProfileData | null = profileDataInput
    ?? (current.profileData ? (JSON.parse(current.profileData) as CharacterProfileData) : null)

  // 构建 Prompt
  const prompt = buildDescriptionPrompt(
    current.kind as 'character' | 'location' | 'prop',
    current.name,
    current.summary ?? '',
    effectiveProfileData,
  )

  // 解析模型
  const analysisModel = await resolveAnalysisModel({
    userId: session.user.id,
    inputModel: body.model,
    projectAnalysisModel: current.lxtProject.analysisModel,
  })

  const encoder = new TextEncoder()
  let fullText = ''

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
          { temperature: 0.7, projectId, action: 'lxt_asset_confirm_profile' },
          callbacks,
        )

        // 保存描述到 DB
        if (fullText.trim()) {
          await prisma.lxtProjectAsset.update({
            where: { id: assetId },
            data: { description: fullText.trim(), profileConfirmed: true },
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

// ─── Prompt builders ───────────────────────────────────────────────

const ROLE_LEVEL_LABELS: Record<string, string> = {
  S: 'S级-绝对主角',
  A: 'A级-核心配角',
  B: 'B级-重要配角',
  C: 'C级-普通角色',
  D: 'D级-次要角色',
}

function buildDescriptionPrompt(
  kind: 'character' | 'location' | 'prop',
  name: string,
  summary: string,
  profileData: CharacterProfileData | null,
): string {
  if (kind === 'character' && profileData) {
    const roleLevelLabel = ROLE_LEVEL_LABELS[profileData.role_level] ?? profileData.role_level
    const personalityStr = profileData.personality_tags.join('、') || '未设定'
    const colorsStr = profileData.suggested_colors.join('、') || '未设定'
    const keywordsStr = profileData.visual_keywords.join('、') || ''
    const costumeDots = '●'.repeat(profileData.costume_tier) + '○'.repeat(5 - profileData.costume_tier)

    return `你是一位专业的影视角色设计师，请根据以下角色档案，生成一段精准详细的角色视觉形象描述，供AI绘图生成角色参考图使用。

角色名称：${name}
${summary ? `角色介绍：${summary}\n` : ''}
档案信息：
- 重要性层级：${roleLevelLabel}
- 角色原型：${profileData.archetype || '未设定'}
- 性别：${profileData.gender || '未知'}，年龄段：${profileData.age_range || '未知'}
- 时代背景：${profileData.era_period || '未设定'}，社会阶层：${profileData.social_class || '未设定'}${profileData.occupation ? `，职业：${profileData.occupation}` : ''}
- 性格标签：${personalityStr}
- 服装华丽度：${costumeDots}（${profileData.costume_tier}/5），建议色彩：${colorsStr}${profileData.primary_identifier ? `\n- 主要辨识标志：${profileData.primary_identifier}` : ''}${keywordsStr ? `\n- 视觉关键词：${keywordsStr}` : ''}

请生成一段300-500字的角色视觉形象描述，需包含：
1. 面部特征（脸型、五官、发型发色）
2. 身材比例与体型特征
3. 服装描述（款式、材质、配色，符合${profileData.costume_tier}/5的华丽度与${profileData.era_period || '时代'}背景）
4. 主要辨识标志（如有）
5. 整体气质与神态

要求：描述具体生动、形象鲜明，适合直接作为AI图像生成提示词使用，请用中文输出。`
  }

  if (kind === 'character') {
    return `你是一位专业的影视角色设计师，请根据以下角色信息，生成一段精准的角色视觉形象描述，供AI绘图生成角色参考图使用。

角色名称：${name}
${summary ? `角色介绍：${summary}\n` : ''}
请生成一段300-500字的角色视觉形象描述，包含：外貌特征（发型、脸型、五官）、身材比例、服装搭配、气质神情。

要求：描述具体生动，适合直接作为AI图像生成提示词使用，请用中文输出。`
  }

  if (kind === 'location') {
    return `你是一位专业的影视美术指导，请根据以下场景信息，生成一段精准的场景视觉描述，供AI绘图生成场景参考图使用。

场景名称：${name}
${summary ? `场景说明：${summary}\n` : ''}
请生成一段150-300字的场景视觉描述，包含：
1. 空间构成（室内/室外、空间大小、主要视觉元素）
2. 光线与色调（时段、光源方向、整体色彩倾向）
3. 氛围与情感基调
4. 标志性视觉特征

要求：描述精准生动，适合直接作为AI图像生成提示词使用，请用中文输出。`
  }

  // prop
  return `你是一位专业的影视道具设计师，请根据以下道具信息，生成一段精准的道具视觉描述，供AI绘图生成道具参考图使用。

道具名称：${name}
${summary ? `道具说明：${summary}\n` : ''}
请生成一段80-150字的道具外形描述，包含：形状、材质质感、色彩搭配、尺寸感受。

要求：描述简洁精准，适合直接作为AI图像生成提示词使用，请用中文输出。`
}
