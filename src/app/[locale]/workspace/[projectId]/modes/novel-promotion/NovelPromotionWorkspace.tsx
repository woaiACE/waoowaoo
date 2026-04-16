'use client'

import ProgressToast from '@/components/ProgressToast'
import ConfirmDialog from '@/components/ConfirmDialog'
import { AnimatedBackground } from '@/components/ui/SharedComponents'
import { useTranslations } from 'next-intl'
import { useState, useCallback } from 'react'
import { WorkspaceProvider } from './WorkspaceProvider'
import WorkspaceRunStreamConsoles from './components/WorkspaceRunStreamConsoles'
import WorkspaceStageContent from './components/WorkspaceStageContent'
import WorkspaceAssetLibraryModal from './components/WorkspaceAssetLibraryModal'
import WorkspaceHeaderShell from './components/WorkspaceHeaderShell'
import { WorkspaceStageRuntimeProvider } from './WorkspaceStageRuntimeContext'
import { useNovelPromotionWorkspaceController } from './hooks/useNovelPromotionWorkspaceController'
import type { NovelPromotionWorkspaceProps } from './types'
import { apiFetch } from '@/lib/api-fetch'
import '@/styles/animations.css'

function NovelPromotionWorkspaceContent(props: NovelPromotionWorkspaceProps) {
  const vm = useNovelPromotionWorkspaceController(props)
  const tProgress = useTranslations('progress')

  const {
    project,
    projectId,
    episodeId,
    episodes = [],
    onEpisodeSelect,
    onEpisodeCreate,
    onEpisodeRename,
    onEpisodeDelete,
  } = props

  // IP 模式状态：以 project 数据为初始值，支持乐观更新（必须在所有 early return 前声明）
  const [ipModeEnabled, setIpModeEnabled] = useState<boolean>(vm.project.ipModeEnabled)
  const handleIpModeToggle = useCallback(async (enabled: boolean) => {
    const prev = ipModeEnabled
    setIpModeEnabled(enabled)
    try {
      const endpoint = enabled ? 'enable' : 'disable'
      const res = await apiFetch(`/api/novel-promotion/${projectId}/ip/${endpoint}`, { method: 'POST' })
      if (!res.ok) throw new Error('toggle failed')
    } catch {
      setIpModeEnabled(prev)
    }
  }, [ipModeEnabled, projectId])

  const storyToScriptStream = vm.execution.storyToScriptStream
  const scriptToStoryboardStream = vm.execution.scriptToStoryboardStream
  const directorModeStream = vm.execution.directorModeStream
  const storyToScriptActive =
    storyToScriptStream.isRunning ||
    storyToScriptStream.isRecoveredRunning ||
    storyToScriptStream.status === 'running'
  const scriptToStoryboardActive =
    scriptToStoryboardStream.isRunning ||
    scriptToStoryboardStream.isRecoveredRunning ||
    scriptToStoryboardStream.status === 'running'
  const directorModeActive =
    directorModeStream.isRunning ||
    directorModeStream.isRecoveredRunning ||
    directorModeStream.status === 'running'

  const showStoryToScriptMinBadge =
    storyToScriptStream.isVisible &&
    storyToScriptActive &&
    vm.execution.storyToScriptConsoleMinimized

  const showScriptToStoryboardMinBadge =
    scriptToStoryboardStream.isVisible &&
    scriptToStoryboardActive &&
    vm.execution.scriptToStoryboardConsoleMinimized

  const showDirectorModeMinBadge =
    directorModeStream.isVisible &&
    directorModeActive &&
    vm.execution.directorModeConsoleMinimized

  const runBadges: { id: string; label: string; onClick: () => void }[] = []

  if (showStoryToScriptMinBadge) {
    runBadges.push({
      id: 'story-to-script',
      label: tProgress('runConsole.storyToScriptRunning'),
      onClick: () => vm.execution.setStoryToScriptConsoleMinimized(false),
    })
  }

  if (showScriptToStoryboardMinBadge) {
    runBadges.push({
      id: 'script-to-storyboard',
      label: tProgress('runConsole.scriptToStoryboardRunning'),
      onClick: () => vm.execution.setScriptToStoryboardConsoleMinimized(false),
    })
  }

  if (showDirectorModeMinBadge) {
    runBadges.push({
      id: 'director-mode',
      label: tProgress('runConsole.directorModeRunning'),
      onClick: () => vm.execution.setDirectorModeConsoleMinimized(false),
    })
  }

  if (!vm.project.projectData) {
    return <div className="text-center text-(--glass-text-secondary)">{vm.i18n.tc('loading')}</div>
  }

  return (
    <div>
      <AnimatedBackground />

      <WorkspaceHeaderShell
        isSettingsModalOpen={vm.ui.isSettingsModalOpen}
        isWorldContextModalOpen={vm.ui.isWorldContextModalOpen}
        onCloseSettingsModal={() => vm.ui.setIsSettingsModalOpen(false)}
        onCloseWorldContextModal={() => vm.ui.setIsWorldContextModalOpen(false)}
        availableModels={vm.ui.userModelsForSettings || undefined}
        modelsLoaded={vm.ui.userModelsLoaded}
        artStyle={vm.project.artStyle}
        analysisModel={vm.project.analysisModel}
        characterModel={vm.project.characterModel}
        locationModel={vm.project.locationModel}
        storyboardModel={vm.project.storyboardModel}
        editModel={vm.project.editModel}
        videoModel={vm.project.videoModel}
        audioModel={vm.project.audioModel}
        capabilityOverrides={vm.project.capabilityOverrides}
        videoRatio={vm.project.videoRatio}
        ttsRate={vm.project.ttsRate !== undefined && vm.project.ttsRate !== null ? String(vm.project.ttsRate) : undefined}
        onUpdateConfig={vm.actions.handleUpdateConfig}
        globalAssetText={vm.project.globalAssetText}
        projectName={project.name}
        episodes={episodes}
        currentEpisodeId={episodeId}
        onEpisodeSelect={onEpisodeSelect}
        onEpisodeCreate={onEpisodeCreate}
        onEpisodeRename={onEpisodeRename}
        onEpisodeDelete={onEpisodeDelete}
        capsuleNavItems={vm.stageNav.capsuleNavItems}
        currentStage={vm.stageNav.currentStage}
        onStageChange={vm.stageNav.handleStageChange}
        projectId={projectId}
        episodeId={episodeId}
        onOpenAssetLibrary={() => vm.ui.openAssetLibrary()}
        onOpenSettingsModal={() => vm.ui.setIsSettingsModalOpen(true)}
        onRefresh={() => vm.ui.onRefresh({ mode: 'full' })}
        assetLibraryLabel={vm.i18n.t('buttons.assetLibrary')}
        settingsLabel={vm.i18n.t('buttons.settings')}
        refreshTitle={vm.i18n.t('buttons.refreshData')}
        ipModeEnabled={ipModeEnabled}
        onIpModeToggle={handleIpModeToggle}
      />

      <div className="pt-24">
        <WorkspaceStageRuntimeProvider value={vm.runtime.stageRuntime}>
          <WorkspaceStageContent
            currentStage={vm.stageNav.currentStage}
            projectId={projectId}
            ipModeEnabled={ipModeEnabled}
          />
        </WorkspaceStageRuntimeProvider>

        <WorkspaceAssetLibraryModal
          isOpen={vm.ui.isAssetLibraryOpen}
          onClose={vm.ui.closeAssetLibrary}
          assetsLoading={vm.ui.assetsLoading}
          assetsLoadingState={vm.ui.assetsLoadingState}
          hasCharacters={vm.project.projectCharacters.length > 0}
          hasLocations={vm.project.projectLocations.length > 0}
          projectId={projectId}
          isAnalyzingAssets={vm.execution.isAssetAnalysisRunning}
          focusCharacterId={vm.ui.assetLibraryFocusCharacterId}
          focusCharacterRequestId={vm.ui.assetLibraryFocusRequestId}
          triggerGlobalAnalyze={vm.ui.triggerGlobalAnalyzeOnOpen}
          onGlobalAnalyzeComplete={() => vm.ui.setTriggerGlobalAnalyzeOnOpen(false)}
        />

        {vm.execution.showCreatingToast && (
          <ProgressToast
            show
            message={vm.i18n.t('storyInput.creating')}
            step={vm.execution.transitionProgress.step || ''}
            runBadges={runBadges}
          />
        )}

        <ConfirmDialog
          show={vm.rebuild.showRebuildConfirm}
          type="warning"
          title={vm.rebuild.rebuildConfirmTitle}
          message={vm.rebuild.rebuildConfirmMessage}
          confirmText={vm.i18n.t('rebuildConfirm.confirm')}
          cancelText={vm.i18n.t('rebuildConfirm.cancel')}
          onConfirm={vm.rebuild.handleAcceptRebuildConfirm}
          onCancel={vm.rebuild.handleCancelRebuildConfirm}
        />

        <WorkspaceRunStreamConsoles
          storyToScriptStream={vm.execution.storyToScriptStream}
          scriptToStoryboardStream={vm.execution.scriptToStoryboardStream}
          directorModeStream={vm.execution.directorModeStream}
          storyToScriptConsoleMinimized={vm.execution.storyToScriptConsoleMinimized}
          scriptToStoryboardConsoleMinimized={vm.execution.scriptToStoryboardConsoleMinimized}
          directorModeConsoleMinimized={vm.execution.directorModeConsoleMinimized}
          onStoryToScriptMinimizedChange={vm.execution.setStoryToScriptConsoleMinimized}
          onScriptToStoryboardMinimizedChange={vm.execution.setScriptToStoryboardConsoleMinimized}
          onDirectorModeMinimizedChange={vm.execution.setDirectorModeConsoleMinimized}
          hideMinimizedBadges={vm.execution.showCreatingToast}
        />
      </div>
    </div>
  )
}

export default function NovelPromotionWorkspace(props: NovelPromotionWorkspaceProps) {
  const { projectId, episodeId } = props
  return (
    <WorkspaceProvider projectId={projectId} episodeId={episodeId}>
      <NovelPromotionWorkspaceContent {...props} />
    </WorkspaceProvider>
  )
}
