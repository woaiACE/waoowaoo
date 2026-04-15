/**
 * IP 角色模式 — Worker Handlers
 *
 * 所有 IP 任务的处理函数，由现有 Worker 通过 switch-case 分发调用。
 */

import type { Job } from 'bullmq'
import type { TaskJobData } from '@/lib/task/types'
import { prisma } from '@/lib/prisma'
import { reportTaskProgress } from '@/lib/workers/shared'

type AnyObj = Record<string, unknown>

// ==================== 面部特征提取 ====================

/**
 * IP_EXTRACT_FACE handler
 * 使用 vision 模型分析面部参考图，提取结构化描述
 */
export async function handleIpExtractFace(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const ipCharacterId = typeof payload.ipCharacterId === 'string' ? payload.ipCharacterId : job.data.targetId

  await reportTaskProgress(job, 10, { stage: 'ip_extract_face_start' })

  const character = await prisma.ipCharacter.findUnique({
    where: { id: ipCharacterId },
  })

  if (!character?.faceReferenceUrl) {
    throw new Error('IP character has no face reference image')
  }

  await reportTaskProgress(job, 30, { stage: 'ip_extract_face_analyzing' })

  // TODO: 调用 vision model 分析面部特征
  // const descriptor = await analyzeWithVision(character.faceReferenceUrl)
  // 暂时使用占位结构
  const descriptor = {
    summary: `Face features extracted from reference image for ${character.name}`,
    tags: [],
  }

  await prisma.ipCharacter.update({
    where: { id: ipCharacterId },
    data: {
      faceDescriptor: JSON.stringify(descriptor),
    },
  })

  await reportTaskProgress(job, 100, { stage: 'ip_extract_face_done' })

  return { ipCharacterId, faceDescriptor: descriptor }
}

// ==================== 参考图集生成 ====================

/**
 * IP_REF_SHEET_GENERATE handler
 * 根据面部参考 + sheetType 生成对应参考图
 */
export async function handleIpRefSheetGenerate(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const refSheetId = typeof payload.refSheetId === 'string' ? payload.refSheetId : job.data.targetId

  await reportTaskProgress(job, 10, { stage: 'ip_ref_sheet_start' })

  const sheet = await prisma.ipReferenceSheet.findUnique({
    where: { id: refSheetId },
    include: { ipCharacter: true },
  })

  if (!sheet) {
    throw new Error(`IP reference sheet not found: ${refSheetId}`)
  }

  await prisma.ipReferenceSheet.update({
    where: { id: refSheetId },
    data: { status: 'generating', taskId: job.data.taskId },
  })

  await reportTaskProgress(job, 30, { stage: 'ip_ref_sheet_generating', sheetType: sheet.sheetType })

  // TODO: 根据 sheet.sheetType 构建 prompt 并调用 image generator
  // const images = await generateRefSheet(sheet.ipCharacter, sheet.sheetType)

  await prisma.ipReferenceSheet.update({
    where: { id: refSheetId },
    data: {
      status: 'completed',
      // imageUrl, imageUrls, imageMediaId 等生成后填充
    },
  })

  await reportTaskProgress(job, 100, { stage: 'ip_ref_sheet_done' })

  return { refSheetId, sheetType: sheet.sheetType }
}

// ==================== 形态预设预览 ====================

/**
 * IP_VARIANT_PREVIEW handler
 * 根据 IP 角色面部 + variant 描述生成预览图
 */
export async function handleIpVariantPreview(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const variantId = typeof payload.variantId === 'string' ? payload.variantId : job.data.targetId

  await reportTaskProgress(job, 10, { stage: 'ip_variant_preview_start' })

  const variant = await prisma.ipCharacterVariant.findUnique({
    where: { id: variantId },
    include: { ipCharacter: true },
  })

  if (!variant) {
    throw new Error(`IP variant not found: ${variantId}`)
  }

  await reportTaskProgress(job, 30, { stage: 'ip_variant_preview_generating' })

  // TODO: 使用 feature decomposer 组装 prompt 并生成预览图
  // const decomposed = decomposeFeatures({ ipCharacter: variant.ipCharacter, variant, ... })
  // const prompt = assembleIpImagePrompt(decomposed)
  // const images = await generateImage({ prompt, referenceImages: [...] })

  await reportTaskProgress(job, 100, { stage: 'ip_variant_preview_done' })

  return { variantId }
}

