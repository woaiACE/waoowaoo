import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'
import { resolveAnalysisModel } from './resolve-analysis-model'
import { createWorkerLLMStreamContext, createWorkerLLMStreamCallbacks } from './llm-stream'
import type { TaskJobData } from '@/lib/task/types'
import { safeParseJsonObject } from '@/lib/json-repair'
import { serializeVoicePromptWithParams, type VoiceDesignStructuredParams } from '@/lib/providers/bailian/voice-design'
import type { CharacterProfileData } from '@/types/character-profile'

/**
 * LXT 资产 AI 音色推理 Worker Handler
 *
 * Payload: { assetId }
 * 流程：
 *   1. 加载角色档案 + 故事摘要 + 同项目其他角色的 voicePrompt（避免雷同）
 *   2. 调用 LLM，根据角色信息推理出 VoiceDesignStructuredParams
 *   3. 将推理结果序列化为 voicePrompt 字符串，写回 LxtProjectAsset.summary（作为待用草稿）
 *   4. 通过 task result 回传序列化后的 voicePrompt，供前端填入声音描述框
 */
export async function handleLxtAssetVoicePromptInferTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const projectId = job.data.projectId

  const assetId = typeof payload.assetId === 'string' ? payload.assetId.trim() : ''
  if (!assetId) throw new Error('lxt_asset_voice_prompt_infer: assetId is required')

  await reportTaskProgress(job, 5, {
    stage: 'lxt_voice_prompt_infer_start',
    stageLabel: '加载角色信息',
    displayMode: 'detail',
    stepId: 'load',
    stepTitle: '加载角色档案',
    stepIndex: 0,
    stepTotal: 3,
    done: false,
  })
  await assertTaskActive(job, 'lxt_voice_prompt_infer_start')

  // 1. 加载目标资产
  const asset = await prisma.lxtProjectAsset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      lxtProjectId: true,
      kind: true,
      name: true,
      summary: true,
      description: true,
      profileData: true,
      lxtProject: {
        select: {
          id: true,
          projectId: true,
          analysisModel: true,
          assets: {
            where: { kind: 'character' },
            select: { id: true, name: true, summary: true },
          },
        },
      },
    },
  })
  if (!asset) throw new Error(`LXT asset not found: ${assetId}`)
  if (asset.kind !== 'character') throw new Error('音色推理仅支持角色类型资产')

  // 2. 加载故事背景（取最新一集 novelText 前 2000 字）
  const episode = await prisma.lxtEpisode.findFirst({
    where: { lxtProjectId: asset.lxtProjectId },
    orderBy: { createdAt: 'asc' },
    select: { novelText: true },
  })
  const storySummary = (episode?.novelText ?? '').trim().slice(0, 2000) || '（暂无故事背景）'

  // 3. 解析角色档案
  let profile: CharacterProfileData | null = null
  if (asset.profileData) {
    try { profile = JSON.parse(asset.profileData) as CharacterProfileData } catch { /* skip */ }
  }

  // 4. 收集同项目其他角色的声音描述（用于避免雷同）
  const otherVoiceDescriptions = asset.lxtProject.assets
    .filter((a) => a.id !== assetId && a.summary?.includes('['))
    .map((a) => `${a.name}：${(a.summary ?? '').slice(0, 120)}`)
    .slice(0, 5)
    .join('\n')

  // 5. 解析分析模型
  const analysisModel = await resolveAnalysisModel({
    userId: job.data.userId,
    inputModel: payload.model,
    projectAnalysisModel: asset.lxtProject.analysisModel,
  })

  await reportTaskProgress(job, 20, {
    stage: 'lxt_voice_prompt_infer_llm',
    stageLabel: 'LLM 推理音色参数',
    displayMode: 'detail',
    stepId: 'infer',
    stepTitle: 'AI 推理音色',
    stepIndex: 1,
    stepTotal: 3,
    done: false,
  })
  await assertTaskActive(job, 'lxt_voice_prompt_infer_llm')

  // 6. 构建 Prompt
  const promptContent = buildPrompt({
    promptId: PROMPT_IDS.LXT_VOICE_PROMPT_INFER,
    locale: 'zh',
    variables: {
      character_name: asset.name,
      role_level: profile?.role_level ?? 'C',
      archetype: profile?.archetype ?? '普通角色',
      gender: profile?.gender ?? '未知',
      age_range: profile?.age_range ?? '成年',
      personality_tags: Array.isArray(profile?.personality_tags)
        ? (profile?.personality_tags as string[]).join('、')
        : (typeof profile?.personality_tags === 'string' ? profile?.personality_tags : ''),
      era_period: profile?.era_period ?? '现代',
      social_class: profile?.social_class ?? '普通',
      character_description: asset.description?.trim() || asset.summary?.trim() || '（暂无详细描述）',
      story_summary: storySummary,
      other_voices: otherVoiceDescriptions || '（暂无其他角色声音参考）',
    },
  })

  // 7. 调用 LLM
  const streamContext = createWorkerLLMStreamContext(job, 'voice-prompt-infer')
  const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)

  const result = await withInternalLLMStreamCallbacks(streamCallbacks, () =>
    executeAiTextStep({
      userId: job.data.userId,
      model: analysisModel,
      messages: [{ role: 'user', content: promptContent }],
      projectId,
      action: 'lxt_voice_prompt_infer',
      meta: {
        stepId: 'voice-prompt-infer',
        stepTitle: 'AI 音色参数推理',
        stepIndex: 1,
        stepTotal: 3,
        stepAttempt: 1,
      },
    }),
  )

  await streamCallbacks.flush()

  await reportTaskProgress(job, 80, {
    stage: 'lxt_voice_prompt_infer_parse',
    stageLabel: '解析推理结果',
    displayMode: 'detail',
    stepId: 'parse',
    stepTitle: '解析 & 序列化',
    stepIndex: 2,
    stepTotal: 3,
    done: false,
  })

  // 8. 解析 LLM 输出 → VoiceDesignStructuredParams
  const parsed = safeParseJsonObject(result.text)
  const params: VoiceDesignStructuredParams = {
    timbre: typeof parsed.timbre === 'string' ? parsed.timbre : undefined,
    tone_color: typeof parsed.tone_color === 'string' ? parsed.tone_color : undefined,
    pitch_base: typeof parsed.pitch_base === 'string' ? parsed.pitch_base : undefined,
    pitch_range: typeof parsed.pitch_range === 'string' ? parsed.pitch_range : undefined,
    speed_ratio: typeof parsed.speed_ratio === 'string' ? parsed.speed_ratio : undefined,
    stability: typeof parsed.stability === 'string' ? parsed.stability : undefined,
    emotion_intensity: typeof parsed.emotion_intensity === 'string' ? parsed.emotion_intensity : undefined,
    identity_lock: typeof parsed.identity_lock === 'string' ? parsed.identity_lock : undefined,
    seed: typeof parsed.seed === 'string' ? parsed.seed : undefined,
    body_scale: typeof parsed.body_scale === 'string' && parsed.body_scale.trim() ? parsed.body_scale.trim() : undefined,
  }

  // 9. 序列化为 voicePrompt 字符串
  const label = `${asset.name}音色`
  const voicePrompt = serializeVoicePromptWithParams(label, params)

  await reportTaskProgress(job, 100, {
    stage: 'lxt_voice_prompt_infer_done',
    stageLabel: '推理完成',
    displayMode: 'detail',
    stepId: 'done',
    stepTitle: '推理完成',
    stepIndex: 3,
    stepTotal: 3,
    done: true,
  })

  // 10. 返回结果（task result 中携带 voicePrompt，前端可读取填入设计表单）
  return { voicePrompt, params }
}
