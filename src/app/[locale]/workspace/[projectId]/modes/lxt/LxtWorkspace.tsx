'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { LxtWorkspaceProvider } from './LxtWorkspaceProvider'
import { LxtWorkspaceStageRuntimeProvider } from './LxtWorkspaceStageRuntimeContext'
import LxtScriptStage from './components/LxtScriptStage'
import LxtStoryboardStage from './components/LxtStoryboardStage'
import LxtFinalScriptStage from './components/LxtFinalScriptStage'

// LXT 支持的 stages
const LXT_STAGES = ['lxt-script', 'lxt-storyboard', 'lxt-final-script'] as const
type LxtStage = typeof LXT_STAGES[number]

export interface LxtEpisodeItem {
  id: string
  episodeNumber: number
  name: string
  novelText?: string | null
}

export interface LxtWorkspaceProps {
  projectId: string
  urlStage: string
  onStageChange: (stage: string) => void
  episodes: LxtEpisodeItem[]
  selectedEpisodeId: string | null
  onEpisodeSelect: (episodeId: string) => void
  onEpisodeCreate: (name: string) => Promise<void>
  onEpisodeRename: (episodeId: string, newName: string) => Promise<void>
  onEpisodeDelete: (episodeId: string) => Promise<void>
}

/**
 * LxtWorkspace — LXT 短剧模式独立工作台
 *
 * 提供三步流程：原文录入（lxt-script）→ 分镜（lxt-storyboard）→ 制作脚本（lxt-final-script）
 */
