import type {
  DirectorModeApiData,
  DirectorModeApiShotDetail,
  DirectorStageViewModel,
} from './director-mode.types'

function toArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function toText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function toNumberList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : []
}

function estimateDurationSeconds(hint: string) {
  const numbers = Array.from(hint.matchAll(/\d+(?:\.\d+)?/g)).map((match) => Number(match[0]))
  if (numbers.length === 0) return 0
  if (numbers.length === 1) return Math.round(numbers[0] || 0)
  const average = numbers.reduce((sum, value) => sum + value, 0) / numbers.length
  return Math.round(average)
}

function getShotDetailMap(details: DirectorModeApiData['shotDetails']) {
  const detailMap = new Map<string, DirectorModeApiShotDetail>()
  for (const scene of toArray(details)) {
    for (const shot of toArray(scene.shots)) {
      detailMap.set(`${scene.scene_id}:${shot.shot_number}`, shot)
    }
  }
  return detailMap
}

export function buildDirectorViewModel(data: DirectorModeApiData | null | undefined): DirectorStageViewModel | null {
  if (!data) return null

  const scenes = [...toArray(data.scenes)].sort((a, b) => (a.scene_number || 0) - (b.scene_number || 0))
  const storyboards = toArray(data.storyboards)
  const detailMap = getShotDetailMap(data.shotDetails)

  if (scenes.length === 0 && storyboards.length === 0 && detailMap.size === 0) {
    return null
  }

  const storyboardMap = new Map(storyboards.map((item) => [item.scene_id, item]))
  const sceneIds = scenes.length > 0
    ? scenes.map((scene) => scene.scene_id)
    : Array.from(new Set(storyboards.map((scene) => scene.scene_id)))

  const viewScenes = sceneIds.map((sceneId, index) => {
    const sceneMeta = scenes.find((item) => item.scene_id === sceneId)
    const storyboard = storyboardMap.get(sceneId)
    const storyboardShots = [...toArray(storyboard?.shots)].sort((a, b) => (a.shot_number || 0) - (b.shot_number || 0))

    const shots = storyboardShots.map((shot) => {
      const detail = detailMap.get(`${sceneId}:${shot.shot_number}`)
      const durationHint = toText(shot.duration_hint, '未标注')
      return {
        key: `${sceneId}:${shot.shot_number}`,
        shotNumber: shot.shot_number,
        shotType: toText(shot.shot_type, '未标注'),
        cameraAngle: toText(shot.camera_angle, '未标注'),
        cameraMovement: toText(shot.camera_movement, '未标注'),
        subject: toText(shot.subject, '未标注'),
        description: toText(shot.description, '暂无导演描述'),
        globalPosition: toText(detail?.global_position, ''),
        shotCaption: toText(detail?.shot_caption, toText(shot.voice_line, '')),
        sourceEvents: toNumberList(shot.from_events),
        voiceLine: toText(shot.voice_line, ''),
        voiceSpeaker: toText(detail?.voice_speaker ?? shot.voice_speaker, ''),
        durationHint,
        durationSeconds: estimateDurationSeconds(durationHint),
        imagePrompts: {
          lt: toText(detail?.image_prompt_lt, ''),
          rt: toText(detail?.image_prompt_rt, ''),
          lb: toText(detail?.image_prompt_lb, ''),
          rb: toText(detail?.image_prompt_rb, ''),
        },
        videoPrompt: toText(detail?.video_prompt, ''),
        soundEffect: toText(detail?.sound_effect, ''),
      }
    })

    return {
      sceneId,
      sceneNumber: sceneMeta?.scene_number || index + 1,
      time: toText(sceneMeta?.time, '未标注'),
      location: toText(sceneMeta?.location, '未标注场景'),
      characters: toArray(sceneMeta?.characters).filter((item): item is string => typeof item === 'string'),
      content: toText(sceneMeta?.content, ''),
      shotCount: shots.length,
      shots,
    }
  }).sort((a, b) => a.sceneNumber - b.sceneNumber)

  const totalDurationSeconds = viewScenes.reduce(
    (sum, scene) => sum + scene.shots.reduce((sceneSum, shot) => sceneSum + shot.durationSeconds, 0),
    0,
  )

  const uniqueCharacters = new Set(viewScenes.flatMap((scene) => scene.characters))
  const uniqueLocations = new Set(viewScenes.map((scene) => scene.location).filter(Boolean))

  return {
    runId: data.runId || null,
    status: data.status || null,
    generatedAt: data.generatedAt || null,
    summary: {
      sceneCount: viewScenes.length,
      shotCount: viewScenes.reduce((sum, scene) => sum + scene.shotCount, 0),
      totalDurationSeconds,
      characterCount: uniqueCharacters.size,
      locationCount: uniqueLocations.size,
    },
    scenes: viewScenes,
  }
}
