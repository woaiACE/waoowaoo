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

function buildDescriptionPrompt(
  kind: 'character' | 'location' | 'prop',
  name: string,
  summary: string,
  profileData: CharacterProfileData | null,
): string {
  if (kind === 'character' && profileData) {
    const colorsStr = profileData.suggested_colors.join('、') || ''
    const keywordsStr = profileData.visual_keywords.join('、') || ''
    const speciesTraitsStr = Array.isArray(profileData.species_traits) && profileData.species_traits.length > 0
      ? profileData.species_traits.join('、')
      : ''

    return `你是一位专业的角色视觉提示词设计师。请根据以下角色档案，输出一段用于AI绘图的角色外观描述。

角色名称：${name}
${summary ? `角色介绍：${summary}\n` : ''}档案参考：
- 性别：${profileData.gender || '未知'}，年龄段：${profileData.age_range || '未知'}
- 时代背景：${profileData.era_period || ''}，阶层：${profileData.social_class || ''}${profileData.occupation ? `，职业：${profileData.occupation}` : ''}
- 服装华丽度：${profileData.costume_tier}/5${colorsStr ? `，色彩参考：${colorsStr}` : ''}${profileData.primary_identifier ? `\n- 主要辨识标志：${profileData.primary_identifier}` : ''}${keywordsStr ? `\n- 视觉关键词：${keywordsStr}` : ''}${profileData.body_proportion ? `\n- 体型比例：${profileData.body_proportion}` : ''}${speciesTraitsStr ? `\n- 物种形态特征：${speciesTraitsStr}` : ''}

【输出规则（严格遵守）】
1. 总字数 150-220 字，按视觉区域分段描述，区域间用句号分隔
2. 必须覆盖以下所有区域（按顺序）：
   ① 开头：角色名 + 年龄/物种定位（如"约六岁幼年雄性农家猪崽"）
   ② 面部细节：脸型 + 眉形 + 眼部轮廓 + 鼻型 + 嘴唇 + 肤质
   ③ 物种/辨识特征：仅写物种专属外貌（如耳朵形态），若有"物种形态特征"字段须全部写入
   ④ 发型/头部：颜色 + 长度 + 发型样式 + 刘海描述
   ⑤ 体型：简述身形比例，若有"体型比例"字段须将头身比/体长等数据写入
   ⑥ 服装（分层）：上衣外层（颜色+材质+领型+款式）→ 内搭（若有）→ 下装（颜色+材质+款式）
   ⑦ 鞋履：颜色 + 类型
3. 只写可直接渲染的视觉内容，每个细节尽量带颜色词 + 材质/质感词 + 形态词
4. 禁止写：性格、心理、行为、情感、故事背景、评级说明、推理过程
5. 直接输出描述文本，不加任何标题、序号或括号注释

【参考格式（不要照抄，按档案生成）】
（角色名），（年龄）（物种/性别），（脸型），（眉形），（眼部），（鼻嘴），（肤质），（物种耳/辨识特征）。（发色）的（发型），（刘海描述）。（体型描述）。身穿（颜色+材质+领型上衣），内搭（颜色+内搭），下身（颜色+材质+款式裤/裙），脚蹬（颜色+鞋款）。`
  }

  if (kind === 'character') {
    return `你是一位专业的角色视觉提示词设计师。请根据以下角色信息，输出一段用于AI绘图的角色外观描述。

角色名称：${name}
${summary ? `角色介绍：${summary}\n` : ''}
【输出规则（严格遵守）】
1. 总字数 120-180 字，按视觉区域分段，区域间用句号分隔
2. 覆盖顺序：角色名+定位 → 面部（脸型、眉、眼、鼻、嘴、肤） → 发型（颜色+长度+样式+刘海） → 体型 → 服装（上衣材质配色领型 → 内搭 → 下装） → 鞋履
3. 每个细节尽量带颜色词 + 材质/质感词 + 形态词
4. 禁止写：性格、心理、行为、情感、故事背景
5. 直接输出描述文本，不加任何标题或序号`
  }

  if (kind === 'location') {
    return `你是一位专业的场景视觉提示词设计师。请根据以下场景信息，输出一段用于AI绘图的场景外观描述。

场景名称：${name}
${summary ? `场景说明：${summary}\n` : ''}
【输出规则（严格遵守）】
1. 总字数 80-140 字，用逗号分隔短语，关键区域间用句号分隔
2. 必须覆盖：空间类型和规模 → 光线（方向/强度/色温） → 主要构成物（材质+颜色+形态） → 地面/天空/背景 → 色调与氛围词
3. 每个元素尽量带颜色词 + 材质词 + 形态词
4. 禁止写：情节、故事背景、感受分析
5. 直接输出描述文本，不加任何标题或序号`
  }

  // prop
  return `你是一位专业的道具视觉提示词设计师。请根据以下道具信息，输出一段用于AI绘图的道具外观描述。

道具名称：${name}
${summary ? `道具说明：${summary}\n` : ''}
【输出规则（严格遵守）】
1. 总字数 60-100 字，用逗号分隔短语
2. 必须覆盖：整体形状+尺寸感 → 主体材质（颜色+质感+光泽） → 结构细节（部件、纹饰、边缘处理） → 磨损/旧化/特殊标记（若有）
3. 每个细节带颜色词 + 材质词 + 形态词
4. 直接输出描述文本，不加任何标题或序号`
}
