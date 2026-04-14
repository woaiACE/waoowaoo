'use client'

import { useMemo, useState } from 'react'
import { encodeModelKey } from '../types'
import type { ProviderCardProps, ProviderCardTranslator } from './types'
import type { UseProviderCardStateResult } from './hooks/useProviderCardState'
import { AppIcon } from '@/components/ui/icons'
import { SegmentedControl } from '@/components/ui/SegmentedControl'

function formatByteSize(bytes?: number): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[unitIndex]}`
}

function formatMemoryInMb(memoryMb?: number, estimated = false): string | null {
  if (typeof memoryMb !== 'number' || !Number.isFinite(memoryMb) || memoryMb <= 0) return null
  const gbValue = memoryMb / 1024
  const formatted = gbValue >= 1 ? `${gbValue.toFixed(gbValue >= 10 ? 0 : 1)} GB` : `${Math.round(memoryMb)} MB`
  return estimated ? `≈ ${formatted}` : formatted
}

interface ProviderBaseFieldsProps {
  provider: ProviderCardProps['provider']
  t: ProviderCardTranslator
  state: UseProviderCardStateResult
}

type LmStudioTab = 'llm' | 'embedding' | 'audio'

export function ProviderBaseFields({ provider, t, state }: ProviderBaseFieldsProps) {
  const baseUrlPlaceholder = (() => {
    switch (state.providerKey) {
      case 'gemini-compatible':
        return 'https://your-api-domain.com'
      case 'openai-compatible':
        return 'https://api.openai.com/v1'
      case 'lmstudio':
        return 'http://127.0.0.1:5000/v1'
      case 'local':
        return 'http://127.0.0.1:7861'
      default:
        return 'http://localhost:8000'
    }
  })()

  const [activeLmStudioTab, setActiveLmStudioTab] = useState<LmStudioTab>('llm')
  const lmStudioLlmModels = useMemo(
    () => state.lmStudioModels.filter((model) => model.type === 'llm'),
    [state.lmStudioModels],
  )
  const lmStudioEmbeddingModels = useMemo(
    () => state.lmStudioModels.filter((model) => model.type === 'embedding'),
    [state.lmStudioModels],
  )
  const localTtsModelKey = encodeModelKey('local', 'local-indextts-speech')
  const localVoiceDesignModelKey = encodeModelKey('local', 'local-indextts-voice-design')
  const localAudioModels = state.groupedModels.audio ?? []
  const localTtsModel = localAudioModels.find((model) => model.modelKey === localTtsModelKey)
  const localVoiceDesignModel = localAudioModels.find((model) => model.modelKey === localVoiceDesignModelKey)
  const localTtsInUse = localTtsModel ? state.isDefaultModel(localTtsModel) : false
  const localVoiceDesignInUse = localVoiceDesignModel ? state.isDefaultModel(localVoiceDesignModel) : false

  return (
    <>
      <div className="px-3.5 pt-2.5">
        <div className="glass-surface-soft flex items-center gap-2.5 rounded-xl px-3 py-2">
          <span className="w-[64px] shrink-0 whitespace-nowrap text-[12px] font-semibold text-[var(--glass-text-primary)]">
            {t('apiKeyLabel')}
          </span>
          {state.isEditing ? (
            <div className="flex flex-1 items-center gap-2">
              <input
                type="text"
                value={state.tempKey}
                onChange={(event) => state.setTempKey(event.target.value)}
                placeholder={t('enterApiKey')}
                className="glass-input-base flex-1 px-3 py-1.5 text-[12px]"
                disabled={state.keyTestStatus === 'testing'}
                autoFocus
              />
              <button
                onClick={state.handleSaveKey}
                disabled={state.keyTestStatus === 'testing'}
                className="glass-icon-btn-sm disabled:opacity-50"
                title={state.keyTestStatus === 'failed' ? t('testRetry') : t('save')}
              >
                {state.keyTestStatus === 'testing' ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <AppIcon name="check" className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={state.handleCancelEdit}
                disabled={state.keyTestStatus === 'testing'}
                className="glass-icon-btn-sm disabled:opacity-50"
                title={t('cancel')}
              >
                <AppIcon name="close" className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {provider.hasApiKey ? (
                <>
                  <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap rounded-lg bg-[var(--glass-bg-surface)] px-3 py-1.5 font-mono text-[12px] text-[var(--glass-text-secondary)]">
                    {state.showKey ? provider.apiKey : state.maskedKey}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => state.setShowKey(!state.showKey)}
                      className="glass-icon-btn-sm"
                      title={state.showKey ? t('hide') : t('show')}
                    >
                      {state.showKey ? (
                        <AppIcon name="eye" className="h-4 w-4" />
                      ) : (
                        <AppIcon name="eyeOff" className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={state.startEditKey}
                      className="glass-icon-btn-sm"
                      title={t('configure')}
                    >
                      <AppIcon name="edit" className="h-4 w-4" />
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={state.startEditKey}
                  className="glass-btn-base glass-btn-tone-info h-7 px-2.5 text-[12px] font-semibold"
                >
                  <AppIcon name="plus" className="h-3.5 w-3.5" />
                  <span>{t('connect')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {state.keyTestStatus !== 'idle' && (
        <div className="px-3.5 pt-2">
          <div className={`space-y-2 rounded-xl border-2 p-3 ${state.keyTestStatus === 'passed'
            ? 'border-green-500/40 bg-green-500/5'
            : state.keyTestStatus === 'failed'
              ? 'border-red-500/40 bg-red-500/5'
              : 'border-[var(--glass-border)] bg-[var(--glass-bg-surface)]'
            }`}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--glass-text-primary)]">
                {state.keyTestStatus === 'testing' && (
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                {state.keyTestStatus === 'passed' && (
                  <span className="text-green-500">
                    <AppIcon name="check" className="h-4 w-4" />
                  </span>
                )}
                {state.keyTestStatus === 'failed' && (
                  <span className="text-red-500">
                    <AppIcon name="close" className="h-4 w-4" />
                  </span>
                )}
                {t('testConnection')}
              </div>
              {(state.keyTestStatus === 'passed' || state.keyTestStatus === 'failed') && (
                <div className="flex items-center gap-1">
                  {/* 重新测试 */}
                  <button
                    onClick={state.handleTestOnly}
                    className="rounded p-1 text-[var(--glass-text-tertiary)] hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-text-primary)] transition-colors"
                    title={t('testRetry')}
                  >
                    <AppIcon name="refresh" className="h-3 w-3" />
                  </button>
                  {/* 关闭结果 */}
                  <button
                    onClick={state.handleDismissTest}
                    className="rounded p-1 text-[var(--glass-text-tertiary)] hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-text-primary)] transition-colors"
                    title={t('close')}
                  >
                    <AppIcon name="close" className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Testing spinner when no steps yet */}
            {state.keyTestStatus === 'testing' && state.keyTestSteps.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-[var(--glass-text-secondary)]">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t('testing')}
              </div>
            )}

            {/* Step results */}
            {state.keyTestSteps.map((step) => {
              const stepLabel = t(`testStep.${step.name}`)
              return (
                <div key={step.name} className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs">
                    {step.status === 'pass' && (
                      <span className="text-green-500">
                        <AppIcon name="check" className="h-3.5 w-3.5" />
                      </span>
                    )}
                    {step.status === 'fail' && (
                      <span className="text-red-500">
                        <AppIcon name="close" className="h-3.5 w-3.5" />
                      </span>
                    )}
                    {step.status === 'skip' && (
                      <span className="text-[var(--glass-text-tertiary)]">–</span>
                    )}
                    <span className="font-medium text-[var(--glass-text-primary)]">
                      {stepLabel}
                    </span>
                    {step.model && (
                      <span className="rounded bg-[var(--glass-bg-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--glass-text-secondary)]">
                        {step.model}
                      </span>
                    )}
                  </div>
                  <p className={`pl-6 text-[11px] ${step.status === 'fail' ? 'text-red-400' : 'text-[var(--glass-text-secondary)]'}`}>
                    {step.message}
                  </p>
                  {step.detail && (
                    <p className="pl-6 text-[10px] text-[var(--glass-text-tertiary)] break-all line-clamp-3">
                      {step.detail}
                    </p>
                  )}
                </div>
              )
            })}

            {/* Success banner */}
            {state.keyTestStatus === 'passed' && (
              <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 text-xs font-medium text-green-600 dark:text-green-400">
                <AppIcon name="check" className="h-4 w-4 shrink-0" />
                {t('testPassed')}
              </div>
            )}

            {/* Failure warning */}
            {state.keyTestStatus === 'failed' && (
              <div className="flex items-start gap-2 rounded-lg bg-yellow-500/10 px-3 py-2 text-[11px] text-[var(--glass-text-primary)]">
                <span className="mt-0.5 shrink-0 text-sm">&#9888;</span>
                <span>{t('testWarning')}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {state.showBaseUrlEdit && (
        <div className="px-3.5 pb-2.5 pt-2">
          <div className="glass-surface-soft flex items-center gap-2.5 rounded-xl px-3 py-2">
            <span className="w-[64px] shrink-0 whitespace-nowrap text-[12px] font-semibold text-[var(--glass-text-tertiary)]">
              {t('baseUrl')}
            </span>
            {state.isEditingUrl ? (
              <div className="flex flex-1 items-center gap-2">
                <input
                  type="text"
                  value={state.tempUrl}
                  onChange={(event) => state.setTempUrl(event.target.value)}
                  placeholder={baseUrlPlaceholder}
                  className="glass-input-base flex-1 px-3 py-1.5 text-[12px] font-mono"
                  autoFocus
                />
                <button
                  onClick={state.handleSaveUrl}
                  className="glass-icon-btn-sm"
                  title={t('save')}
                >
                  <AppIcon name="check" className="h-4 w-4" />
                </button>
                <button
                  onClick={state.handleCancelUrlEdit}
                  className="glass-icon-btn-sm"
                  title={t('cancel')}
                >
                  <AppIcon name="close" className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {provider.baseUrl ? (
                  <>
                    <span className="min-w-0 flex-1 truncate rounded-lg bg-[var(--glass-bg-surface)] px-3 py-1.5 font-mono text-[12px] text-[var(--glass-text-secondary)]">
                      {provider.baseUrl}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={state.startEditUrl}
                        className="glass-icon-btn-sm"
                        title={t('configure')}
                      >
                        <AppIcon name="edit" className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={state.startEditUrl}
                    className="glass-btn-base glass-btn-tone-info h-7 px-2.5 text-[12px] font-semibold"
                  >
                    <AppIcon name="plus" className="h-3.5 w-3.5" />
                    <span>{t('configureBaseUrl')}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {state.providerKey === 'lmstudio' && (
        <div className="px-3.5 pb-2.5">
          <div className="glass-surface-soft space-y-3 rounded-xl px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[12px] font-semibold text-[var(--glass-text-primary)]">
                  {t('lmStudioNativeTitle')}
                </div>
                <div className="text-[11px] text-[var(--glass-text-secondary)]">
                  {t('lmStudioNativeDesc')}
                </div>
              </div>
              <button
                onClick={() => void state.refreshLmStudioModels()}
                disabled={state.lmStudioStatus === 'loading'}
                className="glass-btn-base glass-btn-secondary h-7 px-2.5 text-[12px] disabled:opacity-50"
              >
                <AppIcon name="refresh" className="h-3.5 w-3.5" />
                <span>{state.lmStudioStatus === 'loading' ? t('testing') : t('lmStudioRefresh')}</span>
              </button>
            </div>

            {state.lmStudioMessage && (
              <div className="rounded-lg bg-[var(--glass-bg-surface)] px-3 py-2 text-[11px] text-[var(--glass-text-secondary)]">
                {state.lmStudioMessage}
              </div>
            )}

            {state.lmStudioRuntime && (
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg bg-[var(--glass-bg-surface)] px-3 py-2 text-[11px] text-[var(--glass-text-secondary)]">
                  <div className="text-[10px] text-[var(--glass-text-tertiary)]">{t('lmStudioLoadedCountLabel')}</div>
                  <div className="mt-0.5 font-semibold text-[var(--glass-text-primary)]">{state.lmStudioRuntime.loadedModelCount}</div>
                </div>
                <div className="rounded-lg bg-[var(--glass-bg-surface)] px-3 py-2 text-[11px] text-[var(--glass-text-secondary)]">
                  <div className="text-[10px] text-[var(--glass-text-tertiary)]">{t('lmStudioLoadedFootprintLabel')}</div>
                  <div className="mt-0.5 font-semibold text-[var(--glass-text-primary)]">{formatByteSize(state.lmStudioRuntime.loadedModelSizeBytes) || '—'}</div>
                </div>
                <div className="rounded-lg bg-[var(--glass-bg-surface)] px-3 py-2 text-[11px] text-[var(--glass-text-secondary)]">
                  <div className="text-[10px] text-[var(--glass-text-tertiary)]">{t('lmStudioGpuUsageLabel')}</div>
                  <div className="mt-0.5 font-semibold text-[var(--glass-text-primary)]">
                    {formatMemoryInMb(
                      state.lmStudioRuntime.gpuMemoryUsedMb,
                      state.lmStudioRuntime.telemetrySource === 'estimate',
                    ) || t('lmStudioGpuUsageUnavailable')}
                  </div>
                </div>
              </div>
            )}

            <SegmentedControl
              options={[
                {
                  value: 'llm',
                  label: <><AppIcon name="menu" className="h-3 w-3" /><span>{t('lmStudioTabText')}</span><span className="rounded-full bg-[var(--glass-tone-neutral-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--glass-tone-neutral-fg)]">{lmStudioLlmModels.length}</span></>,
                },
                {
                  value: 'embedding',
                  label: <><AppIcon name="search" className="h-3 w-3" /><span>{t('lmStudioTabEmbedding')}</span><span className="rounded-full bg-[var(--glass-tone-neutral-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--glass-tone-neutral-fg)]">{lmStudioEmbeddingModels.length}</span></>,
                },
                {
                  value: 'audio',
                  label: <><AppIcon name="audioWave" className="h-3 w-3" /><span>{t('lmStudioTabAudio')}</span><span className="rounded-full bg-[var(--glass-tone-neutral-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--glass-tone-neutral-fg)]">2</span></>,
                },
              ]}
              value={activeLmStudioTab}
              onChange={(value) => setActiveLmStudioTab(value as LmStudioTab)}
            />

            <div className="rounded-xl bg-[var(--glass-bg-surface)] p-2">
              {activeLmStudioTab === 'llm' && (
                <div className="space-y-2">
                  {lmStudioLlmModels.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[var(--glass-stroke-base)] px-3 py-3 text-[11px] text-[var(--glass-text-tertiary)]">
                      {state.lmStudioStatus === 'loading' ? t('lmStudioLoading') : t('lmStudioNoItemsInTab')}
                    </div>
                  ) : lmStudioLlmModels.map((model) => {
                    const instanceId = model.loadedInstanceIds[0]
                    const busy = state.lmStudioBusyKey === model.key || state.lmStudioBusyKey === instanceId
                    const synced = state.isLmStudioModelEnabled(model.key)
                    const isDefault = state.isLmStudioModelDefault(model.key)
                    return (
                      <div key={model.key} className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-base)] px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[13px] font-semibold text-[var(--glass-text-primary)]">{model.displayName}</span>
                              <span className="rounded bg-[var(--glass-bg-muted)] px-1.5 py-0.5 text-[10px] text-[var(--glass-text-secondary)]">LLM</span>
                              {model.isLoaded && <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-600 dark:text-green-400">{t('lmStudioLoaded')}</span>}
                              {synced && <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-600 dark:text-blue-400">{t('enabled')}</span>}
                            </div>
                            <div className="mt-1 text-[10px] text-[var(--glass-text-tertiary)] break-all">{model.key}</div>
                            <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-[var(--glass-text-secondary)]">
                              {(model.contextLength || model.maxContextLength) && (
                                <span>
                                  {model.contextLength
                                    ? `${t('lmStudioContextLabel')}: ${model.contextLength}`
                                    : `${t('lmStudioMaxContextLabel')}: ${model.maxContextLength}`}
                                </span>
                              )}
                              {formatByteSize(model.sizeBytes) && <span>{`${t('lmStudioModelSizeLabel')}: ${formatByteSize(model.sizeBytes)}`}</span>}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              onClick={() => void (model.isLoaded ? state.handleUseLmStudioForAnalysis(model.key) : state.handleLoadLmStudioModel(model.key))}
                              disabled={busy || isDefault}
                              className={`glass-btn-base h-8 px-3 text-[12px] ${isDefault ? 'glass-btn-soft' : 'glass-btn-primary'} disabled:opacity-50`}
                            >
                              {busy ? t('testing') : isDefault ? t('lmStudioInUse') : t('lmStudioActivate')}
                            </button>
                            {model.isLoaded && instanceId && !busy && (
                              <button
                                onClick={() => void state.handleUnloadLmStudioModel(instanceId)}
                                className="glass-btn-base glass-btn-secondary h-8 px-2.5 text-[12px]"
                              >
                                {t('lmStudioUnload')}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {activeLmStudioTab === 'embedding' && (
                <div className="space-y-2">
                  {lmStudioEmbeddingModels.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[var(--glass-stroke-base)] px-3 py-3 text-[11px] text-[var(--glass-text-tertiary)]">
                      {t('lmStudioNoItemsInTab')}
                    </div>
                  ) : lmStudioEmbeddingModels.map((model) => {
                    const instanceId = model.loadedInstanceIds[0]
                    const busy = state.lmStudioBusyKey === model.key || state.lmStudioBusyKey === instanceId
                    return (
                      <div key={model.key} className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-base)] px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[13px] font-semibold text-[var(--glass-text-primary)]">{model.displayName}</span>
                              <span className="rounded bg-[var(--glass-bg-muted)] px-1.5 py-0.5 text-[10px] text-[var(--glass-text-secondary)]">Embedding</span>
                              {model.isLoaded && <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-600 dark:text-green-400">{t('lmStudioEmbeddingReady')}</span>}
                            </div>
                            <div className="mt-1 text-[10px] text-[var(--glass-text-tertiary)] break-all">{model.key}</div>
                            <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-[var(--glass-text-secondary)]">
                              {(model.contextLength || model.maxContextLength) && (
                                <span>
                                  {model.contextLength
                                    ? `${t('lmStudioContextLabel')}: ${model.contextLength}`
                                    : `${t('lmStudioMaxContextLabel')}: ${model.maxContextLength}`}
                                </span>
                              )}
                              {formatByteSize(model.sizeBytes) && <span>{`${t('lmStudioModelSizeLabel')}: ${formatByteSize(model.sizeBytes)}`}</span>}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              onClick={() => void state.handleLoadLmStudioModel(model.key)}
                              disabled={busy || model.isLoaded}
                              className={`glass-btn-base h-8 px-3 text-[12px] ${model.isLoaded ? 'glass-btn-soft' : 'glass-btn-primary'} disabled:opacity-50`}
                            >
                              {busy ? t('testing') : model.isLoaded ? t('lmStudioInUse') : t('lmStudioActivate')}
                            </button>
                            {model.isLoaded && instanceId && !busy && (
                              <button
                                onClick={() => void state.handleUnloadLmStudioModel(instanceId)}
                                className="glass-btn-base glass-btn-secondary h-8 px-2.5 text-[12px]"
                              >
                                {t('lmStudioUnload')}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {activeLmStudioTab === 'audio' && (
                <div className="space-y-2">
                  <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-base)] px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-semibold text-[var(--glass-text-primary)]">{t('lmStudioLocalTtsTitle')}</span>
                          {localTtsInUse && <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-600 dark:text-blue-400">{t('default')}</span>}
                        </div>
                        <div className="mt-1 text-[11px] text-[var(--glass-text-secondary)]">{t('lmStudioLocalTtsDesc')}</div>
                      </div>
                      <button
                        onClick={() => void state.handleEnableLocalBridge('audio')}
                        disabled={localTtsInUse}
                        className={`glass-btn-base h-8 px-3 text-[12px] ${localTtsInUse ? 'glass-btn-soft' : 'glass-btn-primary'} disabled:opacity-50`}
                      >
                        {localTtsInUse ? t('lmStudioInUse') : t('lmStudioActivate')}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-base)] px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-semibold text-[var(--glass-text-primary)]">{t('lmStudioLocalVoiceDesignTitle')}</span>
                          {localVoiceDesignInUse && <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-600 dark:text-blue-400">{t('default')}</span>}
                        </div>
                        <div className="mt-1 text-[11px] text-[var(--glass-text-secondary)]">{t('lmStudioLocalVoiceDesignDesc')}</div>
                      </div>
                      <button
                        onClick={() => void state.handleEnableLocalBridge('voiceDesign')}
                        disabled={localVoiceDesignInUse}
                        className={`glass-btn-base h-8 px-3 text-[12px] ${localVoiceDesignInUse ? 'glass-btn-soft' : 'glass-btn-primary'} disabled:opacity-50`}
                      >
                        {localVoiceDesignInUse ? t('lmStudioInUse') : t('lmStudioActivate')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
