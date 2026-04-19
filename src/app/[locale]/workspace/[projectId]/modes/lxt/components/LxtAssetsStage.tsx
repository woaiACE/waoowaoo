'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import GlobalAssetPicker from '@/components/shared/assets/GlobalAssetPicker'
import {
  type LxtProjectAsset,
  useBindGlobalLxtAsset,
  useClearLxtAssets,
  useDeleteLxtAsset,
  useLxtAssets,
  useUpdateLxtAsset,
  useUpdateLxtAssetVoice,
} from '@/lib/query/hooks/useLxtAssets'
import { useLxtAnalyzeAssetsRunStream } from '@/lib/query/hooks/useLxtAnalyzeAssetsRunStream'
import { useLxtWorkspaceEpisodeStageData } from '../hooks/useLxtWorkspaceEpisodeStageData'
import { useLxtWorkspaceProvider } from '../LxtWorkspaceProvider'
import { useLxtWorkspaceStageRuntime } from '../LxtWorkspaceStageRuntimeContext'
import { useActiveTasks } from '@/lib/query/hooks/useTaskStatus'
import LLMStageStreamCard, { type LLMStageViewItem } from '@/components/llm-console/LLMStageStreamCard'
// ── Shared components from common mode ───────────────
import AssetFilterBar, {
  type AssetKindFilter,
} from '../../novel-promotion/components/assets/AssetFilterBar'
import AssetsStageStatusOverlays from '../../novel-promotion/components/assets/AssetsStageStatusOverlays'
import LxtAssetCard, { buildDraft, type AssetDraft } from './LxtAssetCard'

type PickerState = {
  assetId: string
  type: 'character' | 'location' | 'prop' | 'voice'
} | null

// ─── Section labels ────────────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  character: '角色资产',
  location: '场景资产',
  prop: '道具资产',
}

