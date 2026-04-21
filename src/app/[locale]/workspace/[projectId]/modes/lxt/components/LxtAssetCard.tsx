'use client'

import { useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import type { LxtProjectAsset } from '@/lib/query/hooks/useLxtAssets'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import VoiceSettingsPanel from '@/components/voice/VoiceSettingsPanel'
import { useLxtVoiceOpsAdapter } from '@/lib/query/hooks/useLxtVoiceOpsAdapter'
import { useImageGenerationCount } from '@/lib/image-generation/use-image-generation-count'
import { parseProfileData } from '@/types/character-profile'
import CharacterCardGallery from '../../novel-promotion/components/assets/character-card/CharacterCardGallery'
import CharacterCardActions from '../../novel-promotion/components/assets/character-card/CharacterCardActions'
import CharacterProfileCard from '../../novel-promotion/components/assets/CharacterProfileCard'
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
  onGenerateImage: (count?: number) => void
  isGeneratingImage: boolean
  // 多图选择
  onSelectImage: (imageUrl: string) => void
  // 档案生成流式进度（确认中显示）
  confirmingStreamText?: string
  // 编辑形象描述提示词（打开 LxtCharacterEditModal）
  onEditDescription?: () => void
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
  onSelectImage,
  confirmingStreamText = '',
  onEditDescription,
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
  const parsedProfileData = isCharacter ? parseProfileData(asset.profileData ?? null) : null
  // 角色卡：只有 profileConfirmed=true（描述已生成）后才展示图像生成区
  const showImageArea = asset.profileConfirmed

  return (
    <>
      {isCharacter && showImageArea ? (
        /* ── 已确认角色：对齐通用版简洁布局 ─────────────────── */
        (() => {
          // Parse multi-image URLs
          const parsedImageUrls: string[] = asset.imageUrls
            ? (JSON.parse(asset.imageUrls) as (string | null)[]).filter((u): u is string => Boolean(u))
            : []
          const hasMultipleImages = parsedImageUrls.length > 1
          const selectedIndex = hasMultipleImages
            ? parsedImageUrls.indexOf(currentImageUrl ?? '')
            : null

          return (
            <div className="flex flex-col glass-surface overflow-hidden">
              {/* 角色名称行 */}
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <div>
                  <div className="text-sm font-semibold text-[var(--glass-text-primary)]">{displayName}</div>
                  <div className="text-xs text-[var(--glass-text-secondary)] mt-0.5">初始形象</div>
                </div>
                <div className="flex items-center gap-1">
                  {onEditDescription && (
                    <button
                      type="button"
                      onClick={onEditDescription}
                      className="w-7 h-7 rounded flex items-center justify-center text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)] transition-colors"
                      title="编辑描述"
                    >
                      <AppIcon name="edit" className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="w-7 h-7 rounded flex items-center justify-center text-[var(--glass-text-tertiary)] hover:text-[var(--glass-tone-danger-fg)] hover:bg-[var(--glass-tone-danger-bg)] transition-colors disabled:opacity-40"
                    title="删除"
                  >
                    <AppIcon name="trash" className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Gallery: multi-image selection or single */}
              {hasMultipleImages ? (
                <div className="px-3 pb-1">
                  <CharacterCardGallery
                    mode="selection"
                    characterId={asset.id}
                    appearanceId={asset.id}
                    characterName={displayName}
                    imageUrlsWithIndex={parsedImageUrls.map((url, i) => ({ url, originalIndex: i }))}
                    selectedIndex={selectedIndex}
                    isGroupTaskRunning={isGeneratingImage}
                    isImageTaskRunning={() => isGeneratingImage}
                    displayTaskPresentation={imageTaskState}
                    onImageClick={setPreviewImage}
                    onSelectImage={(_charId, _appId, index) => {
                      if (index !== null && parsedImageUrls[index]) {
                        onSelectImage(parsedImageUrls[index])
                      }
                    }}
                  />
                </div>
              ) : (
                <CharacterCardGallery
                  mode="single"
                  characterName={displayName}
                  changeReason={displaySummary || '初始形象'}
                  aspectClassName="aspect-[3/4]"
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
                      onClick={() => onGenerateImage(characterGenCount)}
                      disabled={isGeneratingImage || isConfirmingProfile}
                      className="w-7 h-7 rounded-full bg-[var(--glass-bg-surface-strong)] hover:bg-[var(--glass-bg-surface)] flex items-center justify-center transition-all shadow-sm disabled:opacity-50"
                      title="重新生成"
                    >
                      <AppIcon name="refresh" className="w-4 h-4 text-[var(--glass-text-secondary)]" />
                    </button>
                  }
                />
              )}

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
                  onGenerate={(count) => onGenerateImage(count)}
                  voiceSettings={<VoiceSettingsPanel adapter={voiceAdapter} />}
                />
              </div>
            </div>
          )
        })()      ) : !isCharacter && asset.profileConfirmed ? (
        /* ── 已确认场景/道具：对齐通用版简洁布局 ─────────────────── */
        <div className="flex flex-col glass-surface overflow-hidden">
          {/* 名称行 */}
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <div>
              <div className="text-sm font-semibold text-[var(--glass-text-primary)]">{displayName}</div>
              <div className="text-xs text-[var(--glass-text-secondary)] mt-0.5">{KIND_LABELS[asset.kind] ?? asset.kind}</div>
            </div>
            <div className="flex items-center gap-1">
              {onEditDescription && (
                <button
                  type="button"
                  onClick={onEditDescription}
                  className="w-7 h-7 rounded flex items-center justify-center text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)] transition-colors"
                  title="编辑描述"
                >
                  <AppIcon name="edit" className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting}
                className="w-7 h-7 rounded flex items-center justify-center text-[var(--glass-text-tertiary)] hover:text-[var(--glass-tone-danger-fg)] hover:bg-[var(--glass-tone-danger-bg)] transition-colors disabled:opacity-40"
                title="删除"
              >
                <AppIcon name="trash" className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 图像区域 */}
          <LocationImageList
            mode="single"
            locationName={displayName}
            aspectClassName={asset.kind === 'prop' ? 'aspect-[3/2]' : 'aspect-square'}
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
                onClick={() => onGenerateImage(locationGenCount)}
                disabled={isGeneratingImage}
                className="w-7 h-7 rounded-full bg-[var(--glass-bg-surface-strong)] hover:bg-[var(--glass-bg-surface)] flex items-center justify-center transition-all shadow-sm disabled:opacity-50"
                title="重新生成"
              >
                <AppIcon name="refresh" className="w-4 h-4 text-[var(--glass-text-secondary)]" />
              </button>
            }
          />

          {/* 操作栏：无图时显示生成按钮 */}
          <div className="px-4 pb-2 pt-1">
            <LocationCardActions
              mode="compact"
              currentImageUrl={currentImageUrl}
              isTaskRunning={isGeneratingImage}
              canGenerate={true}
              generationCount={locationGenCount}
              onGenerationCountChange={setLocationGenCount}
              onGenerate={(count) => onGenerateImage(count ?? locationGenCount)}
            />
          </div>
        </div>      ) : (
        /* ── 未确认角色 / 场景 / 道具：完整编辑布局 ─────────── */
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
            /* 待确认状态 → 提示先确认档案 */
            <div className="px-4 pb-3 flex flex-col gap-3">
              {parsedProfileData ? (
                <CharacterProfileCard
                  characterId={asset.id}
                  name={displayName}
                  profileData={parsedProfileData}
                  onEdit={onEditProfile}
                  onConfirm={onConfirmProfile}
                  onUseExisting={() => onBindGlobal('character')}
                  isConfirming={isConfirmingProfile}
                />
              ) : (
                <>
                  {/* 无档案占位 / 流式进度 */}
                  {isConfirmingProfile && confirmingStreamText ? (
                    <div className="rounded-lg bg-[var(--glass-bg-muted)] border border-[var(--glass-stroke-base)] p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-3 h-3 border-2 border-sky-400/40 border-t-sky-400 rounded-full animate-spin" />
                        <span className="text-xs font-medium text-sky-400">形象描述生成中…</span>
                      </div>
                      <p className="text-xs text-[var(--glass-text-secondary)] leading-relaxed font-mono whitespace-pre-wrap line-clamp-5">{confirmingStreamText}</p>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-[var(--glass-bg-muted)] border border-dashed border-[var(--glass-stroke-strong)] p-3 flex flex-col items-center gap-2 text-center">
                      <AppIcon name="userAlt" className="w-8 h-8 text-[var(--glass-text-tertiary)]" />
                      <p className="text-xs text-[var(--glass-text-tertiary)]">
                        请先点击「确认并生成」生成角色形象描述，再进行图像生成
                      </p>
                    </div>
                  )}
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
                </>
              )}
              {/* 音色面板（角色，无论是否 profileConfirmed 都可操作） */}
              <div className="border-t border-[var(--glass-stroke-base)] pt-1">
                <VoiceSettingsPanel adapter={voiceAdapter} />
              </div>
            </div>
          ) : (
            /* 场景 / 道具 - 待确认 */
            <>
              {/* 流式进度 / 占位 */}
              {isConfirmingProfile && confirmingStreamText ? (
                <div className="mx-4 mb-1">
                  <div className="rounded-lg bg-[var(--glass-bg-muted)] border border-[var(--glass-stroke-base)] p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-3 h-3 border-2 border-sky-400/40 border-t-sky-400 rounded-full animate-spin" />
                      <span className="text-xs font-medium text-sky-400">形象描述生成中…</span>
                    </div>
                    <p className="text-xs text-[var(--glass-text-secondary)] leading-relaxed font-mono whitespace-pre-wrap line-clamp-5">{confirmingStreamText}</p>
                  </div>
                </div>
              ) : (
                <div className="mx-4 mb-1">
                  <div className="rounded-lg bg-[var(--glass-bg-muted)] border border-dashed border-[var(--glass-stroke-strong)] p-3 flex flex-col items-center gap-2 text-center">
                    <AppIcon name="imageLandscape" className="w-8 h-8 text-[var(--glass-text-tertiary)]" />
                    <p className="text-xs text-[var(--glass-text-tertiary)]">
                      请先点击「确认并生成」生成{KIND_LABELS[asset.kind] ?? '资产'}视觉描述，再进行图像生成
                    </p>
                  </div>
                </div>
              )}
              <div className="flex gap-2 flex-wrap border-t border-[var(--glass-stroke-base)] mx-4 pt-2 mb-1">
                <button type="button" onClick={() => onBindGlobal(asset.kind as 'character' | 'location' | 'prop')} disabled={isConfirmingProfile}
                  className="glass-btn-base glass-btn-secondary h-8 px-3 text-xs disabled:opacity-40">
                  使用已有资产
                </button>
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
      )}
    {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
    </>
  )
}
