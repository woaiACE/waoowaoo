'use client'

import EditorStage from './editor/EditorStage'
import { useWorkspaceStageRuntime } from '../WorkspaceStageRuntimeContext'
import { useWorkspaceEpisodeStageData } from '../hooks/useWorkspaceEpisodeStageData'
import { useWorkspaceProvider } from '../WorkspaceProvider'
import type { Clip } from './video'

export default function EditorStageRoute() {
  const runtime = useWorkspaceStageRuntime()
  const { projectId, episodeId } = useWorkspaceProvider()
  const { clips, storyboards, voiceLines } = useWorkspaceEpisodeStageData()

  const normalizedClips: Clip[] = clips.map((clip) => ({
    id: clip.id,
    start: clip.start ?? 0,
    end: clip.end ?? 0,
    summary: clip.summary,
  }))

  if (!episodeId) return null

  return (
    <EditorStage
      projectId={projectId}
      episodeId={episodeId}
      clips={normalizedClips}
      storyboards={storyboards}
      voiceLines={voiceLines}
      onBack={() => runtime.onStageChange('videos')}
    />
  )
}
