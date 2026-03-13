'use client'

import { useEpisodeData } from '@/lib/query/hooks'
import type { NovelPromotionClip, NovelPromotionStoryboard } from '@/types/project'
import { useWorkspaceProvider } from '../WorkspaceProvider'

import type { VoiceLine } from '@/lib/query/hooks/useVoiceLines'

interface EpisodeStagePayload {
  name?: string
  novelText?: string | null
  clips?: NovelPromotionClip[]
  storyboards?: NovelPromotionStoryboard[]
  voiceLines?: VoiceLine[]
}

export function useWorkspaceEpisodeStageData() {
  const { projectId, episodeId } = useWorkspaceProvider()
  const { data: episodeData } = useEpisodeData(projectId, episodeId || null)
  const payload = episodeData as EpisodeStagePayload | null

  return {
    episodeName: payload?.name,
    novelText: payload?.novelText || '',
    clips: payload?.clips || [],
    storyboards: payload?.storyboards || [],
    voiceLines: payload?.voiceLines || [],
  }
}