export default function LxtAssetsStage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params?.projectId ?? ''
  const { episodeId, onRefresh } = useLxtWorkspaceProvider()
  const runtime = useLxtWorkspaceStageRuntime()
  const { shotListContent } = useLxtWorkspaceEpisodeStageData()

  const [picker, setPicker] = useState<PickerState>(null)
  const [drafts, setDrafts] = useState<Record<string, AssetDraft>>({})
  const [kindFilter, setKindFilter] = useState<AssetKindFilter>('all')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'warning' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const assetsQuery = useLxtAssets(projectId || null)

  // ── LLM 分析增强：流式实时推理 ───────────────────────────────────
  const stream = useLxtAnalyzeAssetsRunStream({ projectId: projectId || '' })
  const isAnalyzing = stream.isRunning || stream.isRecoveredRunning || stream.status === 'running'

  // 分析任务完成后自动刷新资产列表
  const prevStreamStatusRef = useRef<string>('idle')
  useEffect(() => {
    const status = stream.status
    if (prevStreamStatusRef.current !== status) {
      prevStreamStatusRef.current = status
      if (status === 'completed') {
        void assetsQuery.refetch()
      }
    }
  }, [stream.status, assetsQuery])

  // ―― AI 声音设计任务追踪（按资产级，targetType=LxtProjectAsset）――――――――
  const voiceDesignTasks = useActiveTasks({
    projectId: projectId || null,
    targetType: 'LxtProjectAsset',
    type: ['lxt_asset_voice_design'],
  })
  // assetId 集合：正在进行 AI 声音设计的资产
  const activeVoiceDesignIds = useMemo(() => {
    const ids = new Set<string>()
    for (const task of voiceDesignTasks.data ?? []) {
      if (task.targetId) ids.add(task.targetId)
    }
    return ids
  }, [voiceDesignTasks.data])
  // 声音设计完成后自动刷新
  const wasVoiceDesigningRef = useRef(false)
  useEffect(() => {
    const hasActive = (voiceDesignTasks.data?.length ?? 0) > 0
    if (wasVoiceDesigningRef.current && !hasActive) {
      void assetsQuery.refetch()
    }
    wasVoiceDesigningRef.current = hasActive
  }, [voiceDesignTasks.data, assetsQuery])

  const clearMutation = useClearLxtAssets(projectId || null)
  const updateMutation = useUpdateLxtAsset(projectId || null)
  const deleteMutation = useDeleteLxtAsset(projectId || null)
  const bindGlobalMutation = useBindGlobalLxtAsset(projectId || null)
  const updateVoiceMutation = useUpdateLxtAssetVoice(projectId || null)

  const assets = assetsQuery.data?.assets ?? []
  const counts = assetsQuery.data?.counts ?? { character: 0, location: 0, prop: 0 }
  const hasStoryboard = !!shotListContent?.trim()

  const grouped = useMemo(() => ({
    character: assets.filter((item) => item.kind === 'character'),
    location: assets.filter((item) => item.kind === 'location'),
    prop: assets.filter((item) => item.kind === 'prop'),
  }), [assets])

  // Respect the kind filter — 'all' shows every non-empty section
  const visibleKinds = useMemo(
    () => (kindFilter === 'all'
      ? (['character', 'location', 'prop'] as const)
      : [kindFilter] as const),
    [kindFilter],
  )

  const setDraftValue = (asset: LxtProjectAsset, patch: Partial<AssetDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [asset.id]: {
        ...(prev[asset.id] ?? buildDraft(asset)),
        ...patch,
      },
    }))
  }

  const getDraft = (asset: LxtProjectAsset) => drafts[asset.id] ?? buildDraft(asset)

  const handleClearAssets = async () => {
    if (!window.confirm('确定要清除全部资产吗？此操作不可撤销。')) return
    await clearMutation.mutateAsync()
    await onRefresh({ scope: 'all' })
    showToast('全部资产已清除', 'success')
  }

  const handleAnalyzeLlm = async () => {
    if (isAnalyzing) return
    stream.reset()
    await stream.run({})
  }

  const handleVoiceDesign = async (assetId: string, voicePrompt: string, previewText: string) => {
    const res = await fetch(`/api/lxt/${projectId}/assets/${assetId}/voice-design`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voicePrompt, previewText }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      showToast((data as { message?: string }).message ?? 'AI 声音设计提交失败', 'error')
      return
    }
    showToast('AI 声音设计已提交，完成后自动更新…', 'success')
  }

  const handleSave = async (asset: LxtProjectAsset) => {
    const draft = getDraft(asset)
    await updateMutation.mutateAsync({
      assetId: asset.id,
      name: draft.name,
      summary: draft.summary,
    })
    if (asset.kind === 'character') {
      await updateVoiceMutation.mutateAsync({
        assetId: asset.id,
        voiceId: draft.voiceId || null,
        voiceType: draft.voiceType || null,
        customVoiceUrl: draft.customVoiceUrl || null,
      })
    }
    await onRefresh({ scope: 'all' })
    showToast('已保存', 'success')
  }

  const handleDelete = async (assetId: string) => {
    await deleteMutation.mutateAsync(assetId)
    await onRefresh({ scope: 'all' })
    showToast('已删除', 'success')
  }

  const handlePickerSelect = async (globalAssetId: string) => {
    if (!picker) return
    if (picker.type === 'voice') {
      await updateVoiceMutation.mutateAsync({
        assetId: picker.assetId,
        voiceId: globalAssetId,
        voiceType: 'library',
      })
      showToast('音色已绑定', 'success')
    } else {
      await bindGlobalMutation.mutateAsync({
        assetId: picker.assetId,
        globalAssetId,
      })
      showToast('全局资产已绑定', 'success')
    }
    setPicker(null)
    await onRefresh({ scope: 'all' })
  }

  const totalCount = counts.character + counts.location + counts.prop

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--glass-text-primary)]">LXT 资产库</h2>
          <p className="text-sm text-[var(--glass-text-secondary)] mt-1">
            先确认角色、场景、道具与音色，再进入制作脚本生成。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {assets.length > 0 && (
            <button
              type="button"
              onClick={() => void handleClearAssets()}
              disabled={clearMutation.isPending || isAnalyzing}
              className="glass-btn-base glass-btn-danger h-9 px-4 text-sm disabled:opacity-40"
            >
              {clearMutation.isPending ? '清除中…' : '清除全部'}
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleAnalyzeLlm()}
            disabled={!hasStoryboard || isAnalyzing}
            className="glass-btn-base glass-btn-primary h-9 px-4 text-sm disabled:opacity-40"
          >
            {isAnalyzing ? 'LLM 分析中…' : '✨ LLM 分析增强'}
          </button>
          <button
            type="button"
            onClick={() => runtime.onStageChange('lxt-final-script')}
            className="glass-btn-base glass-btn-secondary h-9 px-4 text-sm"
          >
            下一步：制作脚本
          </button>
        </div>
      </div>

      {!hasStoryboard && (
        <div className="glass-surface p-4 text-center">
          <p className="text-sm text-[var(--glass-text-secondary)]">请先生成分镜脚本，再初始化 LXT 资产库。</p>
          <button
            type="button"
            onClick={() => runtime.onStageChange('lxt-storyboard')}
            className="glass-btn-base glass-btn-secondary h-8 px-4 text-xs mt-3"
          >
            前往分镜脚本
          </button>
        </div>
      )}

      {/* ── Count summary cards ───────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="glass-surface p-4">
          <div className="text-xs text-[var(--glass-text-secondary)]">角色</div>
          <div className="text-2xl font-bold mt-1">{counts.character}</div>
        </div>
        <div className="glass-surface p-4">
          <div className="text-xs text-[var(--glass-text-secondary)]">场景</div>
          <div className="text-2xl font-bold mt-1">{counts.location}</div>
        </div>
        <div className="glass-surface p-4">
          <div className="text-xs text-[var(--glass-text-secondary)]">道具</div>
          <div className="text-2xl font-bold mt-1">{counts.prop}</div>
        </div>
      </div>

      {/* ── Kind filter bar (reused from common mode) ──────── */}
      {assets.length > 0 && (
        <AssetFilterBar
          kindFilter={kindFilter}
          onKindFilterChange={setKindFilter}
          counts={{
            all: totalCount,
            character: counts.character,
            location: counts.location,
            prop: counts.prop,
          }}
        />
      )}

      {assetsQuery.isLoading ? (
        <div className="glass-surface p-6 text-sm text-[var(--glass-text-secondary)]">正在加载资产…</div>
      ) : assets.length === 0 ? (
        <div className="glass-surface p-6 text-sm text-[var(--glass-text-secondary)]">
          还没有提取到资产。点击 ✨ LLM 分析增强即可自动分析角色、场景和道具。
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {visibleKinds.map((kind) => {
            const items = grouped[kind]
            if (items.length === 0) return null
            return (
              <section key={kind} className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">
                    {SECTION_LABELS[kind]}
                  </h3>
                  <span className="text-xs text-[var(--glass-text-secondary)]">{items.length} 项</span>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {items.map((asset) => (
                    <LxtAssetCard
                      key={asset.id}
                      asset={asset}
                      draft={getDraft(asset)}
                      onDraftChange={(patch) => setDraftValue(asset, patch)}
                      onSave={() => void handleSave(asset)}
                      onDelete={() => void handleDelete(asset.id)}
                      isSaving={updateMutation.isPending || updateVoiceMutation.isPending}
                      isDeleting={deleteMutation.isPending}
                      onBindGlobal={() => setPicker({ assetId: asset.id, type: asset.kind })}
                      onBindVoice={() => setPicker({ assetId: asset.id, type: 'voice' })}
                      isBindingGlobal={bindGlobalMutation.isPending}
                      isBindingVoice={updateVoiceMutation.isPending}
                      onVoiceDesign={(voicePrompt, previewText) =>
                        void handleVoiceDesign(asset.id, voicePrompt, previewText)
                      }
                      isVoiceDesigning={activeVoiceDesignIds.has(asset.id)}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* ── Global asset picker ───────────────────────────── */}
      <GlobalAssetPicker
        isOpen={!!picker}
        onClose={() => setPicker(null)}
        onSelect={(globalAssetId) => void handlePickerSelect(globalAssetId)}
        type={picker?.type ?? 'character'}
        loading={bindGlobalMutation.isPending || updateVoiceMutation.isPending}
      />

      {/* ── Toast overlays ─────────────────────────────────── */}
      <AssetsStageStatusOverlays
        toast={toast}
        onCloseToast={() => setToast(null)}
        isGlobalAnalyzing={false}
        globalAnalyzingState={null}
        globalAnalyzingTitle=""
        globalAnalyzingHint=""
        globalAnalyzingTip=""
      />

      {/* ── LLM 分析流式推理卡片（全屏覆盖层） ────────────── */}
      {isAnalyzing && (
        <div className="fixed inset-0 z-50 glass-overlay backdrop-blur-sm">
          <div className="mx-auto mt-4 h-[calc(100vh-2rem)] w-[min(96vw,1400px)]">
            <LLMStageStreamCard
              title="LLM 资产分析"
              subtitle="角色 · 场景 · 道具"
              stages={
                stream.stages.length > 0
                  ? (stream.stages as LLMStageViewItem[])
                  : ([
                      { id: 'analyze_characters', title: '角色分析', status: 'pending' },
                      { id: 'analyze_locations', title: '场景分析', status: 'pending' },
                      { id: 'analyze_props', title: '道具分析', status: 'pending' },
                    ] satisfies LLMStageViewItem[])
              }
              activeStageId={stream.activeStepId ?? 'analyze_characters'}
              outputText={stream.outputText}
              activeMessage={stream.activeMessage}
              overallProgress={stream.overallProgress}
              showCursor={stream.isRunning}
              smoothStreaming
              errorMessage={stream.errorMessage || undefined}
              topRightAction={
                <button
                  type="button"
                  onClick={() => stream.reset()}
                  className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                >
                  关闭
                </button>
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}
