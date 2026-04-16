/**
 * IP 角色模式 — Workflow Run Handlers
 *
 * IP_ASSET_INIT_RUN 和 IP_SCREENPLAY_REWRITE_RUN 的编排入口。
 * 复用现有 withWorkflowRunLease + assertWorkflowRunActive 模式。
 */

import type { Job } from 'bullmq'
import type { TaskJobData } from '@/lib/task/types'
import { TaskTerminatedError } from '@/lib/task/errors'
import { prisma } from '@/lib/prisma'
import { reportTaskProgress } from '@/lib/workers/shared'
import { withWorkflowRunLease, assertWorkflowRunActive } from '@/lib/run-runtime/workflow-lease'
import { createArtifact } from '@/lib/run-runtime/service'
import { decomposeFeatures } from '@/lib/ip-mode/ip-generation/feature-decomposer'
import { buildPersonaContext } from '@/lib/ip-mode/ip-screenplay/persona-injector'
import { parseLLMSegments, persistSegments } from '@/lib/ip-mode/ip-screenplay/segment-parser'

type AnyObj = Record<string, unknown>

function buildWorkflowWorkerId(job: Job<TaskJobData>, label: string) {
  return `${label}:${job.queueName}:${job.data.taskId}`
}

// ==================== IP Asset Init Run ====================

/**
 * IP_ASSET_INIT_RUN handler
 *
 * 工作流步骤：
 * 1. extract_face — 从面部参考图提取结构化描述
 * 2. ref_sheet_turnaround — 生成转身参考图
 * 3. ref_sheet_expression — 生成表情参考图
 * 4. ref_sheet_pose — 生成姿势参考图
 */
export async function handleIpAssetInitRun(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const _projectId = job.data.projectId
  const userId = job.data.userId
  const globalCharacterId = typeof payload.globalCharacterId === 'string'
    ? payload.globalCharacterId
    : ''
  const runId = typeof payload.runId === 'string' ? payload.runId.trim() : ''

  if (!runId) {
    throw new Error('runId is required for ip_asset_init pipeline')
  }
  if (!globalCharacterId) {
    throw new Error('globalCharacterId is required for ip_asset_init pipeline')
  }

  const character = await prisma.globalCharacter.findUnique({
    where: { id: globalCharacterId },
    include: { faceMedia: true },
  })
  if (!character) {
    throw new Error('Global character not found')
  }

  const workerId = buildWorkflowWorkerId(job, 'ip_asset_init')

  const assertRunActive = async (stage: string) => {
    await assertWorkflowRunActive({ runId, workerId, stage })
  }

  const leaseResult = await withWorkflowRunLease({
    runId,
    userId,
    workerId,
    run: async () => {
      // Step 1: extract_face
      await assertRunActive('extract_face')
      await reportTaskProgress(job, 10, { stage: 'extract_face' })

      // TODO: 调用 vision 模型提取面部描述
      const faceDescriptor = character.faceDescriptor
        ? JSON.parse(character.faceDescriptor as string)
        : {}

      const decomposed = decomposeFeatures({
        ipCharacter: character,
        variant: null,
        panelPrompt: null,
        sceneContext: null,
      })

      await createArtifact({
        runId,
        stepKey: 'extract_face',
        artifactType: 'ip.face_descriptor',
        refId: globalCharacterId,
        payload: { faceDescriptor, decomposed },
      })

      await reportTaskProgress(job, 30, { stage: 'extract_face_done' })

      // Step 2-4: ref_sheet generation (turnaround, expression, pose)
      const refSheetTypes = ['turnaround', 'expression', 'pose'] as const
      for (let i = 0; i < refSheetTypes.length; i++) {
        const sheetType = refSheetTypes[i]
        const stepKey = `ref_sheet_${sheetType}`
        await assertRunActive(stepKey)
        await reportTaskProgress(job, 40 + i * 20, { stage: stepKey })

        // TODO: 调用图像生成模型创建参考图集
        // 当前为占位 — 需要集成 image generation pipeline

        await createArtifact({
          runId,
          stepKey,
          artifactType: 'ip.ref_sheet',
          refId: globalCharacterId,
          payload: { type: sheetType, status: 'pending_generation' },
        })
      }

      await reportTaskProgress(job, 100, { stage: 'ip_asset_init_done' })

      return {
        globalCharacterId,
        faceDescriptor,
        refSheetCount: refSheetTypes.length,
      }
    },
  })

  if (!leaseResult.claimed) {
    throw new TaskTerminatedError(runId, 'ip_asset_init: failed to claim lease')
  }

  return leaseResult.result
}

