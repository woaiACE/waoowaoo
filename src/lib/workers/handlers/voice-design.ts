import type { Job } from 'bullmq'
import {
  createVoiceDesign,
  validatePreviewText,
  validateVoicePrompt,
  type VoiceDesignInput,
} from '@/lib/providers/bailian/voice-design'
import { getProviderConfig, getProviderKey, resolveModelSelectionOrSingle } from '@/lib/api-config'
import { createMinimaxVoiceDesign, type VoiceDesignInput as MinimaxVoiceDesignInput } from '@/lib/providers/minimax'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`)
  }
  return value.trim()
}

function readLanguage(value: unknown): 'zh' | 'en' {
  return value === 'en' ? 'en' : 'zh'
}

export async function handleVoiceDesignTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const voicePrompt = readRequiredString(payload.voicePrompt, 'voicePrompt')
  const previewText = readRequiredString(payload.previewText, 'previewText')
  const preferredName = typeof payload.preferredName === 'string' && payload.preferredName.trim()
    ? payload.preferredName.trim()
    : 'custom_voice'
  const language = readLanguage(payload.language)

  const promptValidation = validateVoicePrompt(voicePrompt)
  if (!promptValidation.valid) {
    throw new Error(promptValidation.error || 'invalid voicePrompt')
  }
  const textValidation = validatePreviewText(previewText)
  if (!textValidation.valid) {
    throw new Error(textValidation.error || 'invalid previewText')
  }

  await reportTaskProgress(job, 25, {
    stage: 'voice_design_submit',
    stageLabel: '提交声音设计任务',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'voice_design_submit')

  const audioSelection = await resolveModelSelectionOrSingle(job.data.userId, undefined, 'audio')
  const providerKey = getProviderKey(audioSelection.provider).toLowerCase()

  let voiceId: string | undefined
  let targetModel: string | undefined
  let audioBase64: string | undefined
  let sampleRate: number | undefined
  let responseFormat: string | undefined
  let usageCount: number | undefined
  let requestId: string | undefined

  if (providerKey === 'minimax') {
    const { apiKey, baseUrl } = await getProviderConfig(job.data.userId, audioSelection.provider)
    const input: MinimaxVoiceDesignInput = {
      voicePrompt,
      previewText,
      preferredName,
      language,
    }
    const designed = await createMinimaxVoiceDesign(input, apiKey, baseUrl)
    if (!designed.success) {
      throw new Error(designed.error || 'Minimax声音设计失败')
    }
    voiceId = designed.voiceId
    audioBase64 = designed.audioBase64
  } else if (providerKey === 'bailian') {
    const { apiKey } = await getProviderConfig(job.data.userId, audioSelection.provider)
    const input: VoiceDesignInput = {
      voicePrompt,
      previewText,
      preferredName,
      language,
    }
    const designed = await createVoiceDesign(input, apiKey)
    if (!designed.success) {
      throw new Error(designed.error || '声音设计失败')
    }
    voiceId = designed.voiceId
    targetModel = designed.targetModel
    audioBase64 = designed.audioBase64
    sampleRate = designed.sampleRate
    responseFormat = designed.responseFormat
    usageCount = designed.usageCount
    requestId = designed.requestId
  } else {
    throw new Error(`当前提供商 (${audioSelection.provider}) 不支持声音设计`)
  }

  await reportTaskProgress(job, 96, {
    stage: 'voice_design_done',
    stageLabel: '声音设计完成',
    displayMode: 'detail',
  })

  return {
    success: true,
    voiceId,
    targetModel,
    audioBase64,
    sampleRate,
    responseFormat,
    usageCount,
    requestId,
    taskType: job.data.type === TASK_TYPE.ASSET_HUB_VOICE_DESIGN ? TASK_TYPE.ASSET_HUB_VOICE_DESIGN : TASK_TYPE.VOICE_DESIGN,
  }
}
