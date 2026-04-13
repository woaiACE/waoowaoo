import React from 'react'
import { AbsoluteFill, Sequence, Video, Audio, useCurrentFrame, interpolate } from 'remotion'
import { VideoClip, BgmClip, EditorConfig, ClipAttachment } from '../types/editor.types'
import { computeClipPositions } from '../utils/time-utils'

interface VideoCompositionProps {
    clips: VideoClip[]
    bgmTrack: BgmClip[]
    config: EditorConfig
}

/**
 * Remotion 主合成组件
 * 使用 Sequence 实现磁性时间轴布局，支持转场效果
 */
export const VideoComposition: React.FC<VideoCompositionProps> = ({
    clips,
    bgmTrack,
    config
}) => {
    const computedClips = computeClipPositions(clips)

    return (
        <AbsoluteFill style={{ backgroundColor: 'black' }}>
            {/* 视频轨道 - 带转场效果 */}
            {computedClips.map((clip, index) => {
                const transitionDuration = clip.transition?.durationInFrames || 0

                return (
                    <Sequence
                        key={clip.id}
                        from={clip.startFrame}
                        durationInFrames={clip.durationInFrames}
                        name={`Clip ${index + 1}`}
                    >
                        <ClipRenderer
                            clip={clip}
                            config={config}
                            transitionType={clip.transition?.type}
                            transitionDuration={transitionDuration}
                            isLastClip={index === computedClips.length - 1}
                        />
                    </Sequence>
                )
            })}

            {/* BGM 轨道 */}
            {bgmTrack.map((bgm) => (
                <Sequence
                    key={bgm.id}
                    from={bgm.startFrame}
                    durationInFrames={bgm.durationInFrames}
                    name={`BGM: ${bgm.id}`}
                >
                    <BgmRenderer bgm={bgm} />
                </Sequence>
            ))}
        </AbsoluteFill>
    )
}

/**
 * BGM 渲染器 - 支持淡入淡出
 */
interface BgmRendererProps {
    bgm: BgmClip
}

const BgmRenderer: React.FC<BgmRendererProps> = ({ bgm }) => {
    const frame = useCurrentFrame()
    const fadeIn = bgm.fadeIn || 0
    const fadeOut = bgm.fadeOut || 0

    let volume = bgm.volume

    // 淡入
    if (fadeIn > 0 && frame < fadeIn) {
        volume *= interpolate(frame, [0, fadeIn], [0, 1], { extrapolateRight: 'clamp' })
    }

    // 淡出
    if (fadeOut > 0 && frame > bgm.durationInFrames - fadeOut) {
        volume *= interpolate(
            frame,
            [bgm.durationInFrames - fadeOut, bgm.durationInFrames],
            [1, 0],
            { extrapolateLeft: 'clamp' }
        )
    }

    return <Audio src={bgm.src} volume={volume} />
}

/**
 * 单个片段渲染器 - 支持转场效果
 */
interface ClipRendererProps {
    clip: VideoClip & { startFrame: number; endFrame: number }
    config: EditorConfig
    transitionType?: 'none' | 'dissolve' | 'fade' | 'slide'
    transitionDuration: number
    isLastClip: boolean
}

const ClipRenderer: React.FC<ClipRendererProps> = ({
    clip,
    config,
    transitionType = 'none',
    transitionDuration,
    isLastClip
}) => {
    void config
    const frame = useCurrentFrame()
    const clipDuration = clip.durationInFrames

    // 计算转场效果
    let opacity = 1
    let transform = 'none'

    if (transitionType !== 'none' && transitionDuration > 0) {
        // 出场转场效果 (在片段末尾)
        if (!isLastClip && frame > clipDuration - transitionDuration) {
            const exitProgress = interpolate(
                frame,
                [clipDuration - transitionDuration, clipDuration],
                [0, 1],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            )

            switch (transitionType) {
                case 'dissolve':
                case 'fade':
                    opacity = 1 - exitProgress
                    break
                case 'slide':
                    transform = `translateX(${-exitProgress * 100}%)`
                    break
            }
        }

        // 入场转场效果 (在片段开头)
        if (frame < transitionDuration) {
            const enterProgress = interpolate(
                frame,
                [0, transitionDuration],
                [0, 1],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            )

            switch (transitionType) {
                case 'dissolve':
                case 'fade':
                    opacity = enterProgress
                    break
                case 'slide':
                    transform = `translateX(${(1 - enterProgress) * 100}%)`
                    break
            }
        }
    }

    return (
        <AbsoluteFill style={{ opacity, transform }}>
            {/* 视频 */}
            <Video
                src={clip.src}
                startFrom={clip.trim?.from || 0}
                {...(clip.trim?.to != null ? { endAt: clip.trim.to } : {})}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                }}
            />

            {/* 附属配音 */}
            {clip.attachment?.audio && (
                <Audio
                    src={clip.attachment.audio.src}
                    volume={clip.attachment.audio.volume}
                />
            )}

            {/* 附属字幕 */}
            {clip.attachment?.subtitle && (
                <SubtitleOverlay
                    text={clip.attachment.subtitle.text}
                    style={clip.attachment.subtitle.style}
                    custom={clip.attachment.subtitle.custom}
                />
            )}
        </AbsoluteFill>
    )
}

/**
 * 字幕叠加层 - 支持 4 种预设样式 + 自定义覆盖
 */
interface SubtitleOverlayProps {
    text: string
    style: 'default' | 'cinematic' | 'minimal' | 'bold'
    custom?: NonNullable<ClipAttachment['subtitle']>['custom']
}

const SUBTITLE_PRESETS: Record<string, React.CSSProperties> = {
    default: {
        background: 'rgba(0,0,0,0.7)',
        padding: '8px 16px',
        borderRadius: '4px',
        fontSize: '24px',
        color: 'white',
    },
    cinematic: {
        background: 'transparent',
        padding: '12px 24px',
        fontSize: '28px',
        color: 'white',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
        fontWeight: 'bold' as const,
    },
    minimal: {
        background: 'transparent',
        padding: '8px 16px',
        fontSize: '20px',
        color: 'rgba(255,255,255,0.9)',
        letterSpacing: '0.02em',
    },
    bold: {
        background: 'rgba(0,0,0,0.85)',
        padding: '10px 20px',
        borderRadius: '2px',
        fontSize: '32px',
        fontWeight: 900,
        color: 'white',
        letterSpacing: '0.05em',
    },
}

const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({ text, style, custom }) => {
    const base = SUBTITLE_PRESETS[style] ?? SUBTITLE_PRESETS.default

    // 应用 custom 覆盖
    const textStyle: React.CSSProperties = {
        ...base,
        ...(custom?.fontSize    != null && { fontSize: `${custom.fontSize}px` }),
        ...(custom?.color               && { color: custom.color }),
        ...(custom?.strokeColor         && { WebkitTextStroke: `1px ${custom.strokeColor}` }),
        ...(custom?.bgOpacity   != null && { background: `rgba(0,0,0,${custom.bgOpacity})` }),
    }

    const positionMap: Record<string, React.CSSProperties> = {
        bottom: { justifyContent: 'flex-end', paddingBottom: '60px' },
        top:    { justifyContent: 'flex-start', paddingTop: '60px' },
        center: { justifyContent: 'center' },
    }
    const containerStyle = positionMap[custom?.position ?? 'bottom'] ?? positionMap.bottom

    return (
        <AbsoluteFill style={{ alignItems: 'center', ...containerStyle }}>
            <div style={textStyle}>{text}</div>
        </AbsoluteFill>
    )
}

export default VideoComposition
