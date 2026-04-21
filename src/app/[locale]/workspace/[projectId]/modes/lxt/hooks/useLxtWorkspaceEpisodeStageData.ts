'use client'

import { useLxtWorkspaceProvider } from '../LxtWorkspaceProvider'
import { useLxtEpisodeData } from './useLxtEpisodeData'

export function useLxtWorkspaceEpisodeStageData() {
  const { projectId, episodeId } = useLxtWorkspaceProvider()
  const { data: episode } = useLxtEpisodeData(projectId, episodeId || null)

  return {
    episodeName: episode?.name,
    novelText: episode?.novelText || '',
    srtContent: episode?.srtContent || '',
    shotListContent: episode?.shotListContent || '',
    scriptContent: episode?.scriptContent || '',
    finalFilmContent: episode?.finalFilmContent || '',
  }
}
