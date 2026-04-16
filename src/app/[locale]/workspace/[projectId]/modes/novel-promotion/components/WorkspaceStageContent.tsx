'use client'

import ConfigStage from './ConfigStage'
import ScriptStage from './ScriptStage'
import StoryboardStage from './StoryboardStage'
import VideoStageRoute from './VideoStageRoute'
import VoiceStageRoute from './VoiceStageRoute'
import EditorStageRoute from './EditorStageRoute'
import { IpCastingPanel } from '@/components/ip-mode'

interface WorkspaceStageContentProps {
  currentStage: string
  projectId: string
  ipModeEnabled: boolean
}

export default function WorkspaceStageContent({
  currentStage,
  projectId,
  ipModeEnabled,
}: WorkspaceStageContentProps) {
  return (
    <div key={currentStage} className="animate-page-enter">
      {currentStage === 'config' && <ConfigStage />}
      {currentStage === 'config' && ipModeEnabled && (
        <div className="max-w-4xl mx-auto px-4 pb-8">
          <IpCastingPanel projectId={projectId} />
        </div>
      )}

      {(currentStage === 'script' || currentStage === 'assets') && <ScriptStage />}

      {currentStage === 'storyboard' && <StoryboardStage />}

      {currentStage === 'videos' && <VideoStageRoute />}

      {currentStage === 'voice' && <VoiceStageRoute />}

      {currentStage === 'editor' && <EditorStageRoute />}
    </div>
  )
}
