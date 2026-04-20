import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { reportTaskProgress } from '@/lib/workers/shared'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { assertTaskActive } from '@/lib/workers/utils'
import { getPromptTemplate, PROMPT_IDS } from '@/lib/prompt-i18n'
import { resolveAnalysisModel } from './resolve-analysis-model'
import { createWorkerLLMStreamContext, createWorkerLLMStreamCallbacks } from './llm-stream'
import type { TaskJobData } from '@/lib/task/types'
import { safeParseJsonObject } from '@/lib/json-repair'
import type { CharacterProfileData, RoleLevel, CostumeTier } from '@/types/character-profile'

type JsonRecord = Record<string, unknown>

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * LXT 资产 LLM 分析增强
 *
 * 复用通用模式三路并行 Prompt（NP_AGENT_CHARACTER_PROFILE / NP_SELECT_LOCATION / NP_SELECT_PROP）
 * LXT 专属优势：同时输入 novelText + shotListContent（双源），比通用模式覆盖更全。
 * 结果写入 LxtProjectAsset，利用 @@unique([lxtProjectId, kind, name]) 天然去重。
 */
export async function handleLxtAnalyzeAssetsTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const projectId = job.data.projectId
  const locale = typeof payload.locale === 'string' && payload.locale === 'en' ? 'en' : 'zh'

  // 1. 加载 lxtProject（含现有资产去重名单）
  const lxtProject = await prisma.lxtProject.findUnique({
    where: { projectId },
    select: {
      id: true,
      analysisModel: true,
      assets: {
        select: { kind: true, name: true },
      },
    },
  })
  if (!lxtProject) throw new Error('LXT project not found')

  // 2. 取第一集内容（novelText + shotListContent 合并作为分析输入）
  const episode = await prisma.lxtEpisode.findFirst({
    where: { lxtProjectId: lxtProject.id },
    orderBy: { createdAt: 'asc' },
    select: { novelText: true, shotListContent: true },
  })

  const novelText = readText(episode?.novelText)
  const shotListContent = readText(episode?.shotListContent)
  let contentToAnalyze = [novelText, shotListContent].filter(Boolean).join('\n\n')

  if (!contentToAnalyze.trim()) {
    throw new Error('请先完成分镜生成（或填写故事原文）再执行资产 LLM 分析')
  }

  const maxContentLength = 30000
  if (contentToAnalyze.length > maxContentLength) {
    contentToAnalyze = contentToAnalyze.substring(0, maxContentLength)
  }

  // 3. 构建现有资产名单（注入 Prompt，让 LLM 知道"已有哪些"，减少重复输出）
  const existingCharNames = lxtProject.assets
    .filter((a) => a.kind === 'character')
    .map((a) => a.name)
    .join(', ')
  const existingLocNames = lxtProject.assets
    .filter((a) => a.kind === 'location')
    .map((a) => a.name)
    .join(', ')
  const existingPropNames = lxtProject.assets
    .filter((a) => a.kind === 'prop')
    .map((a) => a.name)
    .join(', ')

  // 4. 解析模型
  const analysisModel = await resolveAnalysisModel({
    userId: job.data.userId,
    inputModel: payload.model,
    projectAnalysisModel: lxtProject.analysisModel,
  })

  await reportTaskProgress(job, 10, {
    stage: 'lxt_analyze_assets_start',
    stageLabel: 'LLM 资产分析开始',
    displayMode: 'detail',
    stepId: 'prepare',
    stepTitle: '准备分析输入',
    stepIndex: 0,
    stepTotal: 3,
    done: false,
  })

  // 5. 构建三路 Prompt（复用通用模式 Prompt ID，无需新建）
  const characterPrompt = getPromptTemplate(PROMPT_IDS.NP_AGENT_CHARACTER_PROFILE, locale)
    .replace('{input}', contentToAnalyze)
    .replace('{characters_lib_info}', existingCharNames || '无')

  const locationPrompt = getPromptTemplate(PROMPT_IDS.NP_SELECT_LOCATION, locale)
    .replace('{input}', contentToAnalyze)
    .replace('{locations_lib_name}', existingLocNames || '无')

  const propPrompt = getPromptTemplate(PROMPT_IDS.NP_SELECT_PROP, locale)
    .replace('{input}', contentToAnalyze)
    .replace('{props_lib_name}', existingPropNames || '无')

  // 6. 三路并行 LLM 调用（复用通用模式 Promise.all 模式）
  const streamContext = createWorkerLLMStreamContext(job)
  const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)
  const [characterResult, locationResult, propResult] = await (async () => {
    try {
      return await withInternalLLMStreamCallbacks(
        streamCallbacks,
        async () =>
          Promise.all([
            executeAiTextStep({
              userId: job.data.userId,
              model: analysisModel,
              messages: [{ role: 'user', content: characterPrompt }],
              action: 'lxt_analyze_characters',
              projectId,
              meta: {
                stepId: 'analyze_characters',
                stepTitle: '角色分析',
                stepIndex: 1,
                stepTotal: 3,
              },
            }),
            executeAiTextStep({
              userId: job.data.userId,
              model: analysisModel,
              messages: [{ role: 'user', content: locationPrompt }],
              action: 'lxt_analyze_locations',
              projectId,
              meta: {
                stepId: 'analyze_locations',
                stepTitle: '场景分析',
                stepIndex: 2,
                stepTotal: 3,
              },
            }),
            executeAiTextStep({
              userId: job.data.userId,
              model: analysisModel,
              messages: [{ role: 'user', content: propPrompt }],
              action: 'lxt_analyze_props',
              projectId,
              meta: {
                stepId: 'analyze_props',
                stepTitle: '道具分析',
                stepIndex: 3,
                stepTotal: 3,
              },
            }),
          ]),
      )
    } finally {
      await streamCallbacks.flush()
    }
  })()
  const characterText = characterResult.text ?? ''
  const locationText = locationResult.text ?? ''
  const propText = propResult.text ?? ''

  await reportTaskProgress(job, 70, {
    stage: 'lxt_analyze_assets_parsing',
    stageLabel: '解析分析结果',
    displayMode: 'detail',
    stepId: 'parse',
    stepTitle: '解析 LLM 输出',
    stepIndex: 1,
    stepTotal: 3,
    done: false,
  })

  // 7. 解析 JSON
  const charsData = safeParseJsonObject(characterText)
  const locsData = safeParseJsonObject(locationText)
  const propsData = safeParseJsonObject(propText)

  const parsedChars = Array.isArray(charsData.new_characters)
    ? (charsData.new_characters as JsonRecord[])
    : Array.isArray(charsData.characters)
      ? (charsData.characters as JsonRecord[])
      : []
  const parsedLocs = Array.isArray(locsData.locations)
    ? (locsData.locations as JsonRecord[])
    : []
  const parsedProps = Array.isArray(propsData.props)
    ? (propsData.props as JsonRecord[])
    : []

  await reportTaskProgress(job, 80, {
    stage: 'lxt_analyze_assets_persist',
    stageLabel: '保存到资产库',
    displayMode: 'detail',
    stepId: 'persist',
    stepTitle: '写入资产库',
    stepIndex: 2,
    stepTotal: 3,
    done: false,
  })
  await assertTaskActive(job, 'lxt_analyze_assets_persist')

  // 8. Upsert 到 LxtProjectAsset（@@unique 天然去重）
  const upsertItems = async (
    items: JsonRecord[],
    kind: 'character' | 'location' | 'prop',
  ) => {
    for (const item of items) {
      const name = readText(item.name).trim()
      if (!name) continue

      // description 字段名因 Prompt 而异（character 用 description，location/prop 也用 description）
      const description = readText(
        item.description ?? item.summary ?? item.introduction ?? '',
      ).trim()

      // 对 character 类型，提取结构化档案数据（CharacterProfileData）
      const profileDataJson: string | null = kind === 'character'
        ? (() => {
          const roleLevel = readText(item.role_level ?? item.importance_level ?? item.tier ?? item.importance ?? '')
          const validRoleLevels: RoleLevel[] = ['S', 'A', 'B', 'C', 'D']
          const profile: CharacterProfileData = {
            role_level: (validRoleLevels.includes(roleLevel as RoleLevel) ? roleLevel : 'C') as RoleLevel,
            archetype: readText(item.archetype ?? item.character_archetype ?? item.type ?? ''),
            personality_tags: Array.isArray(item.personality_tags)
              ? item.personality_tags.map((t: unknown) => readText(t)).filter(Boolean)
              : typeof item.personality === 'string'
                ? item.personality.split(/[,，、]/).map((s: string) => s.trim()).filter(Boolean)
                : [],
            era_period: readText(item.era_period ?? item.era ?? item.time_period ?? item.time ?? ''),
            social_class: readText(item.social_class ?? item.class ?? item.social_status ?? ''),
            occupation: readText(item.occupation ?? item.job ?? '') || undefined,
            costume_tier: (typeof item.costume_tier === 'number' && item.costume_tier >= 1 && item.costume_tier <= 5
              ? item.costume_tier
              : 3) as CostumeTier,
            suggested_colors: Array.isArray(item.suggested_colors)
              ? item.suggested_colors.map((c: unknown) => readText(c)).filter(Boolean)
              : Array.isArray(item.colors)
                ? item.colors.map((c: unknown) => readText(c)).filter(Boolean)
                : [],
            primary_identifier: readText(item.primary_identifier ?? item.identifier ?? item.landmark ?? ''),
            visual_keywords: Array.isArray(item.visual_keywords)
              ? item.visual_keywords.map((k: unknown) => readText(k)).filter(Boolean)
              : Array.isArray(item.keywords)
                ? item.keywords.map((k: unknown) => readText(k)).filter(Boolean)
                : [],
            gender: readText(item.gender ?? item.sex ?? ''),
            age_range: readText(item.age_range ?? item.age ?? ''),
          }
          return JSON.stringify(profile)
        })()
        : null

      await prisma.lxtProjectAsset.upsert({
        where: {
          lxtProjectId_kind_name: {
            lxtProjectId: lxtProject.id,
            kind,
            name,
          },
        },
        create: {
          lxtProjectId: lxtProject.id,
          kind,
          name,
          summary: description || null,
          profileData: profileDataJson,
        },
        update: {
          // 不覆盖已有 summary，保留用户手动填写的内容
          // 若 profileData 未确认过，则用新分析的覆盖
          profileData: profileDataJson ?? undefined,
        },
      })
    }
  }

  await Promise.all([
    upsertItems(parsedChars, 'character'),
    upsertItems(parsedLocs, 'location'),
    upsertItems(parsedProps, 'prop'),
  ])

  await reportTaskProgress(job, 100, {
    stage: 'lxt_analyze_assets_done',
    stageLabel: `资产分析完成（角色 ${parsedChars.length}，场景 ${parsedLocs.length}，道具 ${parsedProps.length}）`,
    displayMode: 'detail',
    stepId: 'done',
    stepTitle: '分析完成',
    stepIndex: 3,
    stepTotal: 3,
    done: true,
  })
}
