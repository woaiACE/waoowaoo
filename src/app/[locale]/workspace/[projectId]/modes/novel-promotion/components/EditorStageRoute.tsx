'use client'

import { useState, useEffect } from 'react'
import { useWorkspaceStageRuntime } from '../WorkspaceStageRuntimeContext'
import { useWorkspaceProvider } from '../WorkspaceProvider'
import { useWorkspaceEpisodeStageData } from '../hooks/useWorkspaceEpisodeStageData'
import { useEditorActions, createProjectFromPanels } from '@/features/video-editor/hooks/useEditorActions'
import { VideoEditorStage } from '@/features/video-editor/components/VideoEditorStage'
import { migrateProjectData, validateProjectData } from '@/features/video-editor/utils/migration'
import type { VideoEditorProject } from '@/features/video-editor/types/editor.types'

export default function EditorStageRoute() {
  const runtime = useWorkspaceStageRuntime()
  const { projectId, episodeId } = useWorkspaceProvider()
  const { storyboards } = useWorkspaceEpisodeStageData()
  const { loadProject } = useEditorActions({ projectId, episodeId: episodeId ?? '' })

  const [initialProject, setInitialProject] = useState<VideoEditorProject | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!episodeId) return

    const eid = episodeId // narrow to string for async closure
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const loaded = await loadProject()
        if (cancelled) return

        if (loaded) {
          // Apply migration as client-side safety net (server also migrates via B7)
          const migrated = migrateProjectData(loaded)
          const validation = validateProjectData(migrated)
          if (!validation.valid) {
            console.warn('[EditorStageRoute] projectData validation warnings:', validation.errors)
          }
          setInitialProject(migrated)
        } else {
          // No saved project — build initial timeline from video panels
          // Flatten all panels from storyboards, prefer lipSync url over videoUrl
          const panels = storyboards
            .flatMap((sb) =>
              (sb.panels ?? []).map((p) => ({
                id: p.id,
                storyboardId: sb.id,
                panelIndex: p.panelIndex,
                videoUrl: (p.lipSyncVideoUrl || p.videoUrl) ?? undefined,
                duration: p.duration ?? undefined,
              }))
            )
            .filter((p) => !!p.videoUrl)

          const project = createProjectFromPanels(eid, panels, undefined, runtime.videoRatio)
          setInitialProject(project)
        }
      } catch (err) {
        console.error('[EditorStageRoute] load failed', err)
        // Show editor with no initial project so user sees empty state
        setInitialProject(undefined)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
    // episodeId drives the load; storyboards intentionally excluded to avoid re-triggering once editor is open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId])

  if (!episodeId) return null

  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ color: 'var(--glass-text-secondary)' }}
      >
        <span>Loading editor…</span>
      </div>
    )
  }

  return (
    <VideoEditorStage
      projectId={projectId}
      episodeId={episodeId}
      initialProject={initialProject}
      storyboards={storyboards}
      onBack={() => runtime.onStageChange('videos')}
    />
  )
}
