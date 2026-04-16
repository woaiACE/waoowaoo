export interface DirectorModeApiScene {
  scene_id: string
  scene_number: number
  time: string
  location: string
  characters: string[]
  start_text?: string
  end_text?: string
  content?: string
}

export interface DirectorModeApiStoryboardShot {
  shot_number: number
  shot_type?: string
  camera_angle?: string
  camera_movement?: string
  subject?: string
  description?: string
  from_events?: number[]
  voice_line?: string | null
  voice_speaker?: string | null
  duration_hint?: string
}

export interface DirectorModeApiSceneStoryboard {
  scene_id: string
  shots: DirectorModeApiStoryboardShot[]
}

export interface DirectorModeApiShotDetail {
  shot_number: number
  global_position?: string
  shot_caption?: string
  image_prompt_lt?: string
  image_prompt_rt?: string
  image_prompt_lb?: string
  image_prompt_rb?: string
  video_prompt?: string
  sound_effect?: string
  voice_speaker?: string | null
}

export interface DirectorModeApiSceneShotDetails {
  scene_id: string
  shots: DirectorModeApiShotDetail[]
}

export interface DirectorModeApiData {
  runId?: string | null
  status?: string | null
  generatedAt?: string | null
  hasResults?: boolean
  scenes?: DirectorModeApiScene[]
  storyboards?: DirectorModeApiSceneStoryboard[]
  shotDetails?: DirectorModeApiSceneShotDetails[]
}

export interface DirectorShotViewModel {
  key: string
  shotNumber: number
  shotType: string
  cameraAngle: string
  cameraMovement: string
  subject: string
  description: string
  globalPosition: string
  shotCaption: string
  sourceEvents: number[]
  voiceLine: string
  voiceSpeaker: string
  durationHint: string
  durationSeconds: number
  imagePrompts: {
    lt: string
    rt: string
    lb: string
    rb: string
  }
  videoPrompt: string
  soundEffect: string
}

export interface DirectorSceneViewModel {
  sceneId: string
  sceneNumber: number
  time: string
  location: string
  characters: string[]
  content: string
  shotCount: number
  shots: DirectorShotViewModel[]
}

export interface DirectorStageViewModel {
  runId: string | null
  status: string | null
  generatedAt: string | null
  summary: {
    sceneCount: number
    shotCount: number
    totalDurationSeconds: number
    characterCount: number
    locationCount: number
  }
  scenes: DirectorSceneViewModel[]
}
