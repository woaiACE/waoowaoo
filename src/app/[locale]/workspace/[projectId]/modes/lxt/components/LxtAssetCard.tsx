'use client'

import { useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import type { LxtProjectAsset } from '@/lib/query/hooks/useLxtAssets'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import VoiceSettingsPanel from '@/components/voice/VoiceSettingsPanel'
import { useLxtVoiceOpsAdapter } from '@/lib/query/hooks/useLxtVoiceOpsAdapter'
import { useImageGenerationCount } from '@/lib/image-generation/use-image-generation-count'
import CharacterCardGallery from '../../novel-promotion/components/assets/character-card/CharacterCardGallery'
import CharacterCardActions from '../../novel-promotion/components/assets/character-card/CharacterCardActions'
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
  // 角色卡：只有 profileConfirmed=true（描述已生成）后才展示图像生成区
  const showImageArea = asset.profileConfirmed

  return (
    <>
      <div className="flex flex-col gap-0 glass-surface overflow-hidden">
        {/* ── 头部：类型标签 + 删除 ─────────────── */}
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] font-medium">
            {KIND_LABELS[asset.kind] ?? asset.kind}
          </span>
          <div className="flex items-center gap-2">
            {globalBound && (
              <span className="text-xs text-emerald-400 inline-flex items-center gap-1">
                <AppIcon name="check" className="w-3 h-3" />已绑定全局
              </span>
            )}
            {asset.profileConfirmed && (
              <span className="text-xs text-sky-400 inline-flex items-center gap-1">
                <AppIcon name="check" className="w-3 h-3" />描述已生成
              </span>
            )}
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting}
              className="w-7 h-7 rounded flex items-center justify-center text-[var(--glass-text-tertiary)] hover:text-[var(--glass-tone-danger-fg)] hover:bg-[var(--glass-tone-danger-bg)] transition-colors disabled:opacity-40"
              title="删除"
            >
              <AppIcon name="trash" className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── 名称输入 ──────────────────────────── */}
        <div className="px-4 pb-2">
          <input
            value={draft.name}
            onChange={(e) => onDraftChange({ name: e.target.value })}
            className="glass-field-input h-9 w-full px-3 text-sm font-medium"
            placeholder="资产名称"
          />
        </div>

        {/* ── 备注 textarea ─────────────────────── */}
        <div className="px-4 pb-3">
          <textarea
            value={draft.summary}
            onChange={(e) => onDraftChange({ summary: e.target.value })}
            className="glass-field-input w-full min-h-[56px] px-3 py-2 text-sm resize-none"
            placeholder="角色设定 / 场景备注…"
          />
        </div>

        {/* ── 角色卡内容区 ───────────────────────── */}
        {isCharacter ? (
          showImageArea ? (
            /* 已确认档案 → 展示图像生成骨架 */
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
              <div className="px-4 pb-2">
                <CharacterCardActions
                  mode="compact"
                  isPrimaryAppearance={true}
                  primaryAppearanceSelected={true}
                  currentImageUrl={currentImageUrl}
                  isAppearanceTaskRunning={isGeneratingImage}
                  isAnyTaskRunning={false}
                  hasDescription={Boolean(asset.description)}
                  generationCount={characterGenCount}
                  onGenerationCountChange={setCharacterGenCount}
                  onGenerate={() => onGenerateImage()}
                  voiceSettings={<VoiceSettingsPanel adapter={voiceAdapter} />}
                />
              </div>
            </>
          ) : (
            /* 待确认状态 → 提示先确认档案 */
            <div className="px-4 pb-3 flex flex-col gap-3">
              <div className="rounded-lg bg-[var(--glass-bg-muted)] border border-dashed border-[var(--glass-stroke-strong)] p-3 flex flex-col items-center gap-2 text-center">
                <AppIcon name="userAlt" className="w-8 h-8 text-[var(--glass-text-tertiary)]" />
                <p className="text-xs text-[var(--glass-text-tertiary)]">
                  请先点击「确认并生成」生成角色形象描述，再进行图像生成
                </p>
              </div>
              {/* 角色专属操作按钮 */}
              <div className="flex gap-2 flex-wrap border-t border-[var(--glass-stroke-base)] pt-2">
                <button type="button" onClick={onEditProfile} disabled={isConfirmingProfile}
                  className="glass-btn-base glass-btn-secondary h-8 px-3 text-xs disabled:opacity-40">
                  编辑档案
                </button>
                <button type="button" onClick={() => onBindGlobal('character')} disabled={isConfirmingProfile}
                  className="glass-btn-base glass-btn-secondary h-8 px-3 text-xs disabled:opacity-40">
                  使用已有形象
                </button>
              </div>
              {/* 音色面板（角色，无论是否 profileConfirmed 都可操作） */}
              <div className="border-t border-[var(--glass-stroke-base)] pt-1">
                <VoiceSettingsPanel adapter={voiceAdapter} />
              </div>
            </div>
          )
        ) : (
          /* 场景 / 道具 */
          <>
            <LocationImageList
              mode="single"
              locationName={displayName}
              aspectClassName="aspect-video"
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
            <div className="px-4 pb-2 pt-1 flex gap-2 flex-wrap border-t border-[var(--glass-stroke-base)]">
              <button type="button" onClick={() => onBindGlobal(asset.kind as 'character' | 'location' | 'prop')} disabled={isConfirmingProfile}
                className="glass-btn-base glass-btn-secondary h-8 px-3 text-xs disabled:opacity-40">
                使用已有资产
              </button>
            </div>
            <div className="px-4 pb-2">
              <LocationCardActions
                mode="compact"
                currentImageUrl={currentImageUrl}
                isTaskRunning={isGeneratingImage}
                canGenerate={Boolean(asset.description)}
                generationCount={locationGenCount}
                onGenerationCountChange={setLocationGenCount}
                onGenerate={() => onGenerateImage()}
              />
            </div>
          </>
        )}

        {/* ── 底部操作栏 ─────────────────────────── */}
        <div className="flex items-center gap-2 px-4 pb-4 pt-3 border-t border-[var(--glass-stroke-base)]">
          <button
            type="button"
            onClick={onConfirmProfile}
            disabled={isConfirmingProfile}
            className="glass-btn-base glass-btn-primary h-8 px-3 text-xs disabled:opacity-40 flex items-center gap-1.5"
          >
            {isConfirmingProfile ? (
              <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />生成中…</>
            ) : (asset.description ? '重新生成描述' : '确认并生成')}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="glass-btn-base glass-btn-secondary h-8 px-4 text-xs disabled:opacity-40"
          >
            {isSaving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
    </>
  )
}
