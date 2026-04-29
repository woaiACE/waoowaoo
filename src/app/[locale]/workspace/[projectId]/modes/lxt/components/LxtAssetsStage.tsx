'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import AssetLibraryShell from '@/components/shared/assets/AssetLibraryShell'
import UnifiedAssetToolbar from '@/components/shared/assets/UnifiedAssetToolbar'
import GlobalAssetPicker from '@/components/shared/assets/GlobalAssetPicker'
import { AppIcon } from '@/components/ui/icons'
import { apiFetch } from '@/lib/api-fetch'
import { downloadAssetArchive } from '@/lib/assets/downloadAssetArchive'
import {
  type LxtProjectAsset,
  useBindGlobalLxtAsset,
  useClearLxtAssets,
  useDeleteLxtAsset,
  useLxtAssets,
  useUpdateLxtAsset,
  useUpdateLxtAssetProfile,
  useUpdateLxtAssetVoice,
  useGenerateLxtAssetImage,
  useSelectLxtAssetImage,
} from '@/lib/query/hooks/useLxtAssets'
import { useLxtAnalyzeAssetsRunStream } from '@/lib/query/hooks/useLxtAnalyzeAssetsRunStream'
import { useActiveTasks } from '@/lib/query/hooks/useTaskStatus'
import LLMStageStreamCard, { type LLMStageViewItem } from '@/components/llm-console/LLMStageStreamCard'
import type { CharacterProfileData } from '@/types/character-profile'
import CharacterProfileDialog from '../../novel-promotion/components/assets/CharacterProfileDialog'
import { LxtCharacterEditModal } from './LxtCharacterEditModal'
// ── Shared components from common mode ───────────────
import AssetFilterBar, {
  type AssetKindFilter,
} from '../../novel-promotion/components/assets/AssetFilterBar'
import AssetsStageStatusOverlays from '../../novel-promotion/components/assets/AssetsStageStatusOverlays'
import { useLxtWorkspaceEpisodeStageData } from '../hooks/useLxtWorkspaceEpisodeStageData'
import { useLxtWorkspaceProvider } from '../LxtWorkspaceProvider'
import { useLxtWorkspaceStageRuntime } from '../LxtWorkspaceStageRuntimeContext'
import LxtAssetCard, { buildDraft, type AssetDraft } from './LxtAssetCard'
import { parseFinalFilmContent } from '@/lib/lxt/final-film'

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
  const { shotListContent, finalFilmContent } = useLxtWorkspaceEpisodeStageData()
  const currentArtStyle = useMemo(
    () => parseFinalFilmContent(finalFilmContent).artStyle,
    [finalFilmContent],
  )

  const [picker, setPicker] = useState<PickerState>(null)
  const [drafts, setDrafts] = useState<Record<string, AssetDraft>>({})
  const [kindFilter, setKindFilter] = useState<AssetKindFilter>('all')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null)
  const [isConsoleMinimized, setIsConsoleMinimized] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  // 档案编辑 & 确认生成
  type EditingProfile = { assetId: string; kind: string; name: string } | null
  const [editingProfile, setEditingProfile] = useState<EditingProfile>(null)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  // 支持多资产并发确认：Set 记录所有进行中的 assetId，Map 记录各自的流式文本
  const [confirmingAssetIds, setConfirmingAssetIds] = useState<Set<string>>(new Set())
  const [confirmingStreamTexts, setConfirmingStreamTexts] = useState<Map<string, string>>(new Map())
  const [submittingImageAssetIds, setSubmittingImageAssetIds] = useState<Set<string>>(new Set())
  const [isBatchConfirming, setIsBatchConfirming] = useState(false)
  const [isBatchGenerating, setIsBatchGenerating] = useState(false)

  // 形象描述提示词编辑弹框
  type EditingDescription = {
    assetId: string
    kind: 'character' | 'location' | 'prop'
    name: string
    introduction: string | null
    description: string
  } | null
  const [editingDescription, setEditingDescription] = useState<EditingDescription>(null)

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

  // ―― AI 图像生成任务追踪 ――――――――――――――――――――――――――――――――――――――――
  const imageGenTasks = useActiveTasks({
    projectId: projectId || null,
    targetType: 'LxtProjectAsset',
    type: ['lxt_asset_image'],
  })
  const activeImageGenIds = useMemo(() => {
    const ids = new Set<string>()
    for (const task of imageGenTasks.data ?? []) {
      if (task.targetId) ids.add(task.targetId)
    }
    return ids
  }, [imageGenTasks.data])
  // 图像生成完成后自动刷新
  const wasImageGenRef = useRef(false)
  useEffect(() => {
    const hasActive = (imageGenTasks.data?.length ?? 0) > 0
    if (wasImageGenRef.current && !hasActive) {
      void assetsQuery.refetch()
    }
    wasImageGenRef.current = hasActive
  }, [imageGenTasks.data, assetsQuery])

  // ―― AI 声音设计任务追踪已移至 useLxtVoiceOpsAdapter，此处不再需要 ――――

  const clearMutation = useClearLxtAssets(projectId || null)
  const updateMutation = useUpdateLxtAsset(projectId || null)
  const deleteMutation = useDeleteLxtAsset(projectId || null)
  const bindGlobalMutation = useBindGlobalLxtAsset(projectId || null)
  const updateVoiceMutation = useUpdateLxtAssetVoice(projectId || null)
  const updateProfileMutation = useUpdateLxtAssetProfile(projectId || null)
  const generateImageMutation = useGenerateLxtAssetImage(projectId || null)
  const selectImageMutation = useSelectLxtAssetImage(projectId || null)

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

  const handleReanalyze = async () => {
    if (!window.confirm('确定要清除全部资产并重新 LLM 分析吗？此操作不可撤销。')) return
    if (isAnalyzing) return
    await clearMutation.mutateAsync()
    await onRefresh({ scope: 'all' })
    await handleAnalyzeLlm()
  }

  const handleDownloadAll = async () => {
    const imageEntries = assets.flatMap((asset) => {
      const safeName = asset.name.replace(/[/\\:*?"<>|]/g, '_')
      return asset.imageUrl
        ? [{ filename: `${asset.kind}s/${safeName}.jpg`, url: asset.imageUrl }]
        : []
    })

    if (imageEntries.length === 0) {
      showToast('当前没有可下载的资产图片', 'warning')
      return
    }

    setIsDownloading(true)
    try {
      await downloadAssetArchive(imageEntries, `lxt_assets_${new Date().toISOString().slice(0, 10)}.zip`)
    } catch {
      showToast('资产打包下载失败', 'error')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleSave = async (asset: LxtProjectAsset) => {
    const draft = getDraft(asset)
    await updateMutation.mutateAsync({
      assetId: asset.id,
      name: draft.name,
      summary: draft.summary,
    })
    await onRefresh({ scope: 'all' })
    showToast('已保存', 'success')
  }

  const handleDelete = async (assetId: string) => {
    await deleteMutation.mutateAsync(assetId)
    await onRefresh({ scope: 'all' })
    showToast('已删除', 'success')
  }

  const handleGenerateImage = useCallback(async (assetId: string, count?: number) => {
    setSubmittingImageAssetIds((prev) => new Set([...prev, assetId]))
    try {
      await generateImageMutation.mutateAsync({ assetId, count, artStyle: currentArtStyle })
      showToast('图像生成已提交，完成后自动更新…', 'success')
      void assetsQuery.refetch()
    } catch {
      showToast('图像生成提交失败', 'error')
    } finally {
      setSubmittingImageAssetIds((prev) => {
        const next = new Set(prev)
        next.delete(assetId)
        return next
      })
    }
  }, [generateImageMutation, showToast, currentArtStyle, assetsQuery])

  const handleSelectImage = async (assetId: string, imageUrl: string) => {
    try {
      await selectImageMutation.mutateAsync({ assetId, imageUrl })
    } catch {
      showToast('选择图片失败', 'error')
    }
  }

  const handleEditProfile = (asset: LxtProjectAsset) => {
    setEditingProfile({ assetId: asset.id, kind: asset.kind, name: asset.name })
  }

  const handleEditDescription = (asset: LxtProjectAsset) => {
    setEditingDescription({
      assetId: asset.id,
      kind: asset.kind as 'character' | 'location' | 'prop',
      name: asset.name,
      introduction: asset.summary ?? null,
      description: asset.description ?? '',
    })
  }

  const handleSaveProfile = async (profileData: CharacterProfileData) => {
    if (!editingProfile) return
    setIsSavingProfile(true)
    try {
      await updateProfileMutation.mutateAsync({ assetId: editingProfile.assetId, profileData: JSON.stringify(profileData) })
      setEditingProfile(null)
      showToast('档案已保存', 'success')
    } catch {
      showToast('保存档案失败', 'error')
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleConfirmProfile = useCallback(async (asset: LxtProjectAsset) => {
    // 每个资产独立锁：同一资产不重复提交，不同资产可并发
    if (confirmingAssetIds.has(asset.id)) return
    setConfirmingAssetIds((prev) => new Set([...prev, asset.id]))
    setConfirmingStreamTexts((prev) => new Map([...prev, [asset.id, '']]))
    try {
      const res = await apiFetch(`/api/lxt/${projectId}/assets/${asset.id}/confirm-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artStyle: currentArtStyle }),
      })
      if (!res.ok || !res.body) {
        showToast('生成描述失败', 'error')
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as { kind: string; delta?: string; message?: string }
            if (event.kind === 'text' && event.delta) {
              setConfirmingStreamTexts((prev) => {
                const next = new Map(prev)
                next.set(asset.id, (next.get(asset.id) ?? '') + event.delta)
                return next
              })
            } else if (event.kind === 'done') {
              void assetsQuery.refetch()
            } else if (event.kind === 'error') {
              showToast(event.message ?? '生成失败', 'error')
            }
          } catch { continue }
        }
      }
    } catch {
      showToast(`${asset.name} 生成描述失败`, 'error')
    } finally {
      setConfirmingAssetIds((prev) => {
        const next = new Set(prev)
        next.delete(asset.id)
        return next
      })
      setConfirmingStreamTexts((prev) => {
        const next = new Map(prev)
        next.delete(asset.id)
        return next
      })
    }
  }, [confirmingAssetIds, projectId, showToast, assetsQuery])

  const handleBatchConfirmProfiles = useCallback(async () => {
    const unconfirmed = assets.filter((a) => !a.profileConfirmed)
    if (unconfirmed.length === 0) {
      showToast('所有资产已完成确认', 'success')
      return
    }
    setIsBatchConfirming(true)
    await Promise.allSettled(unconfirmed.map((a) => handleConfirmProfile(a)))
    setIsBatchConfirming(false)
    showToast(`已完成 ${unconfirmed.length} 项档案确认`, 'success')
    void assetsQuery.refetch()
  }, [assets, handleConfirmProfile, showToast, assetsQuery])

  const handleGenerateAllImages = useCallback(async () => {
    if (assets.length === 0) return
    setIsBatchGenerating(true)
    await Promise.allSettled(assets.map((a) => handleGenerateImage(a.id)))
    setIsBatchGenerating(false)
    showToast(`已提交 ${assets.length} 项图像生成任务`, 'success')
  }, [assets, handleGenerateImage, showToast])

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
    <AssetLibraryShell
      variant="inline"
      title="资产库"
      subtitle="先确认角色、场景、道具与音色，再进入制作脚本生成。"
      iconName="folderCards"
      shellClassName="min-h-[calc(100vh-14rem)]"
      contentClassName="p-4 md:p-6"
    >
      <div className="flex flex-col gap-6">
        <UnifiedAssetToolbar
          title="资产管理"
          countText={`共 ${totalCount} 项（角色 ${counts.character} / 场景 ${counts.location} / 道具 ${counts.prop}）`}
          leftSlot={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleAnalyzeLlm()}
                disabled={!hasStoryboard || isAnalyzing}
                className="glass-btn-base glass-btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AppIcon name="idea" className="w-3.5 h-3.5" />
                <span>{isAnalyzing ? 'LLM 分析中…' : '✨ LLM 分析增强'}</span>
              </button>
              {assets.length > 0 && !isAnalyzing && (
                <button
                  type="button"
                  onClick={() => void handleReanalyze()}
                  disabled={clearMutation.isPending}
                  className="glass-btn-base glass-btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>重新分析</span>
                </button>
              )}
              {assets.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleBatchConfirmProfiles()}
                    disabled={isBatchConfirming || confirmingAssetIds.size > 0}
                    title="对所有未确认档案的资产并发生成形象描述"
                    className="glass-btn-base glass-btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <AppIcon name="check" className="w-3.5 h-3.5" />
                    <span>
                      {isBatchConfirming || confirmingAssetIds.size > 0
                        ? `确认中… (${confirmingAssetIds.size})`
                        : '一键确认档案'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGenerateAllImages()}
                    disabled={isBatchGenerating || activeImageGenIds.size > 0}
                    title="为所有资产并发提交图像生成任务"
                    className="glass-btn-base glass-btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <AppIcon name="image" className="w-3.5 h-3.5" />
                    <span>
                      {isBatchGenerating || activeImageGenIds.size > 0
                        ? `生成中… (${activeImageGenIds.size})`
                        : '一键生成图片'}
                    </span>
                  </button>
                </>
              )}
            </div>
          }
          rightSlot={
            <>
              {assets.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleClearAssets()}
                  disabled={clearMutation.isPending || isAnalyzing}
                  className="glass-btn-base glass-btn-danger h-8 px-3 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {clearMutation.isPending ? '清除中…' : '清除全部'}
                </button>
              )}
              <button
                type="button"
                onClick={() => runtime.onStageChange('lxt-final-script')}
                className="glass-btn-base glass-btn-secondary h-8 px-3 text-xs"
              >
                下一步：制作脚本
              </button>
            </>
          }
          onDownloadAll={() => void handleDownloadAll()}
          isDownloading={isDownloading}
          disableDownload={assets.length === 0}
          downloadTitle="下载全部"
        />

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
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {items.map((asset) => (
                      <LxtAssetCard
                        key={asset.id}
                        projectId={projectId || ''}
                        asset={asset}
                        draft={getDraft(asset)}
                        onDraftChange={(patch) => setDraftValue(asset, patch)}
                        onSave={() => void handleSave(asset)}
                        onDelete={() => void handleDelete(asset.id)}
                        isSaving={updateMutation.isPending || updateVoiceMutation.isPending}
                        isDeleting={deleteMutation.isPending}
                        onBindGlobal={() => setPicker({ assetId: asset.id, type: asset.kind })}
                        onBindVoice={() => setPicker({ assetId: asset.id, type: 'voice' })}
                        onEditProfile={() => handleEditProfile(asset)}
                        onConfirmProfile={() => void handleConfirmProfile(asset)}
                        isConfirmingProfile={confirmingAssetIds.has(asset.id)}
                        confirmingStreamText={confirmingStreamTexts.get(asset.id) ?? ''}
                        onGenerateImage={(count) => void handleGenerateImage(asset.id, count)}
                        isGeneratingImage={activeImageGenIds.has(asset.id) || submittingImageAssetIds.has(asset.id)}
                        onSelectImage={(imageUrl) => void handleSelectImage(asset.id, imageUrl)}
                        onEditDescription={() => handleEditDescription(asset)}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        {editingDescription && (
          <LxtCharacterEditModal
            projectId={projectId}
            assetId={editingDescription.assetId}
            assetKind={editingDescription.kind}
            characterName={editingDescription.name}
            introduction={editingDescription.introduction}
            description={editingDescription.description}
            isGeneratingImage={activeImageGenIds.has(editingDescription.assetId)}
            onClose={() => setEditingDescription(null)}
            onSave={async (_assetId) => {
              setEditingDescription(null)
              await assetsQuery.refetch()
              showToast('已保存', 'success')
            }}
          />
        )}

        {editingProfile?.kind === 'character' && (() => {
          const asset = assets.find((a) => a.id === editingProfile.assetId)
          const profileData: CharacterProfileData = asset?.profileData
            ? (JSON.parse(asset.profileData) as CharacterProfileData)
            : { role_level: 'C', archetype: '', personality_tags: [], era_period: '', social_class: '', occupation: '', costume_tier: 3, suggested_colors: [], primary_identifier: '', visual_keywords: [], gender: '', age_range: '' }
          return (
            <CharacterProfileDialog
              isOpen
              characterName={editingProfile.name}
              profileData={profileData}
              onClose={() => setEditingProfile(null)}
              onSave={(data) => void handleSaveProfile(data)}
              isSaving={isSavingProfile}
              projectId={projectId}
              assetId={editingProfile.assetId}
            />
          )
        })()}



        <GlobalAssetPicker
          isOpen={!!picker}
          onClose={() => setPicker(null)}
          onSelect={(globalAssetId) => void handlePickerSelect(globalAssetId)}
          type={picker?.type ?? 'character'}
          loading={bindGlobalMutation.isPending || updateVoiceMutation.isPending}
        />

        <AssetsStageStatusOverlays
          toast={toast}
          onCloseToast={() => setToast(null)}
          isGlobalAnalyzing={false}
          globalAnalyzingState={null}
          globalAnalyzingTitle=""
          globalAnalyzingHint=""
          globalAnalyzingTip=""
        />

        {isAnalyzing && isConsoleMinimized && (
          <button
            type="button"
            onClick={() => setIsConsoleMinimized(false)}
            className="fixed right-6 bottom-6 z-50 glass-surface-modal rounded-2xl px-4 py-3 text-sm font-medium text-(--glass-tone-info-fg)"
          >
            LLM 资产分析进行中…
          </button>
        )}

        {isAnalyzing && !isConsoleMinimized && (
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
                selectedStageId={stream.selectedStep?.id || undefined}
                onSelectStage={stream.selectStep}
                outputText={stream.outputText}
                activeMessage={stream.activeMessage}
                overallProgress={stream.overallProgress}
                showCursor={stream.isRunning}
                autoScroll={stream.selectedStep?.id === stream.activeStepId}
                smoothStreaming
                errorMessage={stream.errorMessage || undefined}
                topRightAction={
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => stream.reset()}
                      className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                    >
                      关闭
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsConsoleMinimized(true)}
                      className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                    >
                      最小化
                    </button>
                  </div>
                }
              />
            </div>
          </div>
        )}
      </div>
    </AssetLibraryShell>
  )
}
