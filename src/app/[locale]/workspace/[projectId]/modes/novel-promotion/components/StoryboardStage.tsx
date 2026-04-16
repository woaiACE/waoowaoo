'use client'

import { useEffect, useMemo, useState } from 'react'
import StoryboardStageView from './storyboard'
import StoryboardStageShell from './storyboard/StoryboardStageShell'
import DirectorModeStageView from './director-mode/DirectorModeStageView'
import { useWorkspaceStageRuntime } from '../WorkspaceStageRuntimeContext'
import { useWorkspaceEpisodeStageData } from '../hooks/useWorkspaceEpisodeStageData'
import { useWorkspaceProvider } from '../WorkspaceProvider'

export default function StoryboardStage() {
  const runtime = useWorkspaceStageRuntime()
  const { projectId, episodeId } = useWorkspaceProvider()
  const { episodeName, clips, storyboards, directorModeData } = useWorkspaceEpisodeStageData()
  const hasDirectorModeResult = Boolean(
    directorModeData?.hasResults ||
    directorModeData?.scenes?.length ||
    directorModeData?.storyboards?.length ||
    directorModeData?.shotDetails?.length,
  )
  const hasStandardStoryboard = storyboards.length > 0
  const [viewMode, setViewMode] = useState<'director' | 'standard'>(hasDirectorModeResult ? 'director' : 'standard')
  const directorModeSignature = `${directorModeData?.runId || ''}:${directorModeData?.generatedAt || ''}:${hasDirectorModeResult ? '1' : '0'}`

  useEffect(() => {
    setViewMode(hasDirectorModeResult ? 'director' : 'standard')
  }, [directorModeSignature, hasDirectorModeResult])

  const modeSwitcher = useMemo(() => {
    if (!hasDirectorModeResult || !hasStandardStoryboard) return null

    return (
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-1 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setViewMode('director')}
          className={`rounded-xl px-3 py-2 text-sm ${viewMode === 'director' ? 'bg-emerald-500/15 text-emerald-200' : 'text-white/70'}`}
        >
          导演模式
        </button>
        <button
          type="button"
          onClick={() => setViewMode('standard')}
          className={`rounded-xl px-3 py-2 text-sm ${viewMode === 'standard' ? 'bg-white/10 text-white' : 'text-white/70'}`}
        >
          标准分镜
        </button>
      </div>
    )
  }, [hasDirectorModeResult, hasStandardStoryboard, viewMode])

  if (!episodeId) return null

  if (hasDirectorModeResult && viewMode === 'director') {
    return (
      <StoryboardStageShell
        isTransitioning={runtime.isTransitioning}
        isNextDisabled={runtime.isTransitioning}
        transitioningState={null}
        onNext={async () => runtime.onStageChange('videos')}
      >
        {modeSwitcher}
        <DirectorModeStageView
          episodeName={episodeName}
          data={directorModeData}
          onRerun={() => { void runtime.onRunDirectorMode() }}
          onJumpToVideos={() => { void runtime.onStageChange('videos') }}
        />
      </StoryboardStageShell>
    )
  }

  return (
    <StoryboardStageView
      projectId={projectId}
      episodeId={episodeId}
      storyboards={storyboards}
      clips={clips}
      videoRatio={runtime.videoRatio || '9:16'}
      onBack={() => runtime.onStageChange('script')}
      onNext={async () => runtime.onStageChange('videos')}
      isTransitioning={runtime.isTransitioning}
      headerSlot={modeSwitcher}
    />
  )
}