export default function LxtWorkspace({
  projectId,
  urlStage,
  onStageChange,
  episodes,
  selectedEpisodeId,
  onEpisodeSelect,
  onEpisodeCreate,
  onEpisodeRename,
  onEpisodeDelete,
}: LxtWorkspaceProps) {
  const t = useTranslations('lxtWorkspace')
  const tc = useTranslations('common')

  const effectiveStage: LxtStage =
    LXT_STAGES.includes(urlStage as LxtStage) ? (urlStage as LxtStage) : 'lxt-script'

  const selectedEpisode = episodes.find(ep => ep.id === selectedEpisodeId) || episodes[0] || null

  // Create episode
  const [newEpisodeName, setNewEpisodeName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const handleCreateEpisode = async () => {
    const name = newEpisodeName.trim()
    if (!name) return
    setIsCreating(true)
    setCreateError(null)
    try {
      await onEpisodeCreate(name)
      setNewEpisodeName('')
      setShowCreateForm(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsCreating(false)
    }
  }

  // Stage navigation tabs
  const stageTabs: { key: LxtStage; label: string }[] = [
    { key: 'lxt-script', label: t('tabs.script') },
    { key: 'lxt-storyboard', label: t('tabs.storyboard') },
    { key: 'lxt-final-script', label: t('tabs.finalScript') },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Stage 导航 */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--glass-bg-muted)] w-fit">
        {stageTabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onStageChange(tab.key)}
            className={[
              'h-8 px-4 text-sm rounded-lg transition-all font-medium',
              effectiveStage === tab.key
                ? 'bg-[var(--glass-accent-from)] text-white shadow-sm'
                : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--glass-text-primary)]',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {/* 左侧：集列表 */}
        <aside className="w-56 shrink-0 flex flex-col gap-3">
          {/* 标题 + 新建按钮 */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-[var(--glass-text-primary)] uppercase tracking-wider">
              {t('episodeList')}
            </span>
            <button
              type="button"
              onClick={() => setShowCreateForm(v => !v)}
              className={[
                'w-7 h-7 rounded-full text-lg font-light flex items-center justify-center transition-all',
                showCreateForm
                  ? 'bg-[var(--glass-accent-from)] text-white'
                  : 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] hover:bg-[var(--glass-accent-from)] hover:text-white',
              ].join(' ')}
            >
              +
            </button>
          </div>

          {/* 侧边栏新建表单：仅在已有集时显示 */}
          {episodes.length > 0 && showCreateForm && (
            <div className="flex flex-col gap-1.5 px-1">
              <input
                type="text"
                value={newEpisodeName}
                onChange={e => setNewEpisodeName(e.target.value)}
                placeholder={t('newEpisodePlaceholder')}
                className="glass-field-input text-xs h-8 px-2 w-full"
                onKeyDown={e => { if (e.key === 'Enter') void handleCreateEpisode() }}
                autoFocus
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="glass-btn-base glass-btn-secondary h-7 flex-1 text-xs"
                >
                  {tc('cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateEpisode()}
                  disabled={isCreating || !newEpisodeName.trim()}
                  className="glass-btn-base glass-btn-primary h-7 flex-1 text-xs disabled:opacity-40"
                >
                  {isCreating ? '…' : tc('save')}
                </button>
              </div>
            </div>
          )}

          {/* 集列表 */}
          <div className="flex flex-col gap-1.5">
            {episodes.map(ep => (
              <button
                key={ep.id}
                type="button"
                onClick={() => onEpisodeSelect(ep.id)}
                className={[
                  'group relative text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center gap-2.5 overflow-hidden',
                  ep.id === selectedEpisode?.id
                    ? 'bg-[var(--glass-accent-from)] text-white font-semibold shadow-md'
                    : 'bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--glass-text-primary)] border border-[var(--glass-stroke-base)]',
                ].join(' ')}
              >
                <span className={[
                  'shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-[11px] font-bold leading-none',
                  ep.id === selectedEpisode?.id
                    ? 'bg-white/20 text-white'
                    : 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-tertiary)]',
                ].join(' ')}>
                  {ep.episodeNumber.toString().padStart(2, '0')}
                </span>
                <span className="truncate flex-1">{ep.name}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* 右侧：Stage 内容 */}
        <div className="flex-1 min-w-0">
          {selectedEpisode ? (
            <LxtWorkspaceProvider key={selectedEpisode.id} projectId={projectId} episodeId={selectedEpisode.id}>
              <LxtWorkspaceStageRuntimeProvider onStageChange={onStageChange}>
                {/* 始终挂载所有 Stage，用 hidden 切换显示，保持流式推理 state 不丢失 */}
                <div className={effectiveStage !== 'lxt-script' ? 'hidden' : ''}><LxtScriptStage /></div>
                <div className={effectiveStage !== 'lxt-storyboard' ? 'hidden' : ''}><LxtStoryboardStage /></div>
                <div className={effectiveStage !== 'lxt-final-script' ? 'hidden' : ''}><LxtFinalScriptStage /></div>
              </LxtWorkspaceStageRuntimeProvider>
            </LxtWorkspaceProvider>
          ) : (
            <div className="glass-surface p-8 flex flex-col items-center gap-4">
              <p className="text-sm text-[var(--glass-text-secondary)]">{t('noEpisodesHint')}</p>
              {!showCreateForm ? (
                <button
                  type="button"
                  onClick={() => setShowCreateForm(true)}
                  className="glass-btn-base glass-btn-primary h-9 px-6 text-sm"
                >
                  {t('createFirstEpisode')}
                </button>
              ) : (
                <div className="flex flex-col items-center gap-2 w-full max-w-xs">
                  <div className="flex gap-2 w-full">
                    <input
                      type="text"
                      value={newEpisodeName}
                      onChange={e => setNewEpisodeName(e.target.value)}
                      placeholder={t('newEpisodePlaceholder')}
                      className="glass-field-input flex-1 text-sm h-9 px-3"
                      onKeyDown={e => { if (e.key === 'Enter') void handleCreateEpisode() }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => void handleCreateEpisode()}
                      disabled={isCreating || !newEpisodeName.trim()}
                      className="glass-btn-base glass-btn-primary h-9 px-4 text-sm disabled:opacity-40"
                    >
                      {isCreating ? '…' : tc('save')}
                    </button>
                  </div>
                  {createError && (
                    <p className="text-xs text-[var(--glass-tone-danger-fg)] text-center">{createError}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
