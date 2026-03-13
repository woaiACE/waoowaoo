'use client'

import { useTranslations } from 'next-intl'
import { Player } from '@remotion/player'
import { AppIcon } from '@/components/ui/icons'
import type { NovelPromotionStoryboard } from '@/types/project'
import type { VoiceLine } from '@/lib/query/hooks/useVoiceLines'
import type { Clip } from '../video'
import { RemotionPreview } from './RemotionPreview'

export interface EditorStageProps {
  projectId: string
  episodeId: string
  clips: Clip[]
  storyboards: NovelPromotionStoryboard[]
  voiceLines: VoiceLine[]
  onBack?: () => void
}

export default function EditorStage({
  storyboards,
  voiceLines,
  onBack,
}: EditorStageProps) {
  const t = useTranslations('novelPromotion')

  // Extract panels that have video URL generated
  const panelsWithVideo = storyboards.flatMap(sb => sb.panels || []).filter(panel => panel.videoUrl)
  const hasVideos = panelsWithVideo.length > 0
  const hasVoice = voiceLines && voiceLines.length > 0

  const videoUrls = panelsWithVideo.map(p => p.videoUrl as string)
  const totalFrames = Math.max(videoUrls.length * 150, 150)

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] p-4 max-w-[1400px] mx-auto gap-4">
      {/* Top Header */}
      <div className="flex justify-between items-center mb-2 shrink-0">
        <div className="flex items-center space-x-4">
          {onBack && (
            <button
              onClick={onBack}
              className="glass-btn-base glass-btn-secondary p-2"
              title={t('back')}
            >
              <AppIcon name="chevronLeft" className="w-5 h-5" />
            </button>
          )}
          <div>
            <h2 className="text-xl font-bold text-[var(--glass-text-primary)]">
              {t('editor.title') || 'AI Editor'}
            </h2>
            <p className="text-sm text-[var(--glass-text-tertiary)] mt-1">
              {t('editor.description') || 'Assemble your generated videos, sync voiceovers, and upload BGM.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="glass-btn-base glass-btn-primary px-6 py-2">
            <AppIcon name="download" className="w-4 h-4 mr-2" />
            {t('editor.export') || 'Export Video'}
          </button>
        </div>
      </div>

      {/* Main Workspace (Preview + Panel) */}
      <div className="flex flex-1 min-h-0 gap-4">
        {/* Left: Player Preview Area */}
        <div className="flex-1 glass-surface flex flex-col items-center justify-center relative overflow-hidden bg-black/5 rounded-2xl">
          {hasVideos ? (
            <div className="w-full h-full flex items-center justify-center p-4">
              <div className="rounded-xl overflow-hidden shadow-2xl border border-white/10">
                <Player
                  component={RemotionPreview}
                  inputProps={{ videos: videoUrls }}
                  durationInFrames={totalFrames}
                  compositionWidth={720}
                  compositionHeight={1280}
                  fps={30}
                  style={{
                    width: 'auto',
                    height: '100%',
                    maxHeight: 'calc(100vh - 420px)',
                    aspectRatio: '9/16'
                  }}
                  controls
                  autoPlay
                  loop
                />
              </div>
            </div>
          ) : (
            <div className="text-center p-8">
              <AppIcon name="video" className="w-12 h-12 text-[var(--glass-text-tertiary)] mx-auto mb-4" />
              <h3 className="text-lg font-medium text-[var(--glass-text-secondary)]">No Videos Generated</h3>
              <p className="text-sm text-[var(--glass-text-tertiary)] mt-2 max-w-sm mx-auto">
                Go back to the Videos stage to generate video clips for your storyboards.
              </p>
            </div>
          )}
        </div>

        {/* Right: Configuration Panel */}
        <div className="w-[320px] shrink-0 glass-panel flex flex-col p-4 overflow-y-auto">
          <h3 className="font-semibold text-[var(--glass-text-primary)] mb-4 pb-2 border-b border-[var(--glass-border)]">
            {t('editor.settings') || 'Settings'}
          </h3>

          <div className="space-y-6">
            {/* BGM Upload */}
            <div>
              <label className="glass-field-label block mb-2">{t('editor.bgm') || 'Background Music'}</label>
              <div className="glass-surface-muted p-4 rounded-xl border border-[var(--glass-border)] hover:border-[var(--glass-accent-from)]/30 transition-colors text-center cursor-pointer">
                <AppIcon name="upload" className="w-6 h-6 text-[var(--glass-text-secondary)] mx-auto mb-2" />
                <span className="text-sm text-[var(--glass-text-secondary)] block">
                  {t('editor.uploadBgm') || 'Upload BGM File'}
                </span>
                <span className="text-xs text-[var(--glass-text-tertiary)] block mt-1">.mp3, .wav</span>
              </div>
            </div>

            {/* Subtitles Toggle */}
            <div>
              <label className="glass-field-label block mb-2">{t('editor.subtitles') || 'Subtitles'}</label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded bg-black/20 border-white/10 text-[var(--glass-accent-from)] focus:ring-[var(--glass-accent-from)]/50" defaultChecked />
                <span className="text-sm text-[var(--glass-text-secondary)]">
                  {t('editor.enableSubtitles') || 'Enable Subtitles'}
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: Timeline Area */}
      <div className="h-[240px] shrink-0 glass-surface p-4 flex flex-col rounded-2xl">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-[var(--glass-text-primary)]">
            {t('editor.timeline') || 'Timeline'}
          </h3>
          <div className="text-sm text-[var(--glass-text-tertiary)]">
            {panelsWithVideo.length} {t('editor.clips') || 'clips'}
            {hasVoice ? ` • Voiceovers synced` : ''}
          </div>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-hidden flex items-center gap-2 p-2 bg-black/10 rounded-xl relative">
          {/* Timeline Placeholder */}
          {panelsWithVideo.map((panel, idx) => (
            <div key={panel.id || idx} className="h-full w-[120px] shrink-0 bg-[var(--glass-bg-muted)] border border-[var(--glass-border)] rounded-lg relative overflow-hidden group">
              {panel.videoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={panel.videoUrl} alt="Thumbnail" className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-[var(--glass-text-tertiary)]">
                  Clip {idx + 1}
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-2 py-1 truncate backdrop-blur-md border-t border-white/10">
                {panel.description || `Clip ${idx + 1}`}
              </div>
            </div>
          ))}
          {!hasVideos && (
             <div className="text-[var(--glass-text-tertiary)] text-sm w-full text-center">
               Timeline is empty.
             </div>
          )}
        </div>
      </div>
    </div>
  )
}
