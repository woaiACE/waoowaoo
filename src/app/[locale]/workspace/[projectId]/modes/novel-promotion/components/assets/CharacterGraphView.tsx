'use client'

import dynamic from 'next/dynamic'
import { useLocale, useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { useCharacterRelations } from '@/lib/query/hooks'

// 懒加载 ReactFlow 组件（包含 CSS 导入，避免 SSR 问题）
const CharacterGraph = dynamic(() => import('./CharacterGraph'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <span className="animate-pulse">Loading graph...</span>
    </div>
  ),
})

// 关系类型图例配置
const RELATION_LEGEND = [
  { labelKey: 'superior', color: '#6b7280', dash: false },
  { labelKey: 'friendly', color: '#3b82f6', dash: false },
  { labelKey: 'romantic', color: '#ec4899', dash: false },
  { labelKey: 'family', color: '#f59e0b', dash: false },
  { labelKey: 'ally', color: '#14b8a6', dash: false },
  { labelKey: 'hostile', color: '#ef4444', dash: true },
  { labelKey: 'rival', color: '#dc2626', dash: true },
  { labelKey: 'competing', color: '#8b5cf6', dash: true },
  { labelKey: 'other', color: '#9ca3af', dash: false },
]

const ROLE_LEVEL_LEGEND = [
  { level: 'S', color: '#f59e0b', labelKey: 'S' },
  { level: 'A', color: '#8b5cf6', labelKey: 'A' },
  { level: 'B', color: '#3b82f6', labelKey: 'B' },
  { level: 'C', color: '#14b8a6', labelKey: 'C' },
  { level: 'D', color: '#6b7280', labelKey: 'D' },
]

interface CharacterGraphViewProps {
  projectId: string
  isGlobalAnalyzing: boolean
  onRunGlobalAnalyze: () => void
  onNodeClick?: (characterName: string) => void
}

export default function CharacterGraphView({
  projectId,
  isGlobalAnalyzing,
  onRunGlobalAnalyze,
  onNodeClick,
}: CharacterGraphViewProps) {
  const locale = useLocale()
  const t = useTranslations('assets')
  const { data, isLoading, isError } = useCharacterRelations(projectId)

  const hasRelations = data?.hasRelations ?? (data?.relations?.length ?? 0) > 0
  const hasCharacters = (data?.characters?.length ?? 0) > 0
  const hasCompletedGlobalAnalyze = data?.hasCompletedGlobalAnalyze ?? false
  const lastGlobalAnalyzeAtText = data?.lastGlobalAnalyzeAt
    ? new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(data.lastGlobalAnalyzeAt))
    : null

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <span className="text-muted-foreground animate-pulse">{t('graph.loading')}</span>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-96 items-center justify-center">
        <span className="text-destructive">{t('graph.loadFailed')}</span>
      </div>
    )
  }

  if (!hasCharacters) {
    return (
      <div className="flex flex-col h-96 items-center justify-center gap-3 text-muted-foreground">
        <AppIcon name="usersRound" className="w-12 h-12 opacity-40" />
        <p className="text-sm font-medium">{t('graph.noCharacters')}</p>
        <p className="text-xs opacity-70">{t('graph.requireGlobalAnalyze')}</p>
        <button
          type="button"
          onClick={onRunGlobalAnalyze}
          disabled={isGlobalAnalyzing}
          className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          <AppIcon name="brain" className="h-3.5 w-3.5" />
          {isGlobalAnalyzing ? t('graph.globalAnalyzing') : t('graph.runGlobalAnalyze')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 图谱主体 */}
      <div
        className="rounded-xl border border-border overflow-hidden"
        style={{ height: 520, background: '#f9fafb', position: 'relative' }}
      >
        {!hasCompletedGlobalAnalyze && (
          <div className="absolute top-3 left-3 z-10 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-xs shadow-sm">
            <div className="font-medium">{t('graph.requireGlobalAnalyze')}</div>
            <div className="mt-1 opacity-80">{t('graph.noGlobalAnalyzeYet')}</div>
          </div>
        )}

        {hasCompletedGlobalAnalyze && lastGlobalAnalyzeAtText && (
          <div className="absolute top-3 left-3 z-10 rounded-lg border border-border bg-white/90 text-muted-foreground px-3 py-1.5 text-xs shadow-sm backdrop-blur-sm">
            {t('graph.lastAnalyzeAt', { time: lastGlobalAnalyzeAtText })}
          </div>
        )}

        {hasRelations ? (
          <CharacterGraph characters={data!.characters} relations={data!.relations} onNodeClick={onNodeClick} />
        ) : (
          /* 有角色但没有关系——仍然渲染节点，只是没有边 */
          <CharacterGraph characters={data!.characters} relations={[]} onNodeClick={onNodeClick} />
        )}

        {/* 无关系提示浮层 */}
        {!hasRelations && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-2 bg-white/90 border border-border rounded-lg px-4 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
              <AppIcon name="infoCircle" className="h-4 w-4" />
              <span>{t('graph.noRelationsHint')}</span>
              <button
                type="button"
                onClick={onRunGlobalAnalyze}
                disabled={isGlobalAnalyzing}
                className="ml-1 inline-flex items-center gap-1 rounded-md border border-primary/30 px-2 py-0.5 text-primary hover:bg-primary/10 disabled:opacity-60"
              >
                <AppIcon name="refresh" className="h-3 w-3" />
                {isGlobalAnalyzing ? t('graph.globalAnalyzing') : t('graph.runGlobalAnalyze')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 图例区 */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 px-1">
        {/* 节点等级图例 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium">{t('graph.roleLegendTitle')}</span>
          {ROLE_LEVEL_LEGEND.map(({ level, color, labelKey }) => (
            <div key={level} className="flex items-center gap-1">
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: color,
                  opacity: 0.9,
                }}
              />
              <span className="text-xs text-muted-foreground">
                {level} {t(`graph.roleLevel.${labelKey}`)}
              </span>
            </div>
          ))}
        </div>

        {/* 关系类型图例 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium">{t('graph.relationLegendTitle')}</span>
          {RELATION_LEGEND.map(({ labelKey, color, dash }) => (
            <div key={labelKey} className="flex items-center gap-1">
              <div
                className="flex-none"
                style={{
                  width: 24,
                  height: 2,
                  background: color,
                  borderTop: dash ? `2px dashed ${color}` : undefined,
                  backgroundColor: dash ? 'transparent' : color,
                }}
              />
              <span className="text-xs" style={{ color }}>
                {t(`graph.relationType.${labelKey}`)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 统计信息 */}
      <p className="text-xs text-muted-foreground px-1">
        {t('graph.summary', {
          characters: data?.characters?.length ?? 0,
          relations: data?.relations?.length ?? 0,
        })}
      </p>
    </div>
  )
}
