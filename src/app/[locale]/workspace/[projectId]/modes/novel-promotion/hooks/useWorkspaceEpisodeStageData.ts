'use client'

import { useEpisodeData } from '@/lib/query/hooks'
import type { NovelPromotionClip, NovelPromotionStoryboard } from '@/types/project'
import { useWorkspaceProvider } from '../WorkspaceProvider'

interface EpisodeStagePayload {
  name?: string
  novelText?: string | null
  srtContent?: string | null
  shotListContent?: string | null
  scriptContent?: string | null
  clips?: NovelPromotionClip[]
  storyboards?: NovelPromotionStoryboard[]
}

export function useWorkspaceEpisodeStageData() {
  const { projectId, episodeId } = useWorkspaceProvider()
  const { data: episodeData } = useEpisodeData(projectId, episodeId || null)
  const payload = episodeData as EpisodeStagePayload | null

  return {
    episodeName: payload?.name,
    novelText: payload?.novelText || '',
    srtContent: payload?.srtContent || '',
    shotListContent: payload?.shotListContent || '',
    scriptContent: payload?.scriptContent || '',
    clips: payload?.clips || [],
    storyboards: payload?.storyboards || [],
  }
}