// ==================== IP 增强图像生成 ====================

/**
 * IP_IMAGE_PANEL handler
 * 在常规 panel image 生成的基础上，附加面部一致性约束
 */
export async function handleIpImagePanel(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj

  await reportTaskProgress(job, 10, { stage: 'ip_image_panel_start' })

  // TODO: 实现完整的 IP 增强图像生成管线
  // 1. 获取 panel 数据
  // 2. 获取关联的 IpCasting + IpCharacter
  // 3. decomposeFeatures
  // 4. assembleIpImagePrompt
  // 5. 附加面部参考图
  // 6. 调用 image generator

  await reportTaskProgress(job, 100, { stage: 'ip_image_panel_done' })

  return { panelId: payload.panelId }
}

/**
 * IP_IMAGE_CHARACTER handler
 * 生成 IP 角色的独立形象图
 */
export async function handleIpImageCharacter(job: Job<TaskJobData>) {
  await reportTaskProgress(job, 10, { stage: 'ip_image_character_start' })

  // TODO: 调用 image generator 生成 IP 角色形象

  await reportTaskProgress(job, 100, { stage: 'ip_image_character_done' })

  return { targetId: job.data.targetId }
}

// ==================== IP 语音生成 ====================

/**
 * IP_VOICE_LINE handler
 * 自动匹配 IP 角色音色 + 情感参数生成语音
 */
export async function handleIpVoiceLine(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const segmentId = typeof payload.segmentId === 'string' ? payload.segmentId : ''

  await reportTaskProgress(job, 10, { stage: 'ip_voice_line_start' })

  if (!segmentId) {
    throw new Error('IP_VOICE_LINE task missing segmentId')
  }

  // 获取 IP 语音上下文
  const { resolveIpVoiceContext } = await import('@/lib/ip-mode/ip-voice/ip-voice-generator')
  const _voiceContext = await resolveIpVoiceContext(segmentId)

  await reportTaskProgress(job, 30, { stage: 'ip_voice_line_generating' })

  // TODO: 调用 generateVoiceLine 并传入 IP 音色 + 情感参数
  // const result = await generateVoiceLine({
  //   text: voiceContext.text,
  //   voiceId: voiceContext.voiceId,
  //   voiceType: voiceContext.voiceType,
  //   emotionPrompt: voiceContext.emotionPrompt,
  //   emotionStrength: voiceContext.emotionStrength,
  // })

  await reportTaskProgress(job, 100, { stage: 'ip_voice_line_done' })

  return { segmentId }
}

// ==================== IP 剧本处理 ====================

/**
 * IP_SCREENPLAY_REWRITE handler
 * 基于 IP 人设注入的 LLM 剧本改写
 */
export async function handleIpScreenplayRewrite(job: Job<TaskJobData>) {
  await reportTaskProgress(job, 10, { stage: 'ip_screenplay_rewrite_start' })

  // TODO: 调用 persona-injector 构建上下文 + LLM 改写
  // const { buildPersonaContext } = await import('@/lib/ip-mode/ip-screenplay/persona-injector')
  // const context = await buildPersonaContext(job.data.projectId)
  // ... LLM call with persona context injection ...

  await reportTaskProgress(job, 100, { stage: 'ip_screenplay_rewrite_done' })

  return { projectId: job.data.projectId }
}

/**
 * IP_SCREENPLAY_PARSE handler
 * 将改写后的剧本拆分为结构化段落
 */
export async function handleIpScreenplayParse(job: Job<TaskJobData>) {
  await reportTaskProgress(job, 10, { stage: 'ip_screenplay_parse_start' })

  // TODO: 调用 segment-parser 解析 LLM 输出
  // const { parseLLMSegments, persistSegments } = await import('@/lib/ip-mode/ip-screenplay/segment-parser')

  await reportTaskProgress(job, 100, { stage: 'ip_screenplay_parse_done' })

  return { projectId: job.data.projectId }
}
