import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { getPromptTemplate, PROMPT_IDS } from '@/lib/prompt-i18n'
import { mapWithConcurrency } from '@/lib/async/map-with-concurrency'
import { parseLxtShots } from '@/lib/lxt/parse-shots'
import { resolveAnalysisModel } from './resolve-analysis-model'
import { createWorkerLLMStreamContext, createWorkerLLMStreamCallbacks } from './llm-stream'
import { withInternalLLMStreamCallbacks, type InternalLLMStreamCallbacks, type InternalLLMStreamStepMeta } from '@/lib/llm-observe/internal-stream-context'
import type { TaskJobData } from '@/lib/task/types'

const CONCURRENCY = 5

type JsonRecord = Record<string, unknown>

function parseJsonResponse(text: string): JsonRecord {
  const s = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first === -1 || last <= first) throw new Error('JSON format invalid')
  const parsed = JSON.parse(s.substring(first, last + 1))
  if (typeof parsed !== 'object' || parsed === null) throw new Error('JSON payload must be an object')
  return parsed as JsonRecord
}

function assembleShotOutput(
  label: string,
  phase1: JsonRecord,
  imagePropmt: string,
  videoPrompt: string,
): string {
  return [
    label,
    `镜头文案:${String(phase1['镜头文案'] ?? '')}`,
    `图片提示词:${imagePropmt.trim()}`,
    `视频提示词:${videoPrompt.trim()}`,
    `景别:`,
    `语音分镜:${String(phase1['语音分镜'] ?? '')}`,
    `音效:${String(phase1['音效'] ?? '')}`,
  ].join('\n')
}

/**
 * LXT 分镜转制作脚本 — 四阶段并行流水线
 *
 * Phase 1: 基础字段 + spatial_context（串行，每镜独立）
 * Phase 2A + 2B: 图片提示词 / 表演弧线（并行）
 * Phase 3: 视频提示词合成（依赖 Phase 2B 结果）
 */
export async function handleLxtStoryboardToScriptTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const projectId = job.data.projectId
  const episodeId = (typeof payload.episodeId === 'string' ? payload.episodeId : job.data.episodeId || '').trim()
  if (!episodeId) throw new Error('episodeId is required')

  const locale = typeof payload.locale === 'string' && payload.locale === 'en' ? 'en' : 'zh'

  // 1. 加载 lxtEpisode & lxtProject
  const lxtData = await prisma.lxtProject.findUnique({
    where: { projectId },
    select: { analysisModel: true },
  })

  const episode = await prisma.lxtEpisode.findUnique({
    where: { id: episodeId },
    select: { id: true, novelText: true, srtContent: true, shotListContent: true },
  })
  if (!episode) throw new Error('LxtEpisode not found')
  if (!episode.shotListContent?.trim()) throw new Error('Episode has no storyboard content')

  // 2. 解析模型
  const analysisModel = await resolveAnalysisModel({
    userId: job.data.userId,
    inputModel: payload.model,
    projectAnalysisModel: lxtData?.analysisModel,
  })

  // 3. 解析分镜列表
  const shots = parseLxtShots(episode.shotListContent)
  if (shots.length === 0) throw new Error('No shots found in storyboard content')
  const totalShots = shots.length

  await reportTaskProgress(job, 5, {
    stage: 'lxt_final_script_parse',
    stageLabel: `解析分镜：共 ${totalShots} 个镜头`,
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_final_script_parse')

  // 4. 预加载 prompt 模板
  const tpl = {
    phase1: getPromptTemplate(PROMPT_IDS.LXT_SHOT_PHASE1_BASE, locale),
    phase2a: getPromptTemplate(PROMPT_IDS.LXT_SHOT_PHASE2A_IMAGE, locale),
    phase2b: getPromptTemplate(PROMPT_IDS.LXT_SHOT_PHASE2B_ACTING_ARC, locale),
    phase3: getPromptTemplate(PROMPT_IDS.LXT_SHOT_PHASE3_VIDEO_REFINE, locale),
  }

  const story = episode.novelText || ''
  const script = episode.srtContent || ''
  let completedShots = 0
  let startedShots = 0

  // 流式观察 — Phase1 推理实时推送到前端
  const streamContext = createWorkerLLMStreamContext(job, 'lxt_script')
  const baseCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)

  // 5. 并发处理每个镜头
  const shotOutputs = await mapWithConcurrency(shots, CONCURRENCY, async (shot, i) => {
    // 镜头开始时立即上报进度，避免用户在第一个镜头推理期间长时间看不到任何状态
    startedShots += 1
    const startProgress = 10 + Math.floor(((startedShots - 1) / totalShots) * 80)
    await reportTaskProgress(job, startProgress, {
      stage: 'lxt_final_script_generate',
      stageLabel: `生成制作脚本 ${startedShots}/${totalShots}`,
      displayMode: 'detail',
    })

    // Phase 1 —— 基础字段推理（实时流式：仅转发 reasoning 块，text 是 JSON 不展示）
    // Step 索引采用"按阶段分组"策略：Phase1 = [1..N], Phase2A = [N+1..2N], Phase2B = [2N+1..3N], Phase3 = [3N+1..4N]
    // 避免 cross-shot 交叉排列（旧：i*4+1）导致后期 shot 的早期阶段 index > 早期 shot 的晚期阶段 index，
    // 从而使 activeStepId 错误地指向 Phase1（分析推理）而非 Phase4（视频合成）。
    const p1StepId = `p1:${i + 1}`
    const p1StepMeta: InternalLLMStreamStepMeta = { id: p1StepId, title: '分析推理', index: i + 1, total: totalShots * 4 }
    const phase1Callbacks: InternalLLMStreamCallbacks = {
      // 跳过 'completed' stage — 由下方手动 reportTaskProgress(done: true) 统一发出 STEP_COMPLETE，
      // 避免 worker_llm_completed 与手动调用并发写入同一 artifact 导致唯一约束冲突。
      onStage: (info) => {
        if (info.stage === 'completed') return
        baseCallbacks.onStage?.({ ...info, step: p1StepMeta })
      },
      onChunk: (chunk) => {
        if (chunk.kind !== 'reasoning') return
        baseCallbacks.onChunk?.({ ...chunk, step: p1StepMeta })
      },
      onError: (err) => baseCallbacks.onError?.(err, p1StepMeta),
    }

    // 显式上报 p1 step start，确保 UI 立即显示"进行中"，与 p2a/p2b/p3 保持一致
    await reportTaskProgress(job, startProgress, {
      stage: 'worker_llm_stage:start',
      streamRunId: streamContext.streamRunId,
      stepId: p1StepId,
      stepTitle: '分析推理',
      stepIndex: i + 1,
      stepTotal: totalShots * 4,
    })

    const prompt1 = tpl.phase1
      .replace('{story}', story)
      .replace('{script}', script)
      .replace('{shot}', shot.raw)

    const res1 = await withInternalLLMStreamCallbacks(phase1Callbacks, () =>
      executeAiTextStep({
        userId: job.data.userId,
        model: analysisModel,
        messages: [{ role: 'user', content: prompt1 }],
        action: 'lxt_shot_phase1_base',
        projectId,
        meta: { stepId: p1StepId, stepTitle: '分析推理', stepIndex: i + 1, stepTotal: totalShots * 4 },
      })
    )

    await reportTaskProgress(job, startProgress + 5, {
      stage: 'worker_llm_complete',
      done: true,
      streamRunId: streamContext.streamRunId,
      stepId: p1StepId,
      stepTitle: '分析推理',
      stepIndex: i + 1,
      stepTotal: totalShots * 4,
    })

    const phase1Json = parseJsonResponse(res1.text ?? '')
    const spatialContext = phase1Json['spatial_context'] as JsonRecord | undefined
    const spatialContextJson = JSON.stringify(spatialContext ?? {})
    const sceneType = typeof spatialContext?.['scene_type'] === 'string' ? spatialContext['scene_type'] : 'daily'

    // Phase 2A + 2B —— 并行
    const prompt2a = tpl.phase2a
      .replace('{shot}', shot.raw)
      .replace('{spatial_context_json}', spatialContextJson)

    const prompt2b = tpl.phase2b
      .replace('{shot}', shot.raw)
      .replace('{spatial_context_json}', spatialContextJson)
      .replace('{scene_type}', sceneType)

    await reportTaskProgress(job, startProgress + 10, {
      stage: 'worker_llm_stage:start',
      streamRunId: streamContext.streamRunId,
      stepId: `p2a:${i + 1}`,
      stepTitle: '图片提示词',
      stepIndex: totalShots + i + 1,
      stepTotal: totalShots * 4,
    })
    await reportTaskProgress(job, startProgress + 10, {
      stage: 'worker_llm_stage:start',
      streamRunId: streamContext.streamRunId,
      stepId: `p2b:${i + 1}`,
      stepTitle: '表演指导',
      stepIndex: 2 * totalShots + i + 1,
      stepTotal: totalShots * 4,
    })

    const p2aStepMeta: InternalLLMStreamStepMeta = { id: `p2a:${i + 1}`, title: '图片提示词', index: totalShots + i + 1, total: totalShots * 4 }
    const p2bStepMeta: InternalLLMStreamStepMeta = { id: `p2b:${i + 1}`, title: '表演指导', index: 2 * totalShots + i + 1, total: totalShots * 4 }
    const [res2a, res2b] = await Promise.all([
      withInternalLLMStreamCallbacks({
        onChunk: (chunk) => baseCallbacks.onChunk?.({ ...chunk, step: p2aStepMeta }),
        onError: (err) => baseCallbacks.onError?.(err, p2aStepMeta),
      }, () => executeAiTextStep({
        userId: job.data.userId,
        model: analysisModel,
        messages: [{ role: 'user', content: prompt2a }],
        action: 'lxt_shot_phase2a_image',
        projectId,
        meta: { stepId: `p2a:${i + 1}`, stepTitle: '图片提示词', stepIndex: totalShots + i + 1, stepTotal: totalShots * 4 },
      })),
      withInternalLLMStreamCallbacks({
        onChunk: (chunk) => baseCallbacks.onChunk?.({ ...chunk, step: p2bStepMeta }),
        onError: (err) => baseCallbacks.onError?.(err, p2bStepMeta),
      }, () => executeAiTextStep({
        userId: job.data.userId,
        model: analysisModel,
        messages: [{ role: 'user', content: prompt2b }],
        action: 'lxt_shot_phase2b_acting_arc',
        projectId,
        meta: { stepId: `p2b:${i + 1}`, stepTitle: '表演指导', stepIndex: 2 * totalShots + i + 1, stepTotal: totalShots * 4 },
      })),
    ])

    await reportTaskProgress(job, startProgress + 15, {
      stage: 'worker_llm_complete',
      done: true,
      streamRunId: streamContext.streamRunId,
      stepId: `p2a:${i + 1}`,
      stepTitle: '图片提示词',
      stepIndex: totalShots + i + 1,
      stepTotal: totalShots * 4,
    })
    await reportTaskProgress(job, startProgress + 15, {
      stage: 'worker_llm_complete',
      done: true,
      streamRunId: streamContext.streamRunId,
      stepId: `p2b:${i + 1}`,
      stepTitle: '表演指导',
      stepIndex: 2 * totalShots + i + 1,
      stepTotal: totalShots * 4,
    })

    const imagePrompt = res2a.text?.trim() ?? ''
    const actingArcJson = res2b.text?.trim() ?? ''

    // Phase 3 —— 视频提示词合成
    const prompt3 = tpl.phase3
      .replace('{acting_arc_json}', actingArcJson)
      .replace('{spatial_context_json}', spatialContextJson)
      .replace('{scene_type}', sceneType)

    await reportTaskProgress(job, startProgress + 20, {
      stage: 'worker_llm_stage:start',
      streamRunId: streamContext.streamRunId,
      stepId: `p3:${i + 1}`,
      stepTitle: '视频合成',
      stepIndex: 3 * totalShots + i + 1,
      stepTotal: totalShots * 4,
    })

    const p3StepMeta: InternalLLMStreamStepMeta = { id: `p3:${i + 1}`, title: '视频合成', index: 3 * totalShots + i + 1, total: totalShots * 4 }
    const res3 = await withInternalLLMStreamCallbacks({
      onChunk: (chunk) => baseCallbacks.onChunk?.({ ...chunk, step: p3StepMeta }),
      onError: (err) => baseCallbacks.onError?.(err, p3StepMeta),
    }, () => executeAiTextStep({
      userId: job.data.userId,
      model: analysisModel,
      messages: [{ role: 'user', content: prompt3 }],
      action: 'lxt_shot_phase3_video_refine',
      projectId,
      meta: { stepId: `p3:${i + 1}`, stepTitle: '视频合成', stepIndex: 3 * totalShots + i + 1, stepTotal: totalShots * 4 },
    }))

    const videoPrompt = res3.text?.trim() ?? ''

    const assembledOutput = assembleShotOutput(shot.label, phase1Json, imagePrompt, videoPrompt)

    // 推送完整制作脚本作为该镜头步骤的最终文本，触发前端 step.complete
    completedShots += 1
    const progress = 10 + Math.floor((completedShots / totalShots) * 80)
    await reportTaskProgress(job, progress, {
      stage: 'worker_llm_complete',
      stageLabel: 'progress.runtime.stage.llmCompleted',
      displayMode: 'detail',
      message: 'progress.runtime.llm.completed',
      done: true,
      output: assembledOutput,
      streamRunId: streamContext.streamRunId,
      stepId: `p3:${i + 1}`,
      stepTitle: '视频合成',
      stepIndex: 3 * totalShots + i + 1,
      stepTotal: totalShots * 4,
    })

    return assembledOutput
  })

  const scriptContent = shotOutputs.join('\n\n')

  // 等待所有流式发布队列排空，确保所有 step.complete 事件已发送
  await baseCallbacks.flush()

  await reportTaskProgress(job, 92, {
    stage: 'lxt_final_script_save',
    stageLabel: '保存脚本结果',
    displayMode: 'detail',
  })

  // 6. 写回数据库（使用 lxtEpisode，而非 novelPromotionEpisode）
  await prisma.lxtEpisode.update({
    where: { id: episodeId },
    data: { scriptContent },
  })

  return { episodeId, totalShots }
}
