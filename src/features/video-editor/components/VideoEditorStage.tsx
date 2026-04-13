'use client'
import { logError as _ulogError } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { useEditorState } from '../hooks/useEditorState'
import { useEditorActions } from '../hooks/useEditorActions'
import { VideoEditorProject, VideoClip, ClipAttachment } from '../types/editor.types'
import { calculateTimelineDuration, framesToTime } from '../utils/time-utils'
import { PLATFORM_PRESETS, DEFAULT_PLATFORM, type PlatformKey } from '../utils/platform-presets'
import { RemotionPreview } from './Preview'
import { Timeline } from './Timeline'
import { TransitionPicker, TransitionType } from './TransitionPicker'
import type { NovelPromotionStoryboard } from '@/types/project'

interface VideoEditorStageProps {
    projectId: string
    episodeId: string
    initialProject?: VideoEditorProject
    storyboards?: NovelPromotionStoryboard[]  // F1: 素材库数据源
    onBack?: () => void
}

/**
 * 视频编辑器主页面
 * 
 * 布局:
 * ┌──────────────────────────────────────────────────────────┐
 * │ Toolbar (返回 | 保存 | 导出)                              │
 * ├──────────────┬───────────────────────────────────────────┤
 * │  素材库       │       Preview (Remotion Player)           │
 * │              │                                           │
 * │              ├───────────────────────────────────────────┤
 * │              │       Properties Panel                    │
 * ├──────────────┴───────────────────────────────────────────┤
 * │                      Timeline                            │
 * └──────────────────────────────────────────────────────────┘
 */
