'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  encodeModelKey,
  PRESET_MODELS,
  PRESET_PROVIDERS,
  getProviderKey,
  getProviderTutorial,
  matchesModelKey,
} from '../../types'
import type {
  ModelFormState,
  ProviderCardGroupedModels,
  ProviderCardModelType,
  ProviderCardProps,
  ProviderCardTranslator,
} from '../types'
import { VERIFIABLE_PROVIDER_KEYS } from '../types'
import type { CustomModel } from '../../types'
import { apiFetch } from '@/lib/api-fetch'
import type { LmStudioNativeModel } from '@/lib/lmstudio/native'
import type { LmStudioRuntimeStats } from '@/lib/lmstudio/runtime'
import {
  useAssistantChat,
  type AssistantDraftModel,
  type AssistantSavedEvent,
  type UseAssistantChatResult,
} from '@/components/assistant/useAssistantChat'

type KeyTestStepStatus = 'pass' | 'fail' | 'skip'
interface KeyTestStep {
  name: string
  status: KeyTestStepStatus
  message: string
  model?: string
  detail?: string
}
type KeyTestStatus = 'idle' | 'testing' | 'passed' | 'failed'



interface UseProviderCardStateParams {
  provider: ProviderCardProps['provider']
  models: ProviderCardProps['models']
  allModels?: ProviderCardProps['allModels']
  defaultModels: ProviderCardProps['defaultModels']
  onUpdateApiKey: ProviderCardProps['onUpdateApiKey']
  onUpdateBaseUrl: ProviderCardProps['onUpdateBaseUrl']
  onUpdateModel: ProviderCardProps['onUpdateModel']
  onUpdateDefaultModel: ProviderCardProps['onUpdateDefaultModel']
  onAddModel: ProviderCardProps['onAddModel']
  onFlushConfig: ProviderCardProps['onFlushConfig']
  t: ProviderCardTranslator
}

const EMPTY_MODEL_FORM: ModelFormState = {
  name: '',
  modelId: '',
  enableCustomPricing: false,
  priceInput: '',
  priceOutput: '',
  basePrice: '',
  optionPricesJson: '',
}

/**
 * Provider keys that require user-defined pricing when adding custom models
 * (they are not in the built-in pricing catalog).
 */
type AddModelCustomPricing = {
  llm?: { inputPerMillion?: number; outputPerMillion?: number }
  image?: { basePrice?: number; optionPrices?: Record<string, Record<string, number>> }
  video?: { basePrice?: number; optionPrices?: Record<string, Record<string, number>> }
}

type BuildCustomPricingResult =
  | { ok: true; customPricing?: AddModelCustomPricing }
  | { ok: false; reason: 'invalid' }

interface ProviderConnectionPayload {
  apiType: string
  apiKey: string
  baseUrl?: string
  llmModel?: string
}

type LlmProtocolType = 'responses' | 'chat-completions'
type LmStudioStatus = 'idle' | 'loading' | 'ready' | 'error'

type ProbeModelLlmProtocolSuccessResponse = {
  success: true
  protocol: LlmProtocolType
  checkedAt: string
}

type ProbeModelLlmProtocolFailureResponse = {
  success: false
  code?: string
}

function isLlmProtocol(value: unknown): value is LlmProtocolType {
  return value === 'responses' || value === 'chat-completions'
}

function readProbeFailureCode(value: unknown): string {
  return typeof value === 'string' ? value : 'PROBE_INCONCLUSIVE'
}

function resolveLmStudioManageFailureMessage(error: unknown, t: ProviderCardTranslator): string {
  const message = error instanceof Error ? error.message : ''
  if (message === 'LMSTUDIO_BASE_URL_REQUIRED') return t('lmStudioBaseUrlRequired')
  if (message === 'LMSTUDIO_BASE_URL_INVALID') return t('lmStudioBaseUrlInvalid')
  if (message.includes('fetch failed') || message.includes('Network')) return t('lmStudioNetworkError')
  return message || t('lmStudioManageFailed')
}

export function shouldProbeModelLlmProtocol(params: {
  providerId: string
  modelType: ProviderCardModelType
}): boolean {
  const providerKey = getProviderKey(params.providerId)
  return (providerKey === 'openai-compatible' || providerKey === 'lmstudio') && params.modelType === 'llm'
}

export function shouldReprobeModelLlmProtocol(params: {
  providerId: string
  originalModel: CustomModel
  nextModelId: string
}): boolean {
  if (!shouldProbeModelLlmProtocol({ providerId: params.providerId, modelType: 'llm' })) return false
  if (params.originalModel.type !== 'llm') return false
  const providerKey = getProviderKey(params.originalModel.provider)
  if (providerKey !== 'openai-compatible' && providerKey !== 'lmstudio') return false
  return params.originalModel.modelId !== params.nextModelId || params.originalModel.provider !== params.providerId
}

