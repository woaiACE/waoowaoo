'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import GlassTextarea from '@/components/ui/primitives/GlassTextarea'
import LLMStageStreamCard, { type LLMStageViewItem } from '@/components/llm-console/LLMStageStreamCard'
import { useLxtFinalScriptRunStream } from '@/lib/query/hooks/useLxtFinalScriptRunStream'
import { parseLxtShots } from '@/lib/lxt/parse-shots'
import { useLxtWorkspaceEpisodeStageData } from '../hooks/useLxtWorkspaceEpisodeStageData'
import { useLxtWorkspaceProvider } from '../LxtWorkspaceProvider'
import { useLxtWorkspaceStageRuntime } from '../LxtWorkspaceStageRuntimeContext'

/**
 * LXT 制作脚本 Stage — 在 workspace 内运行
 *
 * 通过 SSE 流式端点提交 BullMQ 任务，使用 LLMStageStreamCard 实时展示每个镜头的推理过程。
 * 四阶段分组展示：分析推理 / 图片提示词 / 表演指导 / 视频合成，并行任务以 "任务名×N" 聚合。
 * 任务完成后恢复双栏编辑布局，结果写入 episode.scriptContent。
 */

const PHASE_GROUPS = [
  { prefix: 'p1:', id: 'phase_p1', title: '分析推理' },
  { prefix: 'p2a:', id: 'phase_p2a', title: '图片提示词' },
  { prefix: 'p2b:', id: 'phase_p2b', title: '表演指导' },
  { prefix: 'p3:', id: 'phase_p3', title: '视频合成' },
] as const

type PhaseGroupId = (typeof PHASE_GROUPS)[number]['id']

function buildPhaseGroupStages(streamStages: LLMStageViewItem[], totalShots: number): LLMStageViewItem[] {
  const grouped: Record<PhaseGroupId, LLMStageViewItem[]> = {
    phase_p1: [],
    phase_p2a: [],
    phase_p2b: [],
    phase_p3: [],
  }

  for (const stage of streamStages) {
    for (const g of PHASE_GROUPS) {
      if (stage.id.startsWith(g.prefix)) {
        grouped[g.id].push(stage)
        break
      }
    }
  }

  return PHASE_GROUPS.map((g) => {
    const items = grouped[g.id]
    const running = items.filter((s) => s.status === 'processing').length
    const completed = items.filter((s) => s.status === 'completed' || s.status === 'stale').length
    const failed = items.filter((s) => s.status === 'failed').length

    let status: LLMStageViewItem['status']
    if (failed > 0) status = 'failed'
    else if (running > 0 || (completed > 0 && completed < totalShots)) status = 'processing'
    else if (completed >= totalShots) status = 'completed'
    else status = 'pending'

    const runningLabel = running > 1 ? ` ×${running}` : ''
    const subtitle = items.length > 0 ? `${completed}/${totalShots} 完成` : undefined

    return {
      id: g.id,
      title: g.title + runningLabel,
      subtitle,
      status,
      progress: totalShots > 0 ? Math.floor((completed / totalShots) * 100) : 0,
    }
  })
}

