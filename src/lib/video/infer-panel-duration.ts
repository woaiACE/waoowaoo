/**
 * 根据台词音频时长和镜头类型自动推算视频时长建议值（秒）
 *
 * 规则：
 * 1. 台词总音频时长（audioDuration ms） + 0.5s 缓冲
 * 2. 按 shotType 的最短时长兜底（特写最短 2s，全景最短 4s）
 * 3. LLM 在分镜时写入的 panel.duration 作为参考下限
 * 取三者最大值，确保视频不会在台词说完前结束
 */

const SHOT_TYPE_MIN_DURATION: Record<string, number> = {
  extreme_close_up: 2,
  close_up: 2,
  medium_close_up: 3,
  medium: 3,
  medium_wide: 3,
  wide: 4,
  full: 4,
  establishing: 5,
  aerial: 5,
  over_the_shoulder: 3,
  pov: 3,
  insert: 2,
}

const DEFAULT_MIN_DURATION = 3

export function inferPanelVideoDuration(
  panel: {
    shotType?: string | null
    duration?: number | null
  },
  voiceLines: { audioDuration?: number | null }[],
): number {
  // 台词总时长（ms → s）+ 缓冲
  const totalVoiceMs = voiceLines.reduce((sum, vl) => sum + (vl.audioDuration ?? 0), 0)
  const voiceBased = totalVoiceMs > 0 ? totalVoiceMs / 1000 + 0.5 : 0

  // 按镜头类型的最短时长
  const shotKey = (panel.shotType ?? '').toLowerCase().replace(/\s+/g, '_')
  const minByShot = SHOT_TYPE_MIN_DURATION[shotKey] ?? DEFAULT_MIN_DURATION

  // LLM 写入的分镜建议时长
  const storyboardSuggested = typeof panel.duration === 'number' ? panel.duration : 0

  const inferred = Math.max(voiceBased, minByShot, storyboardSuggested)

  // 四舍五入到 0.5s 粒度，最多 15s（视频模型上限）
  return Math.min(Math.round(inferred * 2) / 2, 15)
}