export async function probeModelLlmProtocolViaApi(params: {
  providerId: string
  modelId: string
}): Promise<{ llmProtocol: LlmProtocolType; llmProtocolCheckedAt: string }> {
  const response = await apiFetch('/api/user/api-config/probe-model-llm-protocol', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerId: params.providerId,
      modelId: params.modelId,
    }),
  })
  if (!response.ok) {
    throw new Error('MODEL_LLM_PROTOCOL_PROBE_REQUEST_FAILED')
  }

  const payload = await response.json() as ProbeModelLlmProtocolSuccessResponse | ProbeModelLlmProtocolFailureResponse
  if (!payload.success) {
    throw new Error(readProbeFailureCode(payload.code))
  }

  if (!isLlmProtocol(payload.protocol)) {
    throw new Error('MODEL_LLM_PROTOCOL_PROBE_INVALID_PROTOCOL')
  }

  const checkedAt = typeof payload.checkedAt === 'string' && payload.checkedAt.trim().length > 0
    ? payload.checkedAt.trim()
    : new Date().toISOString()

  return {
    llmProtocol: payload.protocol,
    llmProtocolCheckedAt: checkedAt,
  }
}

function pickConfiguredLlmModel(params: {
  models: CustomModel[]
  defaultAnalysisModel?: string
}): string | undefined {
  const enabledLlmModels = params.models.filter((model) => model.type === 'llm' && model.enabled)
  if (enabledLlmModels.length === 0) return undefined
  const preferredModel = enabledLlmModels.find((model) => model.modelKey === params.defaultAnalysisModel)
  return (preferredModel ?? enabledLlmModels[0])?.modelId
}

export function buildProviderConnectionPayload(params: {
  providerKey: string
  apiKey: string
  baseUrl?: string
  llmModel?: string
}): ProviderConnectionPayload {
  const apiKey = params.apiKey.trim()
  const compatibleBaseUrl = params.baseUrl?.trim()
  const llmModel = params.llmModel?.trim()
  const isCompatibleProvider =
    params.providerKey === 'openai-compatible' || params.providerKey === 'gemini-compatible' || params.providerKey === 'lmstudio'

  if (isCompatibleProvider && compatibleBaseUrl) {
    return {
      apiType: params.providerKey,
      apiKey,
      baseUrl: compatibleBaseUrl,
      ...(llmModel ? { llmModel } : {}),
    }
  }

  return {
    apiType: params.providerKey,
    apiKey,
    ...(llmModel ? { llmModel } : {}),
  }
}

export function buildCustomPricingFromModelForm(
  modelType: ProviderCardModelType,
  form: ModelFormState,
  options: { needsCustomPricing: boolean },
): BuildCustomPricingResult {
  if (!options.needsCustomPricing || form.enableCustomPricing !== true) {
    return { ok: true }
  }

  if (modelType === 'llm') {
    const inputVal = parseFloat(form.priceInput || '')
    const outputVal = parseFloat(form.priceOutput || '')
    if (!Number.isFinite(inputVal) || inputVal < 0 || !Number.isFinite(outputVal) || outputVal < 0) {
      return { ok: false, reason: 'invalid' }
    }
    return {
      ok: true,
      customPricing: {
        llm: {
          inputPerMillion: inputVal,
          outputPerMillion: outputVal,
        },
      },
    }
  }

  if (modelType === 'image' || modelType === 'video') {
    const basePriceRaw = parseFloat(form.basePrice || '')
    const hasBasePrice = Number.isFinite(basePriceRaw) && basePriceRaw >= 0
    if (form.basePrice && !hasBasePrice) {
      return { ok: false, reason: 'invalid' }
    }

    let optionPrices: Record<string, Record<string, number>> | undefined
    if (form.optionPricesJson && form.optionPricesJson.trim().length > 0) {
      try {
        const parsed = JSON.parse(form.optionPricesJson) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('invalid option prices object')
        }
        optionPrices = {}
        for (const [field, rawOptionMap] of Object.entries(parsed as Record<string, unknown>)) {
          if (!rawOptionMap || typeof rawOptionMap !== 'object' || Array.isArray(rawOptionMap)) continue
          const normalizedOptions: Record<string, number> = {}
          for (const [optionKey, rawAmount] of Object.entries(rawOptionMap as Record<string, unknown>)) {
            if (typeof rawAmount !== 'number' || !Number.isFinite(rawAmount) || rawAmount < 0) {
              throw new Error('invalid option price amount')
            }
            normalizedOptions[optionKey] = rawAmount
          }
          if (Object.keys(normalizedOptions).length > 0) {
            optionPrices[field] = normalizedOptions
          }
        }
        if (Object.keys(optionPrices).length === 0) {
          optionPrices = undefined
        }
      } catch {
        return { ok: false, reason: 'invalid' }
      }
    }

    if (!hasBasePrice && !optionPrices) {
      return { ok: false, reason: 'invalid' }
    }

    return {
      ok: true,
      customPricing: modelType === 'image'
        ? {
          image: {
            ...(hasBasePrice ? { basePrice: basePriceRaw } : {}),
            ...(optionPrices ? { optionPrices } : {}),
          },
        }
        : {
          video: {
            ...(hasBasePrice ? { basePrice: basePriceRaw } : {}),
            ...(optionPrices ? { optionPrices } : {}),
          },
        },
    }
  }

  return { ok: true }
}