export function VideoEditorStage({
    projectId,
    episodeId,
    initialProject,
    storyboards,
    onBack
}: VideoEditorStageProps) {
    const t = useTranslations('video')
    const {
        project,
        timelineState,
        isDirty,
        addClip,
        removeClip,
        updateClip,
        reorderClips,
        play,
        pause,
        seek,
        selectClip,
        setZoom,
        markSaved,
        addBgm,
        removeBgm,
        updateBgm
    } = useEditorState({ episodeId, initialProject })

    const { saveProject, startRender, getRenderStatus } = useEditorActions({ projectId, episodeId })

    // G1: 平台预设状态
    const [targetPlatform, setTargetPlatform] = useState<PlatformKey>(DEFAULT_PLATFORM)

    // D-2: 渲染状态
    const [renderState, setRenderState] = useState<{
        status: string
        progress?: number | null
        error?: string | null
        outputUrl?: string | null
    } | null>(null)
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const stopPolling = useCallback(() => {
        if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current)
            pollTimerRef.current = null
        }
    }, [])

    useEffect(() => () => stopPolling(), [stopPolling])

    const totalDuration = calculateTimelineDuration(project.timeline)
    const totalTime = framesToTime(totalDuration, project.config.fps)
    const currentTime = framesToTime(timelineState.currentFrame, project.config.fps)

    const handleSave = async () => {
        try {
            await saveProject(project)
            markSaved()
            alert(t('editor.alert.saveSuccess'))
        } catch (error) {
            _ulogError('Save failed:', error)
            alert(t('editor.alert.saveFailed'))
        }
    }

    const handleExport = async () => {
        try {
            await startRender(project.id, targetPlatform)
            setRenderState({ status: 'pending', progress: null })

            // 开始轮询
            stopPolling()
            pollTimerRef.current = setInterval(async () => {
                try {
                    const result = await getRenderStatus(project.id)
                    setRenderState(result)
                    if (result.status === 'completed' || result.status === 'failed') {
                        stopPolling()
                    }
                } catch {
                    // 轮询失败不中断轮询
                }
            }, 3000)
        } catch (error) {
            _ulogError('Export failed:', error)
            alert(t('editor.alert.exportFailed'))
        }
    }

    const selectedClip = project.timeline.find(c => c.id === timelineState.selectedClipId)

    // F1: 素材库面板数据
    const allMediaPanels = useMemo(() =>
        (storyboards ?? []).flatMap(sb =>
            (sb.panels ?? []).filter(p => !!(p.lipSyncVideoUrl || p.videoUrl)).map(p => ({
                id: p.id,
                storyboardId: sb.id,
                videoSrc: (p.lipSyncVideoUrl || p.videoUrl)!,
                imageUrl: p.imageUrl ?? null,
                description: p.description ?? null,
                durationFrames: Math.round((p.duration ?? 3) * project.config.fps),
            }))
        )
    , [storyboards, project.config.fps])
    const inTimeline = useMemo(() =>
        new Set(project.timeline.map(c => c.metadata?.panelId))
    , [project.timeline])

    // H: 字幕 custom 字段辅助更新
    const updateSubtitleCustom = useCallback((clip: VideoClip, patch: NonNullable<NonNullable<NonNullable<ClipAttachment['subtitle']>['custom']>>) => {
        updateClip(clip.id, {
            attachment: {
                ...clip.attachment,
                subtitle: {
                    ...clip.attachment!.subtitle!,
                    custom: { ...clip.attachment?.subtitle?.custom, ...patch }
                }
            }
        })
    }, [updateClip])

    return (
        <div className="video-editor-stage" style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            background: 'var(--glass-bg-canvas)',
            color: 'var(--glass-text-primary)'
        }}>
            {/* Toolbar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderBottom: '1px solid var(--glass-stroke-base)',
                background: 'var(--glass-bg-surface)'
            }}>
                <button
                    onClick={onBack}
                    className="glass-btn-base glass-btn-secondary px-4 py-2"
                >
                    {t('editor.toolbar.back')}
                </button>

                <div style={{ flex: 1 }} />

                <span style={{ color: 'var(--glass-text-secondary)', fontSize: '14px' }}>
                    {currentTime} / {totalTime}
                </span>

                <button
                    onClick={handleSave}
                    className={`glass-btn-base px-4 py-2 ${isDirty ? 'glass-btn-primary text-white' : 'glass-btn-secondary'}`}
                >
                    {isDirty ? t('editor.toolbar.saveDirty') : t('editor.toolbar.saved')}
                </button>

                {/* G2: 平台预设选择 */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--glass-text-secondary)' }}>
                    {t('editor.toolbar.platform')}
                    <select
                        value={targetPlatform}
                        onChange={e => setTargetPlatform(e.target.value as PlatformKey)}
                        style={{
                            background: 'var(--glass-bg-muted)',
                            border: '1px solid var(--glass-stroke-base)',
                            borderRadius: '6px',
                            color: 'inherit',
                            padding: '4px 8px',
                            fontSize: '13px',
                            cursor: 'pointer'
                        }}
                    >
                        {Object.entries(PLATFORM_PRESETS).map(([key, p]) => (
                            <option key={key} value={key}>{p.label}</option>
                        ))}
                    </select>
                </label>

                <button
                    onClick={handleExport}
                    disabled={renderState?.status === 'pending' || renderState?.status === 'rendering'}
                    className="glass-btn-base glass-btn-tone-success px-4 py-2"
                >
                    {t('editor.toolbar.export')}
                </button>

                {/* D-2: 渲染状态区域 */}
                {renderState && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                        {(renderState.status === 'pending' || renderState.status === 'rendering') && (
                            <>
                                <span style={{ color: 'var(--glass-text-secondary)' }}>
                                    {renderState.status === 'pending' ? '等待渲染…' : `渲染中 ${renderState.progress ?? 0}%`}
                                </span>
                                {renderState.progress != null && (
                                    <div style={{ width: '80px', height: '6px', background: 'var(--glass-bg-muted)', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{ width: `${renderState.progress}%`, height: '100%', background: 'var(--glass-accent-from)', transition: 'width 0.3s' }} />
                                    </div>
                                )}
                            </>
                        )}
                        {renderState.status === 'completed' && renderState.outputUrl && (
                            <a
                                href={renderState.outputUrl}
                                download
                                className="glass-btn-base glass-btn-primary px-3 py-1.5"
                                style={{ fontSize: '12px' }}
                            >
                                下载视频
                            </a>
                        )}
                        {renderState.status === 'failed' && (
                            <>
                                <span style={{ color: 'var(--glass-tone-danger-fg, #f87171)', fontSize: '12px' }}>
                                    渲染失败{renderState.error ? `：${renderState.error}` : ''}
                                </span>
                                <button
                                    onClick={() => { setRenderState(null); handleExport() }}
                                    className="glass-btn-base glass-btn-tone-danger px-2 py-1"
                                    style={{ fontSize: '11px' }}
                                >
                                    重试
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Main Content */}
            <div style={{
                display: 'flex',
                flex: 1,
                overflow: 'hidden'
            }}>
                {/* Left Panel - Media Library */}
                <div style={{
                    width: '200px',
                    borderRight: '1px solid var(--glass-stroke-base)',
                    padding: '12px',
                    background: 'var(--glass-bg-surface-strong)',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--glass-text-secondary)', flexShrink: 0 }}>
                        {t('editor.left.title')}
                    </h3>
                    {allMediaPanels.length === 0 ? (
                        <p style={{ fontSize: '12px', color: 'var(--glass-text-tertiary)', margin: 0 }}>
                            {t('editor.left.noVideoPanels')}
                        </p>
                    ) : allMediaPanels.map(panel => {
                        const added = inTimeline.has(panel.id)
                        return (
                            <div
                                key={panel.id}
                                style={{
                                    display: 'flex',
                                    gap: '6px',
                                    alignItems: 'center',
                                    padding: '4px',
                                    borderRadius: '6px',
                                    background: added ? 'var(--glass-tone-success-bg, rgba(34,197,94,0.08))' : 'var(--glass-bg-muted)',
                                    border: '1px solid var(--glass-stroke-base)'
                                }}
                            >
                                {/* 缩略图 */}
                                {panel.imageUrl
                                    ? <img src={panel.imageUrl} style={{ width: 44, height: 33, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                                    : <div style={{ width: 44, height: 33, background: 'var(--glass-bg-canvas)', borderRadius: 3, flexShrink: 0 }} />
                                }
                                {/* 描述 + 时长 */}
                                <div style={{ flex: 1, overflow: 'hidden', fontSize: '11px' }}>
                                    <p style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--glass-text-primary)' }}>
                                        {panel.description || t('editor.left.panelFallback')}
                                    </p>
                                    <p style={{ margin: 0, color: 'var(--glass-text-tertiary)' }}>
                                        {(panel.durationFrames / project.config.fps).toFixed(1)}s
                                    </p>
                                </div>
                                {/* 添加按钮 */}
                                <button
                                    disabled={added}
                                    title={added ? t('editor.left.panelAdded') : t('editor.left.addPanel')}
                                    onClick={() => addClip({
                                        src: panel.videoSrc,
                                        durationInFrames: panel.durationFrames,
                                        metadata: { panelId: panel.id, storyboardId: panel.storyboardId, description: panel.description ?? undefined }
                                    })}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: added ? 'default' : 'pointer',
                                        color: added ? 'var(--glass-tone-success-fg, #22c55e)' : 'var(--glass-text-secondary)',
                                        fontSize: '18px',
                                        lineHeight: 1,
                                        padding: 0,
                                        flexShrink: 0
                                    }}
                                >
                                    {added ? '✓' : '+'}
                                </button>
                            </div>
                        )
                    })}
                </div>

                {/* Center - Preview + Properties */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {/* Preview */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--glass-bg-muted)',
                        padding: '20px'
                    }}>
                        <RemotionPreview
                            project={project}
                            currentFrame={timelineState.currentFrame}
                            playing={timelineState.playing}
                            onFrameChange={seek}
                            onPlayingChange={(playing) => playing ? play() : pause()}
                        />
                    </div>

                    {/* Playback Controls */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '16px',
                        padding: '12px',
                        background: 'var(--glass-bg-surface-strong)',
                        borderTop: '1px solid var(--glass-stroke-base)'
                    }}>
                        <button
                            onClick={() => seek(0)}
                            className="glass-btn-base glass-btn-ghost px-3 py-1.5"
                        >
                            <AppIcon name="chevronLeft" className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => timelineState.playing ? pause() : play()}
                            style={{
                                background: 'var(--glass-accent-from)',
                                border: 'none',
                                color: 'var(--glass-text-on-accent)',
                                cursor: 'pointer',
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                fontSize: '18px'
                            }}
                        >
                            {timelineState.playing
                                ? <AppIcon name="pause" className="w-4 h-4" />
                                : <AppIcon name="play" className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={() => seek(totalDuration)}
                            className="glass-btn-base glass-btn-ghost px-3 py-1.5"
                        >
                            <AppIcon name="chevronRight" className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Right Panel - Properties */}
                <div style={{
                    width: '280px',
                    borderLeft: '1px solid var(--glass-stroke-base)',
                    padding: '12px',
                    background: 'var(--glass-bg-surface-strong)',
                    overflowY: 'auto'
                }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--glass-text-secondary)' }}>
                        {t('editor.right.title')}
                    </h3>
                    {selectedClip ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* 基础信息 */}
                            <div style={{ fontSize: '12px' }}>
                                <p style={{ margin: '0 0 8px 0' }}>
                                    <span style={{ color: 'var(--glass-text-secondary)' }}>{t('editor.right.clipLabel')}</span> {selectedClip.metadata?.description || t('editor.right.clipFallback', { index: project.timeline.findIndex(c => c.id === selectedClip.id) + 1 })}
                                </p>
                                <p style={{ margin: '0 0 8px 0' }}>
                                    <span style={{ color: 'var(--glass-text-secondary)' }}>{t('editor.right.durationLabel')}</span> {framesToTime(selectedClip.durationInFrames, project.config.fps)}
                                </p>
                            </div>

                            {/* 转场设置 */}
                            <div>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--glass-text-secondary)' }}>
                                    {t('editor.right.transitionLabel')}
                                </h4>
                                <TransitionPicker
                                    value={(selectedClip.transition?.type as TransitionType) || 'none'}
                                    duration={selectedClip.transition?.durationInFrames || 15}
                                    onChange={(type, duration) => {
                                        updateClip(selectedClip.id, {
                                            transition: type === 'none' ? undefined : { type, durationInFrames: duration }
                                        })
                                    }}
                                />
                            </div>

                            {/* E1: Trim 入出点 */}
                            <div>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--glass-text-secondary)' }}>
                                    {t('editor.right.trimLabel')}
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ color: 'var(--glass-text-secondary)', width: '80px', flexShrink: 0 }}>{t('editor.right.trimFrom')}</span>
                                        <input
                                            type="number"
                                            min={0}
                                            max={selectedClip.durationInFrames - 1}
                                            value={selectedClip.trim?.from ?? 0}
                                            onChange={(e) => updateClip(selectedClip.id, {
                                                trim: { from: Math.max(0, parseInt(e.target.value) || 0), to: selectedClip.trim?.to ?? selectedClip.durationInFrames }
                                            })}
                                            style={{ width: '70px', background: 'var(--glass-bg-muted)', border: '1px solid var(--glass-stroke-base)', borderRadius: '4px', padding: '2px 6px', color: 'inherit' }}
                                        />
                                        <span style={{ color: 'var(--glass-text-tertiary)' }}>f</span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ color: 'var(--glass-text-secondary)', width: '80px', flexShrink: 0 }}>{t('editor.right.trimTo')}</span>
                                        <input
                                            type="number"
                                            min={1}
                                            max={selectedClip.durationInFrames}
                                            value={selectedClip.trim?.to ?? selectedClip.durationInFrames}
                                            onChange={(e) => updateClip(selectedClip.id, {
                                                trim: { from: selectedClip.trim?.from ?? 0, to: Math.max(1, parseInt(e.target.value) || selectedClip.durationInFrames) }
                                            })}
                                            style={{ width: '70px', background: 'var(--glass-bg-muted)', border: '1px solid var(--glass-stroke-base)', borderRadius: '4px', padding: '2px 6px', color: 'inherit' }}
                                        />
                                        <span style={{ color: 'var(--glass-text-tertiary)' }}>f</span>
                                    </label>
                                </div>
                            </div>

                            {/* E2: 配音音量滑块 */}
                            {selectedClip.attachment?.audio && (
                                <div>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--glass-text-secondary)' }}>
                                        {t('editor.right.voiceVolume')}
                                    </h4>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                                        <input
                                            type="range"
                                            min={0}
                                            max={1}
                                            step={0.05}
                                            value={selectedClip.attachment.audio.volume}
                                            onChange={(e) => {
                                                const vol = parseFloat(e.target.value)
                                                updateClip(selectedClip.id, {
                                                    attachment: {
                                                        ...selectedClip.attachment,
                                                        audio: { ...selectedClip.attachment!.audio!, volume: vol }
                                                    }
                                                })
                                            }}
                                            style={{ flex: 1 }}
                                        />
                                        <span style={{ color: 'var(--glass-text-secondary)', minWidth: '36px' }}>
                                            {Math.round((selectedClip.attachment.audio.volume) * 100)}%
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* H3: 字幕样式设计器 */}
                            {selectedClip.attachment?.subtitle && (() => {
                                const sub = selectedClip.attachment.subtitle
                                const SUBTITLE_STYLES = ['default', 'cinematic', 'minimal', 'bold'] as const
                                const STYLE_FONT_DEFAULTS: Record<string, number> = {
                                    default: 24, cinematic: 28, minimal: 20, bold: 32
                                }
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--glass-text-secondary)' }}>
                                            {t('editor.right.subtitleStyle')}
                                        </h4>

                                        {/* 样式选择 */}
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            {SUBTITLE_STYLES.map(s => (
                                                <button
                                                    key={s}
                                                    onClick={() => updateClip(selectedClip.id, {
                                                        attachment: { ...selectedClip.attachment, subtitle: { ...sub, style: s } }
                                                    })}
                                                    style={{
                                                        padding: '3px 8px',
                                                        borderRadius: '4px',
                                                        border: '1px solid var(--glass-stroke-base)',
                                                        background: sub.style === s ? 'var(--glass-accent-from)' : 'var(--glass-bg-muted)',
                                                        color: sub.style === s ? 'var(--glass-text-on-accent)' : 'var(--glass-text-secondary)',
                                                        cursor: 'pointer',
                                                        fontSize: '11px'
                                                    }}
                                                >
                                                    {t(`editor.right.subtitleStyles.${s}`)}
                                                </button>
                                            ))}
                                        </div>

                                        {/* 位置 */}
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                                            <span style={{ color: 'var(--glass-text-secondary)', width: '60px', flexShrink: 0 }}>
                                                {t('editor.right.subtitlePosition')}
                                            </span>
                                            <select
                                                value={sub.custom?.position || 'bottom'}
                                                onChange={e => updateSubtitleCustom(selectedClip, { position: e.target.value as 'bottom' | 'top' | 'center' })}
                                                style={{ flex: 1, background: 'var(--glass-bg-muted)', border: '1px solid var(--glass-stroke-base)', borderRadius: '4px', color: 'inherit', padding: '2px 4px', fontSize: '11px' }}
                                            >
                                                {(['bottom', 'top', 'center'] as const).map(p => (
                                                    <option key={p} value={p}>{t(`editor.right.subtitlePositions.${p}`)}</option>
                                                ))}
                                            </select>
                                        </label>

                                        {/* 字号 */}
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                                            <span style={{ color: 'var(--glass-text-secondary)', width: '60px', flexShrink: 0 }}>
                                                {t('editor.right.subtitleFontSize')}
                                            </span>
                                            <input
                                                type="range" min={16} max={56} step={1}
                                                value={sub.custom?.fontSize ?? STYLE_FONT_DEFAULTS[sub.style] ?? 24}
                                                onChange={e => updateSubtitleCustom(selectedClip, { fontSize: parseInt(e.target.value) })}
                                                style={{ flex: 1 }}
                                            />
                                            <span style={{ color: 'var(--glass-text-tertiary)', minWidth: '28px' }}>
                                                {sub.custom?.fontSize ?? STYLE_FONT_DEFAULTS[sub.style] ?? 24}px
                                            </span>
                                        </label>

                                        {/* 文字颜色 */}
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                                            <span style={{ color: 'var(--glass-text-secondary)', width: '60px', flexShrink: 0 }}>
                                                {t('editor.right.subtitleColor')}
                                            </span>
                                            <input
                                                type="color"
                                                value={sub.custom?.color || '#ffffff'}
                                                onChange={e => updateSubtitleCustom(selectedClip, { color: e.target.value })}
                                                style={{ width: '40px', height: '24px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                            />
                                        </label>

                                        {/* 背景透明度 */}
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                                            <span style={{ color: 'var(--glass-text-secondary)', width: '60px', flexShrink: 0 }}>
                                                {t('editor.right.subtitleBgOpacity')}
                                            </span>
                                            <input
                                                type="range" min={0} max={1} step={0.05}
                                                value={sub.custom?.bgOpacity ?? 0.7}
                                                onChange={e => updateSubtitleCustom(selectedClip, { bgOpacity: parseFloat(e.target.value) })}
                                                style={{ flex: 1 }}
                                            />
                                            <span style={{ color: 'var(--glass-text-tertiary)', minWidth: '28px' }}>
                                                {Math.round((sub.custom?.bgOpacity ?? 0.7) * 100)}%
                                            </span>
                                        </label>
                                    </div>
                                )
                            })()}

                            {/* 删除按钮 */}
                            <button
                                onClick={() => {
                                    if (confirm(t('editor.right.deleteConfirm'))) {
                                        removeClip(selectedClip.id)
                                        selectClip(null)
                                    }
                                }}
                                className="glass-btn-base glass-btn-tone-danger mt-2 px-3 py-2 text-xs"
                            >
                                {t('editor.right.deleteClip')}
                            </button>
                        </div>
                    ) : (
                        <p style={{ fontSize: '12px', color: 'var(--glass-text-tertiary)' }}>
                            {t('editor.right.selectClipHint')}
                        </p>
                    )}
                </div>
            </div>

            {/* Timeline */}
            <div style={{
                height: '220px',
                borderTop: '1px solid var(--glass-stroke-base)'
            }}>
                <Timeline
                    clips={project.timeline}
                    bgmTrack={project.bgmTrack}
                    timelineState={timelineState}
                    config={project.config}
                    onReorder={reorderClips}
                    onSelectClip={selectClip}
                    onZoomChange={setZoom}
                    onSeek={seek}
                    onAddBgm={addBgm}
                    onRemoveBgm={removeBgm}
                    onUpdateBgm={updateBgm}
                />
            </div>
        </div>
    )
}

export default VideoEditorStage
