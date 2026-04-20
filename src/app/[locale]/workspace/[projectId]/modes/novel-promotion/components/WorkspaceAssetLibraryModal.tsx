'use client'

import AssetLibraryShell from '@/components/shared/assets/AssetLibraryShell'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import type { TaskPresentationState } from '@/lib/task/presentation'
import AssetsStage from './AssetsStage'

interface WorkspaceAssetLibraryModalProps {
  isOpen: boolean
  onClose: () => void
  assetsLoading: boolean
  assetsLoadingState: TaskPresentationState | null
  hasCharacters: boolean
  hasLocations: boolean
  projectId: string
  isAnalyzingAssets: boolean
  focusCharacterId: string | null
  focusCharacterRequestId: number
  triggerGlobalAnalyze: boolean
  onGlobalAnalyzeComplete: () => void
}

export default function WorkspaceAssetLibraryModal({
  isOpen,
  onClose,
  assetsLoading,
  assetsLoadingState,
  hasCharacters,
  hasLocations,
  projectId,
  isAnalyzingAssets,
  focusCharacterId,
  focusCharacterRequestId,
  triggerGlobalAnalyze,
  onGlobalAnalyzeComplete,
}: WorkspaceAssetLibraryModalProps) {
  return (
    <AssetLibraryShell
      variant="modal"
      isOpen={isOpen}
      title="资产库"
      iconName="package"
      onClose={onClose}
      closeOnOverlayClick
      shellClassName="max-w-6xl h-[90vh]"
      contentClassName="flex-1 overflow-y-auto p-6 app-scrollbar"
    >
      <div data-asset-scroll-container="1">
        {assetsLoading && !hasCharacters && !hasLocations && (
          <div className="flex flex-col items-center justify-center h-64 text-[var(--glass-text-tertiary)] animate-pulse">
            <TaskStatusInline state={assetsLoadingState} className="text-base [&>span]:text-base" />
          </div>
        )}
        <AssetsStage
          projectId={projectId}
          isAnalyzingAssets={isAnalyzingAssets}
          focusCharacterId={focusCharacterId}
          focusCharacterRequestId={focusCharacterRequestId}
          triggerGlobalAnalyze={triggerGlobalAnalyze}
          onGlobalAnalyzeComplete={onGlobalAnalyzeComplete}
        />
      </div>
    </AssetLibraryShell>
  )
}
