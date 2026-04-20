'use client'

import { useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import type { LxtProjectAsset } from '@/lib/query/hooks/useLxtAssets'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import VoiceSettingsPanel from '@/components/voice/VoiceSettingsPanel'
import { useLxtVoiceOpsAdapter } from '@/lib/query/hooks/useLxtVoiceOpsAdapter'
import { useImageGenerationCount } from '@/lib/image-generation/use-image-generation-count'
import CharacterCardHeader from '../../novel-promotion/components/assets/character-card/CharacterCardHeader'
import CharacterCardGallery from '../../novel-promotion/components/assets/character-card/CharacterCardGallery'
import CharacterCardActions from '../../novel-promotion/components/assets/character-card/CharacterCardActions'
import LocationCardHeader from '../../novel-promotion/components/assets/location-card/LocationCardHeader'
import LocationImageList from '../../novel-promotion/components/assets/location-card/LocationImageList'
import LocationCardActions from '../../novel-promotion/components/assets/location-card/LocationCardActions'

// ─── Types ────────────────────────────────────────────

export type AssetDraft = {
  name: string
  summary: string
  voiceId: string
  voiceType: string
  customVoiceUrl: string
}

export function buildDraft(asset: LxtProjectAsset): AssetDraft {
  return {
    name: asset.name ?? '',
    summary: asset.summary ?? '',
    voiceId: asset.voiceId ?? '',
    voiceType: asset.voiceType ?? 'library',
    customVoiceUrl: asset.customVoiceUrl ?? '',
  }
}

interface LxtAssetCardProps {
  projectId: string
  asset: LxtProjectAsset
  draft: AssetDraft
  onDraftChange: (patch: Partial<AssetDraft>) => void
  onSave: () => void
  onDelete: () => void
  isSaving: boolean
  isDeleting: boolean
  onBindGlobal: (type: 'character' | 'location' | 'prop') => void
  onBindVoice: () => void
  // 档案 & 确认生成
  onEditProfile: () => void
  onConfirmProfile: () => void
  isConfirmingProfile: boolean
  // AI 图像生成
  onGenerateImage: () => void
  isGeneratingImage: boolean
}

// ─── Kind label helpers ────────────────────────────────

const KIND_LABELS: Record<string, string> = {
  character: '角色',
  location: '场景',
  prop: '道具',
}

// ─── Component ────────────────────────────────────────

export default function LxtAssetCard({
  projectId,
  asset,
  draft,
  onDraftChange,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
  onBindGlobal,
  onBindVoice,
  onEditProfile,
  onConfirmProfile,
  isConfirmingProfile,
  onGenerateImage,
  isGeneratingImage,
}: LxtAssetCardProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const { count: characterGenCount, setCount: setCharacterGenCount } = useImageGenerationCount('character')
  const { count: locationGenCount, setCount: setLocationGenCount } = useImageGenerationCount('location')

  const voiceAdapter = useLxtVoiceOpsAdapter({
    projectId,
    assetId: asset.id,
    asset,
    onBindVoice,
  })

  const displayName = draft.name || asset.name
  const displaySummary = draft.summary || asset.summary || ''
  const currentImageUrl = asset.imageUrl || null
  const imageTaskState = isGeneratingImage
    ? resolveTaskPresentationState({
        phase: 'processing',
        intent: currentImageUrl ? 'regenerate' : 'generate',
        resource: 'image',
        hasOutput: !!currentImageUrl,
      })
    : null

  const globalBound =
    asset.globalCharacterId || asset.globalLocationId || asset.globalPropId
  const isCharacter = asset.kind === 'character'
  const locationName = KIND_LABELS[asset.kind] ?? '资产'

  return (
    <>
      <div className="flex flex-col gap-2 glass-surface-elevated p-3">
        {isCharacter ? (
          <>
            <CharacterCardGallery
              mode="single"
              characterName={displayName}
              changeReason={displaySummary || '初始形象'}
              aspectClassName="aspect-square"
              currentImageUrl={currentImageUrl}
              selectedIndex={null}
              hasMultipleImages={false}
              isAppearanceTaskRunning={isGeneratingImage}
              displayTaskPresentation={imageTaskState}
              appearanceErrorMessage={null}
              onImageClick={setPreviewImage}
              overlayActions={
                <button
                  type="button"
                  onClick={onGenerateImage}
                  disabled={isGeneratingImage || isConfirmingProfile}
                  className="w-7 h-7 rounded-full bg-[var(--glass-bg-surface-strong)] hover:bg-[var(--glass-bg-surface)] flex items-center justify-center transition-all shadow-sm disabled:opacity-50"
                  title="重新生成"
                >
                  <AppIcon name="refresh" className="w-4 h-4 text-[var(--glass-text-secondary)]" />
                </button>
              }
            />

            <CharacterCardHeader
              mode="compact"
              characterName={displayName}
              changeReason={displaySummary || '初始形象'}
              actions={
                <>
                  <button
                    type="button"
                    onClick={onBindGlobal.bind(null, 'character')}
                    className="flex-shrink-0 w-5 h-5 rounded hover:bg-[var(--glass-tone-info-bg)] flex items-center justify-center transition-colors"
                    title="使用已有形象"
                  >
                    <AppIcon name="arrowDownCircle" className="w-3.5 h-3.5 text-[var(--glass-tone-info-fg)]" />
                  </button>
                  <button
                    type="button"
                    onClick={onEditProfile}
                    className="flex-shrink-0 w-5 h-5 rounded hover:bg-[var(--glass-bg-muted)] flex items-center justify-center transition-colors"
                    title="编辑档案"
                  >
                    <AppIcon name="edit" className="w-3.5 h-3.5 text-[var(--glass-text-secondary)]" />
                  </button>
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="flex-shrink-0 w-5 h-5 rounded hover:bg-[var(--glass-tone-danger-bg)] flex items-center justify-center transition-colors disabled:opacity-40"
                    title="删除"
                  >
                    <AppIcon name="trash" className="w-3.5 h-3.5 text-[var(--glass-tone-danger-fg)]" />
                  </button>
                </>
              }
            />

            <CharacterCardActions
              mode="compact"
              isPrimaryAppearance={true}
              primaryAppearanceSelected={true}
              currentImageUrl={currentImageUrl}
              isAppearanceTaskRunning={isGeneratingImage}
              isAnyTaskRunning={false}
              hasDescription={Boolean(displaySummary || asset.description)}
              generationCount={characterGenCount}
              onGenerationCountChange={setCharacterGenCount}
              onGenerate={() => onGenerateImage()}
              voiceSettings={<VoiceSettingsPanel adapter={voiceAdapter} />}
            />
          </>
        ) : (
          <>
            <LocationImageList
              mode="single"
              locationName={displayName}
              aspectClassName="aspect-square"
              currentImageUrl={currentImageUrl}
              selectedIndex={null}
              hasMultipleImages={false}
              isTaskRunning={isGeneratingImage}
              displayTaskPresentation={imageTaskState}
              imageErrorMessage={null}
              onImageClick={setPreviewImage}
              overlayActions={
                <button
                  type="button"
                  onClick={onGenerateImage}
                  disabled={isGeneratingImage || isConfirmingProfile}
                  className="w-7 h-7 rounded-full bg-[var(--glass-bg-surface-strong)] hover:bg-[var(--glass-bg-surface)] flex items-center justify-center transition-all shadow-sm disabled:opacity-50"
                  title="重新生成"
                >
                  <AppIcon name="refresh" className="w-4 h-4 text-[var(--glass-text-secondary)]" />
                </button>
              }
            />

            <LocationCardHeader
              mode="compact"
              locationName={displayName}
              summary={displaySummary || `${locationName}资产`}
              actions={
                <>
                  <button
                    type="button"
                    onClick={() => onBindGlobal(asset.kind as 'character' | 'location' | 'prop')}
                    className="flex-shrink-0 w-5 h-5 rounded hover:bg-[var(--glass-tone-info-bg)] flex items-center justify-center transition-colors"
                    title="使用已有资产"
                  >
                    <AppIcon name="arrowDownCircle" className="w-3.5 h-3.5 text-[var(--glass-tone-info-fg)]" />
                  </button>
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="flex-shrink-0 w-5 h-5 rounded hover:bg-[var(--glass-tone-danger-bg)] flex items-center justify-center transition-colors disabled:opacity-40"
                    title="删除"
                  >
                    <AppIcon name="trash" className="w-3.5 h-3.5 text-[var(--glass-tone-danger-fg)]" />
                  </button>
                </>
              }
            />

            <LocationCardActions
              mode="compact"
              currentImageUrl={currentImageUrl}
              isTaskRunning={isGeneratingImage}
              canGenerate={Boolean(displaySummary || asset.description)}
              generationCount={locationGenCount}
              onGenerationCountChange={setLocationGenCount}
              onGenerate={() => onGenerateImage()}
            />
          </>
        )}

        <div className="pt-2 border-t border-[var(--glass-stroke-base)] flex items-center gap-2">
          {globalBound && (
            <span className="text-xs text-emerald-500 inline-flex items-center gap-1">
              <AppIcon name="check" className="w-3 h-3" />已绑定全局
            </span>
          )}
          {asset.profileConfirmed && (
            <span className="text-xs text-sky-500 inline-flex items-center gap-1">
              <AppIcon name="check" className="w-3 h-3" />描述已生成
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onConfirmProfile}
              disabled={isConfirmingProfile}
              className="glass-btn-base glass-btn-primary h-7 px-3 text-xs disabled:opacity-40"
            >
              {isConfirmingProfile ? '生成中…' : asset.description ? '重新生成描述' : '确认并生成'}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="glass-btn-base glass-btn-secondary h-7 px-3 text-xs disabled:opacity-40"
            >
              {isSaving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
    </>
  )
}
