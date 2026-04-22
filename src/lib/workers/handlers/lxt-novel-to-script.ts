import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { logAIAnalysis } from '@/lib/logging/semantic'
import { onProjectNameAvailable } from '@/lib/logging/file-writer'
import { getPromptTemplate, PROMPT_IDS } from '@/lib/prompt-i18n'
import { resolveAnalysisModel } from './resolve-analysis-model'
import { createWorkerLLMStreamContext, createWorkerLLMStreamCallbacks } from './llm-stream'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import type { TaskJobData } from '@/lib/task/types'

/**
 * LXT 小说转剧本 task handler
 *
 * 读取 episode.novelText，调用 LLM 将其转为「旁白 / 角色对白」格式剧本，
 * 结果写回 episode.srtContent（复用现有字段存储 LXT 剧本文本）。
 */
export async function handleLxtNovelToScriptTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const projectId = job.data.projectId
  const episodeId = (typeof payload.episodeId === 'string' ? payload.episodeId : job.data.episodeId || '').trim()
  if (!episodeId) throw new Error('episodeId is required')

  const instruction = typeof payload.instruction === 'string' ? payload.instruction.trim() : ''
  const locale = typeof payload.locale === 'string' && payload.locale === 'en' ? 'en' : 'zh'

  // 1. 加载项目 & episode
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
    select: { id: true, novelText: true },
  })
  if (!episode) throw new Error('Episode not found')
  if (!episode.novelText?.trim()) throw new Error('Episode has no novel text')

  // 2. 解析模型
  const analysisModel = await resolveAnalysisModel({
    userId: job.data.userId,
    inputModel: payload.model,
    projectAnalysisModel: lxtData?.analysisModel,
  })

  await reportTaskProgress(job, 10, {
    stage: 'lxt_prepare',
    stageLabel: '准备 LXT 剧本转换',
    displayMode: 'detail',
  })

  await assertTaskActive(job, 'lxt_prepare')

  // 3. 构建 prompt
  const template = getPromptTemplate(PROMPT_IDS.LXT_NOVEL_TO_SCRIPT, locale)
  const prompt = template
    .replace('{novel_text}', episode.novelText)
    .replace('{instruction}', instruction || '无')

  onProjectNameAvailable(projectId, project.name)
  logAIAnalysis(job.data.userId, 'worker', projectId, project.name, {
    action: 'LXT_NOVEL_TO_SCRIPT_PROMPT',
    input: { prompt: prompt.slice(0, 500) },
    model: analysisModel,
  })

  await reportTaskProgress(job, 20, {
    stage: 'lxt_generate',
    stageLabel: '正在生成剧本',
    displayMode: 'detail',
    message: 'AI 正在将小说转为剧本…',
    stepId: 'lxt_novel_to_script',
    stepTitle: '小说转剧本',
    stepIndex: 1,
    stepTotal: 1,
  })

  // 4. 调用 LLM（流式回调，tokens 写入 DB 供前端轮询）
  const streamContext = createWorkerLLMStreamContext(job, 'lxt_novel_to_script')
  const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)
  const result = await (async () => {
    try {
      return await withInternalLLMStreamCallbacks(
        streamCallbacks,
        async () =>
          await executeAiTextStep({
            userId: job.data.userId,
            model: analysisModel,
            messages: [{ role: 'user', content: prompt }],
            action: 'lxt_novel_to_script',
            projectId,
            meta: {
              stepId: 'lxt_novel_to_script',
              stepTitle: '小说转剧本',
              stepIndex: 1,
              stepTotal: 1,
            },
          }),
      )
    } finally {
      await streamCallbacks.flush()
    }
  })()

  await reportTaskProgress(job, 90, {
    stage: 'lxt_save',
    stageLabel: '保存剧本',
    displayMode: 'detail',
  })

  // 5. 保存结果到 episode.srtContent（复用现有字段）
  await prisma.lxtEpisode.update({
    where: { id: episodeId },
    data: { srtContent: result.text },
  })

  await reportTaskProgress(job, 100, {
    stage: 'lxt_done',
    stageLabel: '剧本生成完成',
    displayMode: 'detail',
  })

  return { episodeId, scriptLength: result.text.length }
}
