import { VideoClip, ComputedClip, VideoEditorProject } from '../types/editor.types'

/**
 * 计算时间轴总时长 (帧数)
 * 考虑转场重叠
 */
export function calculateTimelineDuration(clips: VideoClip[]): number {
    if (clips.length === 0) return 0

    return clips.reduce((total, clip, index) => {
        let duration = clip.durationInFrames

        // 最后一个片段不减去转场时间
        if (index < clips.length - 1 && clip.transition) {
            // 转场会让总时长减少（重叠部分）
            duration -= Math.floor(clip.transition.durationInFrames / 2)
        }

        return total + duration
    }, 0)
}

/**
 * 计算每个片段的起始帧位置
 * 用于渲染和 UI 显示
 */
export function computeClipPositions(clips: VideoClip[]): ComputedClip[] {
    let currentFrame = 0

    return clips.map((clip, index) => {
        const startFrame = currentFrame
        const endFrame = startFrame + clip.durationInFrames

        // 计算下一个片段的起始位置（考虑转场重叠）
        if (clip.transition && index < clips.length - 1) {
            currentFrame = endFrame - Math.floor(clip.transition.durationInFrames / 2)
        } else {
            currentFrame = endFrame
        }

        return {
            ...clip,
            startFrame,
            endFrame
        }
    })
}

/**
 * 帧数转时间字符串
 */
export function framesToTime(frames: number, fps: number): string {
    const totalSeconds = frames / fps
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = Math.floor(totalSeconds % 60)
    const milliseconds = Math.floor((totalSeconds % 1) * 100)

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`
}

/**
 * 时间字符串转帧数
 */
export function timeToFrames(time: string, fps: number): number {
    const [minSec, ms] = time.split('.')
    const [minutes, seconds] = minSec.split(':').map(Number)
    const totalSeconds = minutes * 60 + seconds + (parseInt(ms || '0') / 100)
    return Math.round(totalSeconds * fps)
}

/**
 * 生成唯一 ID
 */
export function generateClipId(): string {
    return `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 将宽高比字符串转换为像素尺寸
 */
export function ratioToSize(ratio?: string | null): { width: number; height: number } {
    if (ratio === '9:16') return { width: 1080, height: 1920 }
    if (ratio === '1:1')  return { width: 1080, height: 1080 }
    if (ratio === '4:3')  return { width: 1440, height: 1080 }
    if (ratio === '3:4')  return { width: 1080, height: 1440 }
    return { width: 1920, height: 1080 } // 默认 16:9
}

/**
 * 创建默认编辑器项目
 */
export function createDefaultProject(episodeId: string, videoRatio?: string | null): VideoEditorProject {
    const { width, height } = ratioToSize(videoRatio)
    return {
        id: `editor_${Date.now()}`,
        episodeId,
        schemaVersion: '1.0',
        config: {
            fps: 30,
            width,
            height
        },
        timeline: [],
        bgmTrack: []
    }
}