function toProviderCardModelType(type: CustomModel['type']): ProviderCardModelType | null {
  if (type === 'llm' || type === 'image' || type === 'video' || type === 'audio') return type
  if (type === 'lipsync') return 'audio'
  return null
}

export interface UseProviderCardStateResult {
  providerKey: string
  isPresetProvider: boolean
  showBaseUrlEdit: boolean
  tutorial: ReturnType<typeof getProviderTutorial>
  groupedModels: ProviderCardGroupedModels
  hasModels: boolean
  isEditing: boolean
  isEditingUrl: boolean
  showKey: boolean
  tempKey: string
  tempUrl: string
  showTutorial: boolean
  showAddForm: ProviderCardModelType | null
  newModel: ModelFormState
  batchMode: boolean
  editingModelId: string | null
  editModel: ModelFormState
  maskedKey: string
  isPresetModel: (modelKey: string) => boolean
  isDefaultModel: (model: CustomModel) => boolean
  setShowKey: (value: boolean) => void
  setShowTutorial: (value: boolean) => void
  setShowAddForm: (value: ProviderCardModelType | null) => void
  setBatchMode: (value: boolean) => void
  setNewModel: (value: ModelFormState) => void
  setEditModel: (value: ModelFormState) => void
  setTempKey: (value: string) => void
  setTempUrl: (value: string) => void
  startEditKey: () => void
  startEditUrl: () => void
  handleSaveKey: () => void
  handleCancelEdit: () => void
  handleSaveUrl: () => void
  handleCancelUrlEdit: () => void
  handleEditModel: (model: CustomModel) => void
  handleCancelEditModel: () => void
  handleSaveModel: (originalModelKey: string) => Promise<void>
  handleAddModel: (type: ProviderCardModelType) => Promise<void>
  handleCancelAdd: () => void
  needsCustomPricing: boolean
  keyTestStatus: KeyTestStatus
  keyTestSteps: KeyTestStep[]
  handleForceSaveKey: () => void
  handleTestOnly: () => void
  handleDismissTest: () => void
  lmStudioModels: LmStudioNativeModel[]
  lmStudioStatus: LmStudioStatus
  lmStudioMessage: string | null
  lmStudioBusyKey: string | null
  lmStudioRuntime: LmStudioRuntimeStats | null
  refreshLmStudioModels: () => Promise<void>
  isLmStudioModelEnabled: (modelKey: string) => boolean
  isLmStudioModelDefault: (modelKey: string) => boolean
  handleUseLmStudioForAnalysis: (modelKey: string) => Promise<void>
  handleEnableLocalBridge: (target: 'audio' | 'voiceDesign') => Promise<void>
  handleLoadLmStudioModel: (modelKey: string) => Promise<void>
  handleUnloadLmStudioModel: (instanceId: string) => Promise<void>
  isModelSavePending: boolean
  assistantEnabled: boolean
  isAssistantOpen: boolean
  assistantSavedEvent: AssistantSavedEvent | null
  assistantChat: UseAssistantChatResult
  openAssistant: () => void
  closeAssistant: () => void
  handleAssistantSend: (content?: string) => Promise<void>
}

export function getAssistantSavedModelLabel(event: AssistantSavedEvent): string {
  const draftName = event.draftModel?.name?.trim()
  if (draftName) return draftName
  const tail = event.savedModelKey.split('::').pop()
  const modelId = typeof tail === 'string' ? tail.trim() : ''
  return modelId || event.savedModelKey
}

