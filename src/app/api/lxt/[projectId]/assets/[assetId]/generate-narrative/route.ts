import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { chatCompletionStream } from '@/lib/llm-client'
import { resolveAnalysisModel } from '@/lib/workers/handlers/resolve-analysis-model'
import type { ChatCompletionStreamCallbacks } from '@/lib/llm-client'
import type { CharacterProfileData } from '@/types/character-profile'

/**
 * POST /api/lxt/[projectId]/assets/[assetId]/generate-narrative
 * 根据角色档案生成8段叙述描述（图片生成提示词用）
 *
 * Body: { profileData?: CharacterProfileData }
 *
 * SSE 事件格式：
 *   data: {"kind":"text","delta":"..."}        // 流式文本（供加载动画使用）
 *   data: {"kind":"done","segments":{...}}     // 完成，包含解析后的8段结构
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

  const effectiveProfileData: CharacterProfileData | null = profileDataInput
    ?? (current.profileData ? (JSON.parse(current.profileData) as CharacterProfileData) : null)

  if (!effectiveProfileData) throw new ApiError('INVALID_PARAMS', { message: '缺少角色档案数据' })

  const prompt = buildNarrativePrompt(current.name, current.summary ?? '', effectiveProfileData)

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
          { temperature: 0.7, projectId, action: 'lxt_generate_narrative' },
          callbacks,
        )

        // 解析8段JSON
        const segments = parseSegments(fullText)
        enqueue({ kind: 'done', segments })
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

// ─── Prompt builder ───────────────────────────────────────────────

function buildNarrativePrompt(
  name: string,
  summary: string,
  profileData: CharacterProfileData,
): string {
  const colorsStr = profileData.suggested_colors.join('、') || ''
  const speciesTraitsStr = Array.isArray(profileData.species_traits) && profileData.species_traits.length > 0
    ? profileData.species_traits.join('、')
    : ''
  const tagsStr = profileData.personality_tags.join('、') || ''
  const visualKwStr = profileData.visual_keywords.join('、') || ''

  const parts = [
    '你是专业的动画角色描述文案设计师，请将下方角色档案转化为【8段结构化的中文叙述描述】，用于AI图片生成。',
    '',
    '角色名称：' + name,
    summary ? ('角色简介：' + summary) : '',
    '',
    '【档案数据】',
    '- 性别：' + (profileData.gender || '未知') + '，年龄：' + (profileData.age_range || '未知'),
    '- 时代：' + (profileData.era_period || '') + '，阶层：' + (profileData.social_class || '') + (profileData.occupation ? ('，职业：' + profileData.occupation) : ''),
    '- 角色原型：' + (profileData.archetype || ''),
    '- 性格标签：' + (tagsStr || '无'),
    '- 服装华丽度：' + profileData.costume_tier + '/5' + (colorsStr ? ('，色彩参考：' + colorsStr) : ''),
    profileData.primary_identifier ? ('- 主要辨识标志：' + profileData.primary_identifier) : '',
    visualKwStr ? ('- 视觉关键词：' + visualKwStr) : '',
    profileData.body_proportion ? ('- 体型比例：' + profileData.body_proportion) : '',
    speciesTraitsStr ? ('- 物种特征：' + speciesTraitsStr) : '',
    '',
    '【输出要求】',
    '严格输出以下JSON格式，不包含任何其他文字：',
    '{',
    '  "seg1": "基础身份（物种/年龄/性别/皮肤肤质，25-35字，以\'约X岁\'或\'一只\'开头）",',
    '  "seg2": "上衣装扮（服装款式/颜色/图案/材质，30-40字）",',
    '  "seg3": "身体特征（身高/体型/比例/皮肤质感，35-45字）",',
    '  "seg4": "脸型基础（脸型/下颌/整体轮廓，25-35字）",',
    '  "seg5": "五官气质（眼睛/眉毛/鼻型/嘴角 + 神态表情 + 内在气质，55-70字，此段最关键必须最长）",',
    '  "seg6": "头发风格（发型/发色/发质/刘海，20-30字）",',
    '  "seg7": "下装腿脚（裤裙/鞋类/脚部，30-40字）",',
    '  "seg8": "配饰细节（颈部/手腕/其他装饰品，25-35字）"',
    '}',
    '',
    '注意事项：',
    '1. 每段必须是完整流畅的中文叙述，融入角色气质，不要机械罗列属性',
    '2. 第5段（五官气质）最关键，需体现角色的神韵和情感特质，字数必须最多',
    '3. 对非人类角色（物种特征不为空），第1段以"一只"开头描述物种形态',
    '4. 若某配饰/下装暂无信息，根据档案合理推测补全',
    '5. 仅输出纯JSON，首个字符必须是{，末尾字符必须是}',
  ]
  return parts.filter(Boolean).join('\n')
}

// ─── Segment parser ───────────────────────────────────────────────

interface NarrativeSegments {
  seg1?: string
  seg2?: string
  seg3?: string
  seg4?: string
  seg5?: string
  seg6?: string
  seg7?: string
  seg8?: string
}

function parseSegments(raw: string): NarrativeSegments {
  try {
    // 从原始文本中提取 JSON（LLM 有时会在 JSON 前后输出额外文字）
    const jsonStart = raw.indexOf('{')
    const jsonEnd = raw.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) return {}
    const jsonStr = raw.slice(jsonStart, jsonEnd + 1)
    const parsed = JSON.parse(jsonStr)
    return {
      seg1: typeof parsed.seg1 === 'string' ? parsed.seg1 : undefined,
      seg2: typeof parsed.seg2 === 'string' ? parsed.seg2 : undefined,
      seg3: typeof parsed.seg3 === 'string' ? parsed.seg3 : undefined,
      seg4: typeof parsed.seg4 === 'string' ? parsed.seg4 : undefined,
      seg5: typeof parsed.seg5 === 'string' ? parsed.seg5 : undefined,
      seg6: typeof parsed.seg6 === 'string' ? parsed.seg6 : undefined,
      seg7: typeof parsed.seg7 === 'string' ? parsed.seg7 : undefined,
      seg8: typeof parsed.seg8 === 'string' ? parsed.seg8 : undefined,
    }
  } catch {
    return {}
  }
}
