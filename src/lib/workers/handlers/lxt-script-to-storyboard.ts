import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { getPromptTemplate, PROMPT_IDS } from '@/lib/prompt-i18n'
import { resolveAnalysisModel } from './resolve-analysis-model'
import type { TaskJobData } from '@/lib/task/types'

/**
 * LXT 剧本转分镜 task handler（备用 BullMQ 路径，当前主路径为直接流式 SSE）
 *
 * 读取 episode.srtContent，调用 LLM 将其拆解为逐镜分镜脚本，
 * 结果写回 episode.shotListContent。
 */
export async function handleLxtScriptToStoryboardTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const projectId = job.data.projectId
  const episodeId = (typeof payload.episodeId === 'string' ? payload.episodeId : job.data.episodeId || '').trim()
  if (!episodeId) throw new Error('episodeId is required')

  const locale = typeof payload.locale === 'string' && payload.locale === 'en' ? 'en' : 'zh'

  // 1. 加载项目 & episode（从 lxtProject / lxtEpisode 读取，与 SSE 主路径对称）
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  })
  if (!project) throw new Error('Project not found')

  const lxtData = await prisma.lxtProject.findUnique({
    where: { projectId },
    select: { analysisModel: true },
  })

  const episode = await prisma.lxtEpisode.findUnique({
    where: { id: episodeId },
    select: { id: true, srtContent: true },
  })
  if (!episode) throw new Error('Episode not found')
  if (!episode.srtContent?.trim()) throw new Error('Episode has no script content')

  // 2. 解析模型（与 generate-storyboard SSE 路由对称）
  const analysisModel = await resolveAnalysisModel({
    userId: job.data.userId,
    inputModel: payload.model,
    projectAnalysisModel: lxtData?.analysisModel,
  })

  await reportTaskProgress(job, 10, {
    stage: 'lxt_storyboard_prepare',
    stageLabel: '准备 LXT 分镜生成',
    displayMode: 'detail',
  })

  await assertTaskActive(job, 'lxt_storyboard_prepare')

  // 3. Phase 1: Script Analysis
  await reportTaskProgress(job, 20, {
    stage: 'lxt_storyboard_analysis',
    stageLabel: 'LXT 剧本分析中',
    displayMode: 'detail',
  })

  await assertTaskActive(job, 'lxt_storyboard_analysis')

  let analysisResult: Record<string, unknown> | null = null
  try {
    const analysisTemplate = getPromptTemplate(PROMPT_IDS.LXT_SCRIPT_ANALYSIS, locale)
    const analysisPrompt = analysisTemplate.replace('{script}', episode.srtContent)

    const analysisResultRaw = await executeAiTextStep({
      userId: job.data.userId,
      model: analysisModel,
      messages: [{ role: 'user', content: analysisPrompt }],
      action: 'lxt_script_analysis',
      projectId,
      meta: {
        stepId: 'lxt_script_analysis',
        stepTitle: '剧本分析',
        stepIndex: 1,
        stepTotal: 2,
      },
    })

    const analysisText = analysisResultRaw.text?.trim() ?? ''
    if (analysisText) {
      try {
        const cleaned = analysisText.replace(/```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i, '$1').trim()
        const parsed = JSON.parse(cleaned || analysisText)
        if (parsed && typeof parsed === 'object') analysisResult = parsed as Record<string, unknown>
      } catch {
        // Phase 1 JSON parse failed, proceed without analysis
      }
    }
  } catch {
    // Phase 1 failed, proceed without analysis
  }

  // 4. Phase 2: Storyboard Generation
  await reportTaskProgress(job, 40, {
    stage: 'lxt_storyboard_generate',
    stageLabel: 'LXT 分镜生成中',
    displayMode: 'detail',
  })

  await assertTaskActive(job, 'lxt_storyboard_generate')

  const storyboardTemplate = getPromptTemplate(PROMPT_IDS.LXT_SCRIPT_TO_STORYBOARD, locale)
  const basePrompt = storyboardTemplate.replace('{script}', episode.srtContent)
  const prompt = analysisResult
    ? `【剧本分析结果】\n${JSON.stringify(analysisResult)}\n\n${basePrompt}`
    : basePrompt

  const result = await executeAiTextStep({
    userId: job.data.userId,
    model: analysisModel,
    messages: [{ role: 'user', content: prompt }],
    action: 'lxt_script_to_storyboard',
    projectId,
    meta: {
      stepId: 'lxt_script_to_storyboard',
      stepTitle: '剧本转分镜',
      stepIndex: 2,
      stepTotal: 2,
    },
  })

  const shotListContent = result.text?.trim() ?? ''
  if (!shotListContent) throw new Error('LLM returned empty storyboard')

  await reportTaskProgress(job, 90, {
    stage: 'lxt_storyboard_save',
    stageLabel: '保存分镜结果',
    displayMode: 'detail',
  })

  // 5. 写回数据库（lxtEpisode，与 SSE 主路径对称）
  await prisma.lxtEpisode.update({
    where: { id: episodeId },
    data: { shotListContent },
  })

  return { episodeId, shotListContent }
}