export default function LxtFinalScriptStage() {
  const t = useTranslations('lxtScript')
  const locale = useLocale()
  const params = useParams<{ projectId: string }>()
  const projectId = params?.projectId ?? ''

  const { episodeId, onRefresh } = useLxtWorkspaceProvider()
  const runtime = useLxtWorkspaceStageRuntime()
  const { episodeName, novelText, shotListContent, scriptContent } = useLxtWorkspaceEpisodeStageData()

  const [editedScript, setEditedScript] = useState<string | null>(null)
  const [minimized, setMinimized] = useState(false)
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | undefined>(undefined)

  const stream = useLxtFinalScriptRunStream({ projectId, episodeId: episodeId ?? null })

  // 任务完成/失败时处理 UI 状态
  const prevStatusRef = useRef<string>('idle')
  useEffect(() => {
    const status = stream.status
    if (prevStatusRef.current !== status) {
      prevStatusRef.current = status
      if (status === 'completed') {
        setEditedScript(null)
        setMinimized(false)
        void onRefresh({ scope: 'all' })
      } else if (status === 'failed') {
        // 任务失败时自动恢复 overlay，防止最小化状态下用户看不到错误信息
        setMinimized(false)
      }
    }
  }, [stream.status, onRefresh])

  const handleGenerate = useCallback(async () => {
    if (!projectId || !episodeId || !shotListContent?.trim()) return
    if (stream.isRunning || stream.isRecoveredRunning) return

    setEditedScript(null)
    setMinimized(false)
    setSelectedPhaseId(undefined)
    stream.reset()
    await stream.run({ episodeId, locale })
  }, [projectId, episodeId, shotListContent, locale, stream])

  const handleSelectPhase = useCallback((phaseId: string) => {
    setSelectedPhaseId(phaseId)
    const prefix = PHASE_GROUPS.find((g) => g.id === phaseId)?.prefix
    if (!prefix) return
    const phaseSteps = stream.orderedSteps.filter((s) => s.id.startsWith(prefix))
    const runningStep = phaseSteps.find((s) => s.status === 'running')
    const completedStep = [...phaseSteps].sort((a, b) => b.updatedAt - a.updatedAt).find((s) => s.status === 'completed')
    const target = runningStep ?? completedStep ?? phaseSteps[phaseSteps.length - 1]
    if (target) stream.selectStep(target.id)
  }, [stream])

  const hasStoryboard = !!shotListContent?.trim()

  // 是否展示流式卡片（运行中 / 失败时保留显示以展示错误）
  const showStreamCard =
    stream.isRunning ||
    stream.isRecoveredRunning ||
    stream.status === 'running' ||
    stream.status === 'failed'

  const isGenerating = stream.isRunning || stream.isRecoveredRunning || stream.status === 'running'

  // 构建四阶段分组展示
  const shots = parseLxtShots(shotListContent ?? '')
  // 当 shotListContent 未加载时，从流步骤的 stepTotal（= totalShots * 4）反推实际镜头数，
  // 避免 totalShots=0 时 completed >= 0 恒成立导致阶段提前显示"已完成"
  const totalShots = shots.length > 0
    ? shots.length
    : (() => {
        const anyStep = stream.orderedSteps.find((s) =>
          s.id.startsWith('p1:') || s.id.startsWith('p2a:') ||
          s.id.startsWith('p2b:') || s.id.startsWith('p3:'),
        )
        if (!anyStep || anyStep.stepTotal <= 0) return 0
        return Math.round(anyStep.stepTotal / 4)
      })()

  const pendingPhaseStages: LLMStageViewItem[] = PHASE_GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    status: 'pending' as const,
  }))

  const hasPhaseStages = stream.stages.some(
    (s) => s.id.startsWith('p1:') || s.id.startsWith('p2a:') || s.id.startsWith('p2b:') || s.id.startsWith('p3:'),
  )

  const displayStages: LLMStageViewItem[] = (() => {
    if (stream.stages.length === 0) return pendingPhaseStages
    if (hasPhaseStages) return buildPhaseGroupStages(stream.stages as LLMStageViewItem[], totalShots)
    return stream.stages as LLMStageViewItem[]
  })()

  const activeStageId = (() => {
    if (hasPhaseStages && stream.activeStepId) {
      const id = stream.activeStepId
      if (id.startsWith('p1:')) return 'phase_p1'
      if (id.startsWith('p2a:')) return 'phase_p2a'
      if (id.startsWith('p2b:')) return 'phase_p2b'
      if (id.startsWith('p3:')) return 'phase_p3'
    }
    // 有阶段数据但 activeStepId 未设置时，默认高亮第一阶段，而非末尾阶段
    if (hasPhaseStages) return 'phase_p1'
    return stream.activeStepId ?? displayStages[displayStages.length - 1]?.id ?? ''
  })()

  const displayScript = editedScript ?? scriptContent ?? ''

  return (
    <div className="flex flex-col gap-6">
      {/* 标题 & 状态 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--glass-text-primary)]">
            {t('finalScript.title')}
          </h2>
          <p className="text-sm text-[var(--glass-text-secondary)] mt-1">
            {episodeName ? `${episodeName} — ` : ''}{t('finalScript.description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!hasStoryboard || isGenerating}
            onClick={handleGenerate}
            className="glass-btn-base glass-btn-primary h-9 px-5 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isGenerating ? t('finalScript.generating') : t('finalScript.generateButton')}
          </button>
        </div>
      </div>

      {/* 最小化后的悬浮徽章 */}
      {showStreamCard && minimized && isGenerating && (
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="fixed right-6 bottom-6 z-120 glass-surface-modal rounded-2xl px-4 py-3 text-sm font-medium text-(--glass-tone-info-fg)"
        >
          {t('finalScript.streamBadge')}
        </button>
      )}

      {/* 流式推理卡片：运行中 / 失败时展示（全屏覆盖层） */}
      {showStreamCard && !minimized && (
        <div className="fixed inset-0 z-120 glass-overlay backdrop-blur-sm">
          <div className="mx-auto mt-4 h-[calc(100vh-2rem)] w-[min(96vw,1400px)]">
            <LLMStageStreamCard
              title={t('finalScript.title')}
              stages={displayStages}
              activeStageId={activeStageId}
              selectedStageId={selectedPhaseId}
              onSelectStage={handleSelectPhase}
              outputText={stream.outputText}
              overallProgress={stream.overallProgress}
              showCursor={stream.isRunning}
              errorMessage={stream.errorMessage || undefined}
              activeMessage={stream.activeMessage}
              topRightAction={(
                <div className="flex items-center gap-2">
                  {isGenerating && (
                    <button
                      type="button"
                      onClick={() => stream.stop()}
                      className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                    >
                      {t('finalScript.stopButton')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMinimized(true)}
                    className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                  >
                    {t('finalScript.minimize')}
                  </button>
                </div>
              )}
            />
          </div>
        </div>
      )}

      {/* 非流式状态：双栏编辑布局 */}
      {!showStreamCard && (
        <div className="grid grid-cols-2 gap-4">
          {/* 左: 故事原文 */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-[var(--glass-text-secondary)] uppercase tracking-wide">
              {t('finalScript.storyLabel')}
            </span>
            <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] overflow-hidden">
              <GlassTextarea
                readOnly
                value={novelText || ''}
                placeholder={t('finalScript.storyPlaceholder')}
                className="w-full min-h-[560px] !border-0 !bg-transparent !rounded-none opacity-70"
              />
            </div>
          </div>

          {/* 右: 脚本输出 */}
          <div className="flex flex-col gap-1 flex-1">
            <span className="text-xs font-semibold text-[var(--glass-accent)] uppercase tracking-wide">
              {t('finalScript.outputLabel')}
            </span>
            <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] overflow-hidden ring-1 ring-[var(--glass-accent)]/20">
              <GlassTextarea
                value={displayScript}
                onChange={(e) => setEditedScript(e.target.value)}
                placeholder={t('finalScript.outputPlaceholder')}
                className="w-full min-h-[560px] !border-0 !bg-transparent !rounded-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* 无分镜提示 */}
      {!hasStoryboard && (
        <div className="glass-surface p-4 text-center">
          <p className="text-sm text-[var(--glass-text-secondary)]">
            {t('finalScript.noStoryboard')}
          </p>
          <button
            type="button"
            onClick={() => runtime.onStageChange('lxt-storyboard')}
            className="glass-btn-base glass-btn-secondary h-8 px-4 text-xs mt-3"
          >
            {t('finalScript.goToStoryboardStage')}
          </button>
        </div>
      )}
    </div>
  )
}

