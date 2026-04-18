'use client'

import ConfigStage from './ConfigStage'
import ScriptStage from './ScriptStage'
import StoryboardStage from './StoryboardStage'
import VideoStageRoute from './VideoStageRoute'
import VoiceStageRoute from './VoiceStageRoute'
import EditorStageRoute from './EditorStageRoute'
import LxtScriptStage from './LxtScriptStage'
import LxtStoryboardStage from './LxtStoryboardStage'
import LxtFinalScriptStage from './LxtFinalScriptStage'

interface WorkspaceStageContentProps {
  currentStage: string
}

export default function WorkspaceStageContent({
  currentStage,
}: WorkspaceStageContentProps) {
  return (
    <div key={currentStage} className="animate-page-enter">
      {currentStage === 'config' && <ConfigStage />}

      {(currentStage === 'script' || currentStage === 'assets') && <ScriptStage />}

      {currentStage === 'storyboard' && <StoryboardStage />}

      {currentStage === 'videos' && <VideoStageRoute />}

      {currentStage === 'voice' && <VoiceStageRoute />}

      {currentStage === 'editor' && <EditorStageRoute />}

      {currentStage === 'lxt-script' && <LxtScriptStage />}

      {currentStage === 'lxt-storyboard' && <LxtStoryboardStage />}

      {currentStage === 'lxt-final-script' && <LxtFinalScriptStage />}
    </div>
  )
}
