import type { Job } from 'bullmq'
import {
  createVoiceDesign,
  validatePreviewText,
  validateVoicePrompt,
  type VoiceDesignInput,
} from '@/lib/providers/bailian/voice-design'
import { createLocalVoiceDesign } from '@/lib/providers/local-indextts'
import { getProviderConfig, resolveModelSelectionOrSingle, getProviderKey } from '@/lib/api-config'
import { prisma } from '@/lib/prisma'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import type { TaskJobData } from '@/lib/task/types'

/**
 * LXT 资产声音设计 Worker Handler
 *
 * Payload: { assetId, voicePrompt, previewText, preferredName?, language? }
 * 完成后写回 LxtProjectAsset.voiceId + voiceType = 'bailian'
 */
export async function handleLxtAssetVoiceDesignTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>

  const assetId = typeof payload.assetId === 'string' ? payload.assetId.trim() : ''
  const voicePrompt = typeof payload.voicePrompt === 'string' ? payload.voicePrompt.trim() : ''
  const previewText = typeof payload.previewText === 'string' ? payload.previewText.trim() : ''
  const preferredName =
    typeof payload.preferredName === 'string' && payload.preferredName.trim()
      ? payload.preferredName.trim()
      : 'lxt_voice'
  const language = payload.language === 'en' ? 'en' : 'zh'

  if (!assetId) throw new Error('lxt_asset_voice_design: assetId is required')

  const promptValidation = validateVoicePrompt(voicePrompt)
  if (!promptValidation.valid) {
    throw new Error(promptValidation.error || 'invalid voicePrompt')
  }
  const textValidation = validatePreviewText(previewText)
  if (!textValidation.valid) {
    throw new Error(textValidation.error || 'invalid previewText')
  }

  await reportTaskProgress(job, 10, {
    stage: 'lxt_voice_design_start',
    stageLabel: '开始声音设计',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_voice_design_start')

  const input: VoiceDesignInput = { voicePrompt, previewText, preferredName, language }

  let pref: { voiceDesignModel: string | null } | null = null
  try {
    pref = await prisma.userPreference.findUnique({
      where: { userId: job.data.userId },
      select: { voiceDesignModel: true },
    })
  } catch {
    pref = null
  }

  await reportTaskProgress(job, 30, {
    stage: 'lxt_voice_design_submit',
    stageLabel: '提交声音设计任务',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_voice_design_submit')

  let designed
  try {
    if (pref?.voiceDesignModel) {
      const selection = await resolveModelSelectionOrSingle(job.data.userId, pref.voiceDesignModel, 'audio')
      const providerKey = getProviderKey(selection.provider).toLowerCase()
      if (providerKey === 'local') {
        const providerConfig = await getProviderConfig(job.data.userId, selection.provider)
        designed = await createLocalVoiceDesign(input, providerConfig.baseUrl)
      } else {
        const { apiKey } = await getProviderConfig(job.data.userId, selection.provider)
        designed = await createVoiceDesign(input, apiKey)
      }
    } else {
      const { apiKey } = await getProviderConfig(job.data.userId, 'bailian')
      designed = await createVoiceDesign(input, apiKey)
    }
  } catch {
    const { apiKey } = await getProviderConfig(job.data.userId, 'bailian')
    designed = await createVoiceDesign(input, apiKey)
  }

  if (!designed.success) {
    throw new Error(designed.error || '声音设计失败')
  }

  await reportTaskProgress(job, 90, {
    stage: 'lxt_voice_design_persist',
    stageLabel: '回填声音 ID',
    displayMode: 'detail',
  })

  // 写回 LxtProjectAsset
  await prisma.lxtProjectAsset.update({
    where: { id: assetId },
    data: {
      voiceId: designed.voiceId,
      voiceType: 'bailian',
    },
  })

  return {
    success: true,
    voiceId: designed.voiceId,
    assetId,
  }
}