// ==================== IP Screenplay Rewrite Run ====================

/**
 * IP_SCREENPLAY_REWRITE_RUN handler
 *
 * 工作流步骤：
 * 1. inject_personas — 收集选角人设上下文
 * 2. rewrite_screenplay — LLM 改写剧本
 * 3. parse_segments — 结构化拆分
 * 4. persist_ip_screenplay — 持久化
 */
export async function handleIpScreenplayRewriteRun(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const projectId = job.data.projectId
  const userId = job.data.userId
  const episodeId = typeof payload.episodeId === 'string' ? payload.episodeId.trim() : ''
  const clipId = typeof payload.clipId === 'string' ? payload.clipId.trim() : ''
  const runId = typeof payload.runId === 'string' ? payload.runId.trim() : ''

  if (!runId) {
    throw new Error('runId is required for ip_screenplay_rewrite pipeline')
  }
  if (!projectId) {
    throw new Error('projectId is required for ip_screenplay_rewrite pipeline')
  }

  const novelData = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    select: { id: true, ipModeEnabled: true },
  })
  if (!novelData?.ipModeEnabled) {
    throw new Error('IP mode is not enabled for this project')
  }

  const workerId = buildWorkflowWorkerId(job, 'ip_screenplay_rewrite')

  const assertRunActive = async (stage: string) => {
    await assertWorkflowRunActive({ runId, workerId, stage })
  }

  const leaseResult = await withWorkflowRunLease({
    runId,
    userId,
    workerId,
    run: async () => {
      // Step 1: inject_personas
      await assertRunActive('inject_personas')
      await reportTaskProgress(job, 10, { stage: 'inject_personas' })

      const personaContext = await buildPersonaContext(projectId)

      await createArtifact({
        runId,
        stepKey: 'inject_personas',
        artifactType: 'ip.persona_context',
        refId: projectId,
        payload: {
          personaText: personaContext.personaText,
          castingCount: personaContext.castingCount,
        },
      })

      await reportTaskProgress(job, 30, { stage: 'inject_personas_done' })

      // Step 2: rewrite_screenplay
      await assertRunActive('rewrite_screenplay')
      await reportTaskProgress(job, 40, { stage: 'rewrite_screenplay' })

      // TODO: 调用 LLM 改写剧本，将 persona 上下文注入
      // 需要：原始剧本文本 + personaContext.personaText → LLM → rewritten screenplay
      const rewrittenScreenplay = '' // placeholder

      await createArtifact({
        runId,
        stepKey: 'rewrite_screenplay',
        artifactType: 'ip.rewritten_screenplay',
        refId: projectId,
        payload: { text: rewrittenScreenplay, status: 'pending_llm' },
      })

      await reportTaskProgress(job, 60, { stage: 'rewrite_done' })

      // Step 3: parse_segments
      await assertRunActive('parse_segments')
      await reportTaskProgress(job, 70, { stage: 'parse_segments' })

      // TODO: 等 LLM 集成后，使用实际改写文本
      const segments = rewrittenScreenplay
        ? parseLLMSegments(rewrittenScreenplay)
        : []

      await createArtifact({
        runId,
        stepKey: 'parse_segments',
        artifactType: 'ip.structured_segments',
        refId: projectId,
        payload: { segmentCount: segments.length },
      })

      await reportTaskProgress(job, 85, { stage: 'parse_done' })

      // Step 4: persist_ip_screenplay
      await assertRunActive('persist_ip_screenplay')
      await reportTaskProgress(job, 90, { stage: 'persist' })

      if (segments.length > 0 && clipId) {
        await persistSegments({
          projectId,
          episodeId: episodeId || null,
          clipId,
          segments,
          castingMap: {}, // TODO: build casting map from project castings
        })
      }

      await reportTaskProgress(job, 100, { stage: 'ip_screenplay_rewrite_done' })

      return {
        personaCastingCount: personaContext.castingCount,
        segmentCount: segments.length,
      }
    },
  })

  if (!leaseResult.claimed) {
    throw new TaskTerminatedError(runId, 'ip_screenplay_rewrite: failed to claim lease')
  }

  return leaseResult.result
}