export function useProviderCardState({
  provider,
  models,
  allModels,
  defaultModels,
  onUpdateApiKey,
  onUpdateBaseUrl,
  onUpdateModel,
  onUpdateDefaultModel,
  onAddModel,
  onFlushConfig,
  t,
}: UseProviderCardStateParams): UseProviderCardStateResult {
  const [isEditing, setIsEditing] = useState(false)
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [tempKey, setTempKey] = useState(provider.apiKey || '')
  const [tempUrl, setTempUrl] = useState(provider.baseUrl || '')
  const [showTutorial, setShowTutorial] = useState(false)
  const [showAddForm, setShowAddForm] = useState<ProviderCardModelType | null>(null)
  const [newModel, setNewModel] = useState<ModelFormState>(EMPTY_MODEL_FORM)
  const [batchMode, setBatchMode] = useState(false)
  const [editingModelId, setEditingModelId] = useState<string | null>(null)
  const [editModel, setEditModel] = useState<ModelFormState>(EMPTY_MODEL_FORM)
  const [keyTestStatus, setKeyTestStatus] = useState<KeyTestStatus>('idle')
  const [keyTestSteps, setKeyTestSteps] = useState<KeyTestStep[]>([])
  const [lmStudioModels, setLmStudioModels] = useState<LmStudioNativeModel[]>([])
  const [lmStudioStatus, setLmStudioStatus] = useState<LmStudioStatus>('idle')
  const [lmStudioMessage, setLmStudioMessage] = useState<string | null>(null)
  const [lmStudioBusyKey, setLmStudioBusyKey] = useState<string | null>(null)
  const [lmStudioRuntime, setLmStudioRuntime] = useState<LmStudioRuntimeStats | null>(null)
  const [isModelSavePending, setIsModelSavePending] = useState(false)
  const [isAssistantOpen, setIsAssistantOpen] = useState(false)
  const [assistantSavedEvent, setAssistantSavedEvent] = useState<AssistantSavedEvent | null>(null)

  const providerKey = getProviderKey(provider.id)
  const isLmStudioProvider = providerKey === 'lmstudio'
  const assistantEnabled = providerKey === 'openai-compatible'
  const isPresetProvider = PRESET_PROVIDERS.some(
    (presetProvider) => presetProvider.id === provider.id,
  )
  const showBaseUrlEdit =
    ['gemini-compatible', 'openai-compatible', 'lmstudio', 'local'].includes(providerKey) &&
    Boolean(onUpdateBaseUrl)
  const tutorial = getProviderTutorial(provider.id)

  const groupedModels: ProviderCardGroupedModels = {}
  for (const model of models) {
    const groupedType = toProviderCardModelType(model.type)
    if (!groupedType) continue
    if (!groupedModels[groupedType]) {
      groupedModels[groupedType] = []
    }
    groupedModels[groupedType]!.push(model)
  }

  const hasModels = Object.keys(groupedModels).length > 0
  const isPresetModel = (modelKey: string) =>
    PRESET_MODELS.some((model) => encodeModelKey(model.provider, model.modelId) === modelKey)

  const isDefaultModel = (model: CustomModel) => {
    if (model.type === 'llm' && matchesModelKey(defaultModels.analysisModel, model.provider, model.modelId)) {
      return true
    }

    if (model.type === 'image') {
      if (matchesModelKey(defaultModels.characterModel, model.provider, model.modelId)) return true
      if (matchesModelKey(defaultModels.locationModel, model.provider, model.modelId)) return true
      if (matchesModelKey(defaultModels.storyboardModel, model.provider, model.modelId)) return true
      if (matchesModelKey(defaultModels.editModel, model.provider, model.modelId)) return true
    }

    if (model.type === 'video' && matchesModelKey(defaultModels.videoModel, model.provider, model.modelId)) {
      return true
    }

    if (model.type === 'audio' && matchesModelKey(defaultModels.audioModel, model.provider, model.modelId)) {
      return true
    }

    if (model.type === 'lipsync' && matchesModelKey(defaultModels.lipSyncModel, model.provider, model.modelId)) {
      return true
    }

    return false
  }

  const startEditKey = () => {
    setTempKey(provider.apiKey || '')
    setIsEditing(true)
  }

  const startEditUrl = () => {
    setTempUrl(provider.baseUrl || '')
    setIsEditingUrl(true)
  }

  const doSaveKey = useCallback(() => {
    onUpdateApiKey(provider.id, tempKey)
    setIsEditing(false)
    setKeyTestStatus('idle')
    setKeyTestSteps([])
  }, [onUpdateApiKey, provider.id, tempKey])

  const handleSaveKey = useCallback(async () => {
    if (!VERIFIABLE_PROVIDER_KEYS.has(providerKey)) {
      doSaveKey()
      return
    }

    setKeyTestStatus('testing')
    setKeyTestSteps([])

    try {
      const fallbackLlmModel = pickConfiguredLlmModel({
        models,
        defaultAnalysisModel: defaultModels.analysisModel,
      })
      const payload = buildProviderConnectionPayload({
        providerKey,
        apiKey: tempKey,
        baseUrl: provider.baseUrl,
        llmModel: fallbackLlmModel,
      })
      const res = await apiFetch('/api/user/api-config/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      const steps: KeyTestStep[] = data.steps || []
      setKeyTestSteps(steps)

      if (data.success) {
        setKeyTestStatus('passed')
        // Show success for 1.5s before saving
        setTimeout(() => doSaveKey(), 1500)
      } else {
        setKeyTestStatus('failed')
      }
    } catch {
      setKeyTestSteps([{ name: 'models', status: 'fail', message: 'Network error' }])
      setKeyTestStatus('failed')
    }
  }, [defaultModels.analysisModel, doSaveKey, models, provider.baseUrl, providerKey, tempKey])

  const handleForceSaveKey = useCallback(() => {
    doSaveKey()
  }, [doSaveKey])

  // 纯测试：不保存，结果持久展示直到用户手动关闭
  const handleTestOnly = useCallback(async () => {
    setKeyTestStatus('testing')
    setKeyTestSteps([])
    try {
      const fallbackLlmModel = pickConfiguredLlmModel({
        models,
        defaultAnalysisModel: defaultModels.analysisModel,
      })
      const payload = buildProviderConnectionPayload({
        providerKey,
        apiKey: provider.apiKey || '',
        baseUrl: provider.baseUrl,
        llmModel: fallbackLlmModel,
      })
      const res = await apiFetch('/api/user/api-config/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      setKeyTestSteps(data.steps || [])
      setKeyTestStatus(data.success ? 'passed' : 'failed')
    } catch {
      setKeyTestSteps([{ name: 'models', status: 'fail', message: 'Network error' }])
      setKeyTestStatus('failed')
    }
  }, [defaultModels.analysisModel, models, provider.apiKey, provider.baseUrl, providerKey])

  const handleDismissTest = useCallback(() => {
    setKeyTestStatus('idle')
    setKeyTestSteps([])
  }, [])

  const handleCancelEdit = () => {
    setTempKey(provider.apiKey || '')
    setIsEditing(false)
    setKeyTestStatus('idle')
    setKeyTestSteps([])
  }

  const handleSaveUrl = () => {
    onUpdateBaseUrl?.(provider.id, tempUrl)
    setIsEditingUrl(false)
  }

  const handleCancelUrlEdit = () => {
    setTempUrl(provider.baseUrl || '')
    setIsEditingUrl(false)
  }

  const handleEditModel = (model: CustomModel) => {
    setEditingModelId(model.modelKey)
    setEditModel({
      name: model.name,
      modelId: model.modelId,
    })
  }

  const handleCancelEditModel = () => {
    setEditingModelId(null)
    setEditModel(EMPTY_MODEL_FORM)
  }

  const resolveProbeFailureMessage = (error: unknown): string => {
    const code = error instanceof Error ? error.message : ''
    if (code === 'PROBE_AUTH_FAILED') return t('probeAuthFailed')
    if (code === 'PROBE_INCONCLUSIVE') return t('probeInconclusive')
    if (code === 'MODEL_LLM_PROTOCOL_PROBE_REQUEST_FAILED') return t('probeRequestFailed')
    return t('probeLlmProtocolFailed')
  }

  const flushConfigBeforeProbe = useCallback(async (): Promise<boolean> => {
    if (!onFlushConfig) return true
    try {
      await onFlushConfig()
      return true
    } catch {
      alert(t('flushConfigFailed'))
      return false
    }
  }, [onFlushConfig, t])

  const handleSaveModel = async (originalModelKey: string): Promise<void> => {
    if (isModelSavePending) return
    if (!editModel.name || !editModel.modelId) {
      alert(t('fillComplete'))
      return
    }

    const nextModelKey = encodeModelKey(provider.id, editModel.modelId)
    const all = allModels || models
    const duplicate = all.some(
      (model) =>
        model.modelKey === nextModelKey &&
        model.modelKey !== originalModelKey,
    )

    if (duplicate) {
      alert(t('modelIdExists'))
      return
    }

    setIsModelSavePending(true)
    try {
      const originalModel = all.find((model) => model.modelKey === originalModelKey)
      let protocolUpdates: Pick<CustomModel, 'llmProtocol' | 'llmProtocolCheckedAt'> | null = null
      if (originalModel && shouldReprobeModelLlmProtocol({
        providerId: provider.id,
        originalModel,
        nextModelId: editModel.modelId,
      })) {
        const flushed = await flushConfigBeforeProbe()
        if (!flushed) return

        try {
          protocolUpdates = await probeModelLlmProtocolViaApi({
            providerId: provider.id,
            modelId: editModel.modelId,
          })
        } catch (error) {
          alert(resolveProbeFailureMessage(error))
          return
        }
      }

      onUpdateModel?.(originalModelKey, {
        name: editModel.name,
        modelId: editModel.modelId,
        ...(protocolUpdates ? protocolUpdates : {}),
      })

      handleCancelEditModel()
    } finally {
      setIsModelSavePending(false)
    }
  }

  const handleAddModel = async (type: ProviderCardModelType): Promise<void> => {
    if (isModelSavePending) return
    if (!newModel.name || !newModel.modelId) {
      alert(t('fillComplete'))
      return
    }

    const finalModelId =
      type === 'video' && batchMode && provider.id === 'ark'
        ? `${newModel.modelId}-batch`
        : newModel.modelId
    const finalModelKey = encodeModelKey(provider.id, finalModelId)

    const all = allModels || models
    if (all.some((model) => model.modelKey === finalModelKey)) {
      alert(t('modelIdExists'))
      return
    }

    const finalName =
      type === 'video' && batchMode && provider.id === 'ark'
        ? `${newModel.name} (Batch)`
        : newModel.name

    setIsModelSavePending(true)
    try {
      let protocolFields: Pick<CustomModel, 'llmProtocol' | 'llmProtocolCheckedAt'> | null = null
      if (shouldProbeModelLlmProtocol({ providerId: provider.id, modelType: type })) {
        const flushed = await flushConfigBeforeProbe()
        if (!flushed) return

        try {
          protocolFields = await probeModelLlmProtocolViaApi({
            providerId: provider.id,
            modelId: finalModelId,
          })
        } catch (error) {
          alert(resolveProbeFailureMessage(error))
          return
        }
      }

      onAddModel({
        modelId: finalModelId,
        modelKey: finalModelKey,
        name: finalName,
        type,
        provider: provider.id,
        price: 0,
        ...(protocolFields ? protocolFields : {}),
      })

      setNewModel(EMPTY_MODEL_FORM)
      setBatchMode(false)
      setShowAddForm(null)
    } finally {
      setIsModelSavePending(false)
    }
  }

  const handleCancelAdd = () => {
    setShowAddForm(null)
    setNewModel(EMPTY_MODEL_FORM)
    setBatchMode(false)
  }

  const ensureConfiguredModelEnabled = useCallback(async (input: {
    providerId: string
    modelId: string
    name: string
    type: CustomModel['type']
    defaultField?: 'analysisModel' | 'audioModel' | 'voiceDesignModel'
    llmProtocol?: 'responses' | 'chat-completions'
  }) => {
    const modelKey = encodeModelKey(input.providerId, input.modelId)
    const currentModels = allModels || models
    const existing = currentModels.find((model) => model.modelKey === modelKey)

    if (existing) {
      onUpdateModel?.(modelKey, {
        name: input.name,
        enabled: true,
        ...(input.type === 'llm' && input.llmProtocol
          ? {
            llmProtocol: existing.llmProtocol || input.llmProtocol,
            llmProtocolCheckedAt: existing.llmProtocolCheckedAt || new Date().toISOString(),
          }
          : {}),
      })
    } else {
      onAddModel({
        modelId: input.modelId,
        modelKey,
        name: input.name,
        type: input.type,
        provider: input.providerId,
        price: 0,
        ...(input.type === 'llm' && input.llmProtocol
          ? {
            llmProtocol: input.llmProtocol,
            llmProtocolCheckedAt: new Date().toISOString(),
          }
          : {}),
      })
    }

    if (input.defaultField) {
      onUpdateDefaultModel?.(input.defaultField, modelKey)
    }

    return modelKey
  }, [allModels, models, onAddModel, onUpdateDefaultModel, onUpdateModel])

  const isLmStudioModelEnabled = useCallback((modelId: string) => {
    const modelKey = encodeModelKey(provider.id, modelId)
    const currentModels = allModels || models
    return currentModels.some((model) => model.modelKey === modelKey && model.enabled)
  }, [allModels, models, provider.id])

  const isLmStudioModelDefault = useCallback((modelId: string) => {
    const modelKey = encodeModelKey(provider.id, modelId)
    return defaultModels.analysisModel === modelKey
  }, [defaultModels.analysisModel, provider.id])

  const handleUseLmStudioForAnalysis = useCallback(async (modelId: string) => {
    const matched = lmStudioModels.find((model) => model.key === modelId)
    await ensureConfiguredModelEnabled({
      providerId: provider.id,
      modelId,
      name: matched?.displayName || modelId,
      type: 'llm',
      defaultField: 'analysisModel',
      llmProtocol: 'chat-completions',
    })
    setLmStudioMessage(t('lmStudioBindSuccess', { model: matched?.displayName || modelId }))
  }, [ensureConfiguredModelEnabled, lmStudioModels, provider.id, t])

  const handleEnableLocalBridge = useCallback(async (target: 'audio' | 'voiceDesign') => {
    const isVoiceDesign = target === 'voiceDesign'
    await ensureConfiguredModelEnabled({
      providerId: 'local',
      modelId: isVoiceDesign ? 'local-indextts-voice-design' : 'local-indextts-speech',
      name: isVoiceDesign ? 'Local Voice Design Bridge' : 'Local IndexTTS Bridge',
      type: 'audio',
      defaultField: isVoiceDesign ? 'voiceDesignModel' : 'audioModel',
    })
    setLmStudioMessage(t(isVoiceDesign ? 'lmStudioLocalVoiceDesignEnabled' : 'lmStudioLocalTtsEnabled'))
  }, [ensureConfiguredModelEnabled, t])

  const upsertModelFromAssistantDraft = useCallback((draft: AssistantDraftModel) => {
    const modelKey = encodeModelKey(draft.provider, draft.modelId)
    const checkedAt = new Date().toISOString()
    const currentModels = allModels || models
    const existed = currentModels.find((item) => item.modelKey === modelKey)
    if (existed) {
      onUpdateModel?.(modelKey, {
        name: draft.name,
        modelId: draft.modelId,
        provider: draft.provider,
        compatMediaTemplate: draft.compatMediaTemplate,
        compatMediaTemplateCheckedAt: checkedAt,
        compatMediaTemplateSource: 'ai',
      })
      return
    }
    onAddModel({
      modelId: draft.modelId,
      modelKey,
      name: draft.name,
      type: draft.type,
      provider: draft.provider,
      price: 0,
      compatMediaTemplate: draft.compatMediaTemplate,
      compatMediaTemplateCheckedAt: checkedAt,
      compatMediaTemplateSource: 'ai',
    })
  }, [allModels, models, onAddModel, onUpdateModel])

  const assistantChat = useAssistantChat({
    assistantId: 'api-config-template',
    context: { providerId: provider.id },
    enabled: assistantEnabled,
    onSaved: (event) => {
      setAssistantSavedEvent(event)
      if (event.draftModel) {
        upsertModelFromAssistantDraft(event.draftModel)
        return
      }
      onUpdateModel?.(event.savedModelKey, {
        compatMediaTemplateSource: 'ai',
      })
    },
  })

  const openAssistant = useCallback(() => {
    if (!assistantEnabled) return
    setAssistantSavedEvent(null)
    setIsAssistantOpen(true)
  }, [assistantEnabled])

  const closeAssistant = useCallback(() => {
    setIsAssistantOpen(false)
    setAssistantSavedEvent(null)
    assistantChat.clear()
  }, [assistantChat])

  const handleAssistantSend = useCallback(async (content?: string): Promise<void> => {
    if (!assistantEnabled || assistantChat.pending || assistantSavedEvent !== null) return
    const flushed = await flushConfigBeforeProbe()
    if (!flushed) return
    await assistantChat.send(content)
  }, [
    assistantEnabled,
    assistantChat,
    assistantSavedEvent,
    flushConfigBeforeProbe,
  ])

  const callLmStudioNativeApi = useCallback(async (payload: Record<string, unknown>) => {
    const response = await apiFetch('/api/user/api-config/lmstudio-native', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: provider.baseUrl || '',
        apiKey: provider.apiKey || '',
        ...payload,
      }),
    })
    if (!response.ok) {
      throw new Error('LMSTUDIO_NATIVE_REQUEST_FAILED')
    }
    const data = await response.json() as {
      success?: boolean
      message?: string
      models?: LmStudioNativeModel[]
      runtime?: LmStudioRuntimeStats
    }
    if (!data.success) {
      throw new Error(typeof data.message === 'string' && data.message.trim() ? data.message : 'LMSTUDIO_NATIVE_REQUEST_FAILED')
    }
    return data
  }, [provider.apiKey, provider.baseUrl])

  const refreshLmStudioModels = useCallback(async () => {
    if (!isLmStudioProvider) return
    if (!provider.baseUrl || provider.baseUrl.trim().length === 0) {
      setLmStudioStatus('error')
      setLmStudioMessage(t('lmStudioBaseUrlRequired'))
      setLmStudioModels([])
      setLmStudioRuntime(null)
      return
    }

    setLmStudioStatus('loading')
    setLmStudioMessage(null)
    try {
      const data = await callLmStudioNativeApi({ action: 'list' }) as {
        models?: LmStudioNativeModel[]
        runtime?: LmStudioRuntimeStats
      }
      const nextModels = Array.isArray(data.models)
        ? [...data.models].sort((left, right) => Number(right.isLoaded) - Number(left.isLoaded) || left.displayName.localeCompare(right.displayName))
        : []
      setLmStudioModels(nextModels)
      setLmStudioRuntime(data.runtime ?? null)
      setLmStudioStatus('ready')
      setLmStudioMessage(nextModels.length === 0 ? t('lmStudioNoModels') : null)
    } catch (error) {
      setLmStudioStatus('error')
      setLmStudioRuntime(null)
      setLmStudioMessage(resolveLmStudioManageFailureMessage(error, t))
    }
  }, [callLmStudioNativeApi, isLmStudioProvider, provider.baseUrl, t])

  const handleLoadLmStudioModel = useCallback(async (modelKey: string) => {
    const matched = lmStudioModels.find((model) => model.key === modelKey)
    setLmStudioBusyKey(modelKey)
    setLmStudioMessage(null)
    try {
      await callLmStudioNativeApi({
        action: 'load',
        model: modelKey,
        contextLength: matched?.maxContextLength ? Math.min(matched.maxContextLength, 65536) : undefined,
        flashAttention: matched?.type === 'llm' ? true : undefined,
      })
      if (matched?.type === 'llm') {
        await ensureConfiguredModelEnabled({
          providerId: provider.id,
          modelId: modelKey,
          name: matched.displayName || modelKey,
          type: 'llm',
          defaultField: 'analysisModel',
          llmProtocol: 'chat-completions',
        })
      }
      await refreshLmStudioModels()
      setLmStudioMessage(
        matched?.type === 'llm'
          ? t('lmStudioLoadAutoEnabled', { model: matched?.displayName || modelKey })
          : t('lmStudioLoadSuccess', { model: matched?.displayName || modelKey }),
      )
    } catch (error) {
      setLmStudioMessage(resolveLmStudioManageFailureMessage(error, t))
      setLmStudioStatus('error')
    } finally {
      setLmStudioBusyKey(null)
    }
  }, [callLmStudioNativeApi, defaultModels.analysisModel, ensureConfiguredModelEnabled, lmStudioModels, provider.id, refreshLmStudioModels, t])

  const handleUnloadLmStudioModel = useCallback(async (instanceId: string) => {
    setLmStudioBusyKey(instanceId)
    setLmStudioMessage(null)
    try {
      await callLmStudioNativeApi({ action: 'unload', instanceId })
      setLmStudioMessage(t('lmStudioUnloadSuccess', { model: instanceId }))
      await refreshLmStudioModels()
    } catch (error) {
      setLmStudioMessage(resolveLmStudioManageFailureMessage(error, t))
      setLmStudioStatus('error')
    } finally {
      setLmStudioBusyKey(null)
    }
  }, [callLmStudioNativeApi, refreshLmStudioModels, t])

  useEffect(() => {
    if (!isLmStudioProvider) return
    if (!provider.baseUrl || provider.baseUrl.trim().length === 0) {
      setLmStudioModels([])
      setLmStudioRuntime(null)
      setLmStudioStatus('idle')
      setLmStudioMessage(t('lmStudioBaseUrlRequired'))
      return
    }
    void refreshLmStudioModels()
  }, [isLmStudioProvider, provider.baseUrl, refreshLmStudioModels, t])

  const maskedKey = (() => {
    const key = provider.apiKey || ''
    if (key.length <= 8) return '•'.repeat(key.length)
    return `${key.slice(0, 4)}${'•'.repeat(50)}`
  })()

  return {
    providerKey,
    isPresetProvider,
    showBaseUrlEdit,
    tutorial,
    groupedModels,
    hasModels,
    isEditing,
    isEditingUrl,
    showKey,
    tempKey,
    tempUrl,
    showTutorial,
    showAddForm,
    newModel,
    batchMode,
    editingModelId,
    editModel,
    maskedKey,
    isPresetModel,
    isDefaultModel,
    setShowKey,
    setShowTutorial,
    setShowAddForm,
    setBatchMode,
    setNewModel,
    setEditModel,
    setTempKey,
    setTempUrl,
    startEditKey,
    startEditUrl,
    handleSaveKey,
    handleCancelEdit,
    handleSaveUrl,
    handleCancelUrlEdit,
    handleEditModel,
    handleCancelEditModel,
    handleSaveModel,
    handleAddModel,
    handleCancelAdd,
    needsCustomPricing: false,
    keyTestStatus,
    keyTestSteps,
    handleForceSaveKey,
    handleTestOnly,
    handleDismissTest,
    lmStudioModels,
    lmStudioStatus,
    lmStudioMessage,
    lmStudioBusyKey,
    lmStudioRuntime,
    refreshLmStudioModels,
    isLmStudioModelEnabled,
    isLmStudioModelDefault,
    handleUseLmStudioForAnalysis,
    handleEnableLocalBridge,
    handleLoadLmStudioModel,
    handleUnloadLmStudioModel,
    isModelSavePending,
    assistantEnabled,
    isAssistantOpen,
    assistantSavedEvent,
    assistantChat,
    openAssistant,
    closeAssistant,
    handleAssistantSend,
  }
}
