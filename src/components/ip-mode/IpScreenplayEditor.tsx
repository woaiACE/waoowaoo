'use client'

/**
 * IP 剧本编辑器 — 展示 IP 角色改写后的结构化剧本片段
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon, type AppIconName } from '@/components/ui/icons'
import type { IpScreenplaySegment, IpCastingSummary } from './types'
import { useIpScreenplaySegments } from './hooks/useIpScreenplaySegments'

interface IpScreenplayEditorProps {
  projectId: string
  clipId: string
  castings: IpCastingSummary[]
}

const SEGMENT_TYPE_ICON: Partial<Record<string, AppIconName>> = {
  dialogue: 'bookOpen',
  narration: 'fileText',
  action: 'play',
  transition: 'arrowRight',
}

const EMOTION_COLOR: Record<string, string> = {
  neutral: 'var(--glass-text-tertiary)',
  happy: 'var(--glass-tone-success-fg)',
  sad: '#6B8AFF',
  angry: 'var(--glass-tone-danger-fg)',
  fearful: '#C084FC',
  surprised: '#FBBF24',
  tender: '#F472B6',
  excited: '#FB923C',
}

export default function IpScreenplayEditor({
  projectId,
  clipId,
  castings,
}: IpScreenplayEditorProps) {
  const t = useTranslations('ipMode')
  const [expandedSegment, setExpandedSegment] = useState<string | null>(null)

  const { segments, isLoading } = useIpScreenplaySegments(projectId, clipId)

  const castingMap = new Map(castings.map(c => [c.roleLabel, c]))

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--glass-text-tertiary)] border-t-[var(--glass-accent)]" />
      </div>
    )
  }

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 gap-2">
        <AppIcon name="fileText" className="w-8 h-8 text-[var(--glass-text-tertiary)]" />
        <p className="text-sm glass-text-tertiary">{t('screenplay.empty')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {segments.map((seg: IpScreenplaySegment) => {
        const casting = seg.speakerLabel ? castingMap.get(seg.speakerLabel) : null
        const isExpanded = expandedSegment === seg.id
        const emotionColor = seg.emotionTag
          ? EMOTION_COLOR[seg.emotionTag] || 'var(--glass-text-tertiary)'
          : undefined

        return (
          <div
            key={seg.id}
            className="group rounded-lg hover:bg-[var(--glass-bg-muted)] transition-colors px-3 py-2 cursor-pointer"
            onClick={() => setExpandedSegment(isExpanded ? null : seg.id)}
          >
            <div className="flex items-start gap-2">
              {/* Type icon */}
              <span className="mt-0.5 flex-shrink-0">
                <AppIcon
                  name={SEGMENT_TYPE_ICON[seg.type] ?? 'fileText'}
                  className="w-4 h-4 glass-text-tertiary"
                />
              </span>

              {/* Speaker + text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {seg.speakerLabel && (
                    <span className="text-xs font-medium text-[var(--glass-accent)]">
                      {seg.speakerLabel}
                      {casting && (
                        <span className="ml-1 glass-text-tertiary font-normal">
                          ({casting.characterName})
                        </span>
                      )}
                    </span>
                  )}
                  {seg.emotionTag && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full bg-current/10"
                      style={{ color: emotionColor }}
                    >
                      {t(`emotion.${seg.emotionTag}`)}
                    </span>
                  )}
                </div>
                <p className="text-sm glass-text-primary leading-relaxed">
                  {seg.text}
                </p>
              </div>

              {/* Duration hint */}
              {seg.durationHint && (
                <span className="text-xs glass-text-tertiary flex-shrink-0">
                  {seg.durationHint.toFixed(1)}s
                </span>
              )}
            </div>

            {/* Expanded details */}
            {isExpanded && seg.stageDirection && (
              <div className="mt-2 ml-6 text-xs glass-text-tertiary italic border-l-2 border-[var(--glass-border)] pl-2">
                {seg.stageDirection}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
