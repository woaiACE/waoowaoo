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

  // 3. 构建 prompt
  const template = getPromptTemplate(PROMPT_IDS.LXT_SCRIPT_TO_STORYBOARD, locale)
  const prompt = template.replace('{script}', episode.srtContent)

  await reportTaskProgress(job, 20, {
    stage: 'lxt_storyboard_generate',
    stageLabel: 'LXT 分镜生成中',
    displayMode: 'detail',
  })

  await assertTaskActive(job, 'lxt_storyboard_generate')

  // 4. 调用 LLM
  const result = await executeAiTextStep({
    userId: job.data.userId,
    model: analysisModel,
    messages: [{ role: 'user', content: prompt }],
    action: 'lxt_script_to_storyboard',
    projectId,
    meta: {
      stepId: 'lxt_script_to_storyboard',
      stepTitle: '剧本转分镜',
      stepIndex: 1,
      stepTotal: 1,
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
