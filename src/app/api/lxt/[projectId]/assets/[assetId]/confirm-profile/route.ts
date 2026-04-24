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

/**
 * 目标描述格式：解剖学/标签式（逗号分隔 + 双逗号分区）
 *
 * 设计依据：
 *  - 用于 AI 图片生成的关键词注入，标签式 ", " 分隔比散文句子更易被扩散模型精准识别
 *  - ", , "（双逗号）作为身体区域的分节符，让模型内部注意力能清晰区分不同语义区块
 *  - 对非人类角色明确写"无人类头发"/"无独立下装"，避免模型补全人类特征
 *  - 包含体型测量数据（站立高度/头身比），增强比例一致性
 *
 * 角色分区顺序：
 *   物种+体型概述 → 服装（逐件展开）→ 体态+测量+皮肤 → 面部 → 眼耳口 → 头部毛发 → 下身/脚蹄 → 配饰
 *
 * 场景分区顺序：
 *   整体环境概述 → 按空间位置逐区描述（每区作为一个独立节）
 */
function buildDescriptionPrompt(
  kind: 'character' | 'location' | 'prop',
  name: string,
  summary: string,
  profileData: CharacterProfileData | null,
): string {
  const SEP = ', '   // 区域内分隔
  const SEC = ', , ' // 区域间分节
  void SEP; void SEC // prevent unused-variable lint

  if (kind === 'character' && profileData) {
    const colorsStr = profileData.suggested_colors.join('、') || ''
    const speciesTraitsStr = Array.isArray(profileData.species_traits) && profileData.species_traits.length > 0
      ? profileData.species_traits.join('、')
      : ''
    const isNonHuman = speciesTraitsStr.length > 0 || (profileData.body_proportion ?? '').length > 0

    const sectionOrder = isNonHuman
      ? [
        '① 物种+体型概述：以"一[年龄][性别][物种]"开头，跟上体型概述词（如"体型丰满圆润"）',
        '② 服装：逐件展开每一件衣物（上衣到内搭到下装或连体）：穿法 + 颜色 + 材质 + 款式细节',
        '③ 体态+测量：站立高度（约Xcm）+ 体态描述 + 四肢描述 + 皮肤颜色质感',
        '④ 面部：物种面部类型描述 + 各部位（吻部/鼻孔/脸颊/下巴等）的颜色形态',
        '⑤ 眼睛+耳朵+口部：眼睛特征+位置+眼睑颜色，耳朵描述，吻/嘴/嘴角状态',
        '⑥ 头部毛发：若无人类头发，写"无人类头发, 头部覆盖[毛发类型]"；若有写颜色+样式',
        '⑦ 下身：若无独立下装，写"无独立下装, [下摆延伸描述], 露出[脚/蹄颜色+形态]"；若有则写下装+鞋/蹄',
        '⑧ 配饰：颈部/手部/身体各处配饰逐一描述；若无任何配饰，写"无配饰"',
      ].join('\n   ')
      : [
        '① 角色定位：角色名 + 年龄性别类型（如"约二十五岁男性"）',
        '② 面部：脸型 + 眉形 + 眼部 + 鼻型 + 嘴唇 + 肤质质感',
        '③ 辨识特征：若有辨识标志字段，此处写出',
        '④ 头发：颜色 + 长度 + 发型样式 + 刘海类型',
        '⑤ 体型：身形 + 肩宽 + 高挑/娇小感' + (profileData.body_proportion ? '（含头身比数据）' : ''),
        '⑥ 服装：上衣外层（颜色+材质+领型+款式）→ 内搭（颜色+材质+款式）→ 下装（颜色+材质+款式）',
        '⑦ 鞋履：颜色 + 鞋款类型',
      ].join('\n   ')

    const exampleNonHuman = '一只成年雌性家猪, 体型丰满圆润, , 穿着一件米白色棉质圆领长袖上衣, 外层围蓝底白格带碎花棉质围裙, 系带在背后打结覆盖躯干前部, , 站立高度约120厘米, 体态宽大厚实, 腹部圆润, 四肢粗短有力, 皮肤呈粉红色, 表面有少量稀疏白色刚毛, , 典型猪科动物面部, 吻部突出粉红色, 鼻孔大而圆, 脸颊肉质饱满, , 眼睛小且黑亮, 位于头部两侧上方, 眼睑呈浅粉色, 耳朵大而下垂紧贴脸颊, 吻部湿润有光泽, 嘴角自然闭合, , 无人类头发, 头部覆盖稀疏浅粉色短鬃毛, 耳后鬃毛稍长, , 无独立下装, 围裙下摆延伸至膝盖下方, 露出粉红色猪蹄, , 颈部佩戴细款红色布质项圈, 无任何挂饰, , '
    const exampleHuman = '约二十五岁男性, , 瓜子脸轮廓清晰, 剑眉平直, 双眼皮杏形眼, 高挺鼻梁, 薄唇线条利落, 细腻肤质, , 眼角一颗小巧泪痣, , 黑色短发利落后梳, 无刘海, , 身形高挑健硕, 肩宽背阔, 头身比协调, , 深蓝色锦缎立领长袍, 内搭米白色薄绸内衬, 下身配同色系宽腿长裤, , 黑色皮质长靴, , 腰系玉带一根, , '

    const parts: string[] = [
      '你是专业的角色视觉提示词设计师，专为 AI 图片生成输出结构化描述。请根据以下档案，输出标签式、逗号分隔的外观描述，格式严格按照规则执行。',
      '',
      '角色名称：' + name,
      summary ? ('角色介绍：' + summary) : '',
      '档案参考：',
      '- 性别：' + (profileData.gender || '未知') + '，年龄段：' + (profileData.age_range || '未知'),
      '- 时代背景：' + (profileData.era_period || '') + '，阶层：' + (profileData.social_class || '') + (profileData.occupation ? ('，职业：' + profileData.occupation) : ''),
      '- 服装华丽度：' + profileData.costume_tier + '/5' + (colorsStr ? ('，色彩参考：' + colorsStr) : ''),
      profileData.primary_identifier ? ('- 主要辨识标志：' + profileData.primary_identifier) : '',
      profileData.body_proportion ? ('- 体型比例：' + profileData.body_proportion) : '',
      speciesTraitsStr ? ('- 物种形态特征：' + speciesTraitsStr) : '',
      '',
      '【输出格式规则（严格遵守）】',
      '',
      '1. 分隔符规则：',
      '   - 同一区域内属性之间用英文逗号加空格（", "）分隔',
      '   - 不同身体区域之间用双逗号（", , "）分隔',
      '   - 整段结尾以双逗号（", , "）结束',
      '   - 禁止使用句号，禁止使用中文逗号',
      '',
      '2. 覆盖区域顺序（每区之间用双逗号分隔）：',
      '   ' + sectionOrder,
      '',
      '3. 每个属性词必须尽量带：颜色词 + 材质/质感词 + 形态描述词（三者尽量都有）',
      '4. 禁止写：性格、心理、行为、情感、故事背景、评级说明、推理过程、标题、序号',
      '5. 直接输出描述文本，不加任何标题或括号注释',
      '',
      '【参考格式示例（仅示意分区，不要照抄）】',
      isNonHuman ? exampleNonHuman : exampleHuman,
      '',
      '输出结果（仅描述文本，不含其他内容）：',
    ]
    return parts.filter((p) => p !== null).join('\n')
  }

  if (kind === 'character') {
    const isNonHuman = !!(summary && (
      summary.includes('猪') || summary.includes('狗') || summary.includes('猫') ||
      summary.includes('兔') || summary.includes('熊') || summary.includes('龙') ||
      summary.includes('狐') || summary.includes('鸟') || summary.includes('鱼') ||
      summary.includes('虎') || summary.includes('狼') || summary.includes('动物')
    ))
    const order = isNonHuman
      ? '物种+体型概述 → 服装（逐件展开）→ 体态+皮肤 → 面部 → 眼耳口 → 头部毛发（无人类头发时明确写出）→ 下身+脚蹄 → 配饰'
      : '角色定位 → 面部（脸型+眉+眼+鼻+嘴+肤）→ 发型（颜色+长度+样式+刘海）→ 体型 → 服装（上衣到内搭到下装）→ 鞋履 → 配饰'
    const parts: string[] = [
      '你是专业的角色视觉提示词设计师，专为 AI 图片生成输出结构化描述。请根据以下角色信息，输出标签式、逗号分隔的外观描述。',
      '',
      '角色名称：' + name,
      summary ? ('角色介绍：' + summary) : '',
      '',
      '【输出格式规则（严格遵守）】',
      '',
      '1. 分隔符规则：同一区域内用英文逗号加空格分隔，不同区域之间用双逗号（", , "）分隔，末尾以双逗号结束，禁止使用句号',
      '2. 覆盖区域顺序：' + order,
      '3. 每个属性词尽量带颜色词 + 材质/质感词 + 形态描述词',
      '4. 禁止写：性格、心理、行为、情感、故事背景',
      '5. 直接输出描述文本，不加任何标题或序号',
      '',
      '输出结果（仅描述文本）：',
    ]
    return parts.filter((p) => p !== null).join('\n')
  }

  if (kind === 'location') {
    const example = '一座位于茂密森林边缘的温馨木质小屋, 周围环绕翠绿草地, 阳光透过树叶洒下斑驳光影, 整体氛围宁静童话色彩, , 房屋正前方中央, 一扇厚实拱形实木门, 表面带自然木节纹理, 配黑色圆形铁质门环, 门框装饰简单藤蔓花纹, , 房屋正面两侧, 两扇对称方形玻璃窗, 白色木质窗框, 窗台摆放几个空花盆轮廓, 玻璃反射天空微光, , 门前开阔地带, 略显紧实的泥土地面, 连接草地与木门, , 背景四周, 深邃郁郁葱葱古老森林, 树木高大挺拔, 枝叶繁茂交织, 深绿色屏障, , 屋前空地角落, 褐色旧木桶, 桶身由铁箍固定, 斜靠墙边, , 草地边缘, 灰白色鹅卵石蜿蜒小路, 通向森林深处, 石子间夹杂少许青苔, , '
    const parts: string[] = [
      '你是专业的场景视觉提示词设计师，专为 AI 图片生成输出结构化描述。请根据以下场景信息，输出标签式、逗号分隔的场景外观描述。',
      '',
      '场景名称：' + name,
      summary ? ('场景说明：' + summary) : '',
      '',
      '【输出格式规则（严格遵守）】',
      '',
      '1. 分隔符规则：同一区域内用英文逗号加空格分隔，不同空间区域之间用双逗号（", , "）分隔，末尾以双逗号结束，禁止使用句号',
      '2. 覆盖区域顺序（每个空间位置作为一个独立节，节间用双逗号分隔）：',
      '   A. 整体概述：建筑/空间类型 + 整体环境特征 + 整体氛围色调',
      '   B. 各空间位置逐区描述（每区格式：空间位置名称, 该区内容1, 内容2...）：',
      '      - 入口/门（位置+材质+颜色+形态+细节）',
      '      - 窗户（位置+材质+颜色+形态+细节）',
      '      - 地面（材质+颜色+质感）',
      '      - 背景/天空（颜色+特征）',
      '      - 围栏/结构（位置+材质+颜色）',
      '      - 主要道具/细节物件（逐件：位置+颜色+材质+形态）',
      '3. 每个元素必须带颜色词 + 材质词 + 形态词',
      '4. 禁止写：情节、故事背景、感受分析',
      '5. 直接输出描述文本，不加任何标题或序号',
      '',
      '【参考格式示例（仅示意分区结构）】',
      example,
      '',
      '输出结果（仅描述文本）：',
    ]
    return parts.filter((p) => p !== null).join('\n')
  }

  // prop
  const parts: string[] = [
    '你是专业的道具视觉提示词设计师，专为 AI 图片生成输出结构化描述。请根据以下道具信息，输出标签式、逗号分隔的道具外观描述。',
    '',
    '道具名称：' + name,
    summary ? ('道具说明：' + summary) : '',
    '',
    '【输出格式规则（严格遵守）】',
    '',
    '1. 分隔符规则：属性之间用英文逗号加空格分隔，主体与细节部件之间用双逗号（", , "）分隔，末尾以双逗号结束，禁止使用句号',
    '2. 覆盖顺序：整体形状+尺寸感 → 主体材质（颜色+质感+光泽）→ 结构细节（部件+纹饰+边缘）→ 磨损/特殊标记（若有）',
    '3. 每个细节带颜色词 + 材质词 + 形态词',
    '4. 直接输出描述文本，不加任何标题或序号',
    '',
    '输出结果（仅描述文本）：',
  ]
  return parts.filter((p) => p !== null).join('\n')
}
