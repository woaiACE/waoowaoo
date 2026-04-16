'use client'

interface DirectorModeOverviewProps {
  episodeName?: string
  status?: string | null
  generatedAt?: string | null
  summary: {
    sceneCount: number
    shotCount: number
    totalDurationSeconds: number
    characterCount: number
    locationCount: number
  }
  onRerun?: () => void
  onExport?: () => void
  onJumpToVideos?: () => void
}

function formatStatus(status?: string | null) {
  switch (status) {
    case 'completed':
      return '已生成'
    case 'running':
      return '生成中'
    case 'failed':
      return '生成失败'
    case 'queued':
      return '排队中'
    default:
      return '待生成'
  }
}

export default function DirectorModeOverview({
  episodeName,
  status,
  generatedAt,
  summary,
  onRerun,
  onExport,
  onJumpToVideos,
}: DirectorModeOverviewProps) {
  const metaItems = [
    { label: '场次', value: summary.sceneCount },
    { label: '镜头', value: summary.shotCount },
    { label: '预计时长', value: `${summary.totalDurationSeconds} 秒` },
    { label: '角色数', value: summary.characterCount },
    { label: '场景数', value: summary.locationCount },
  ]

  return (
    <section className="rounded-3xl border border-white/10 bg-black/20 p-5 shadow-sm backdrop-blur-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="text-xs font-medium text-white/60">导演模式结果工作台</div>
          <h2 className="text-2xl font-semibold text-white">
            {episodeName || '当前剧集'}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-white/70">
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-emerald-200">
              {formatStatus(status)}
            </span>
            {generatedAt ? (
              <span>生成时间：{new Date(generatedAt).toLocaleString()}</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {onRerun ? (
            <button type="button" onClick={onRerun} className="glass-btn-base glass-btn-secondary rounded-xl px-3 py-2 text-sm">
              重新运行
            </button>
          ) : null}
          {onExport ? (
            <button type="button" onClick={onExport} className="glass-btn-base glass-btn-secondary rounded-xl px-3 py-2 text-sm">
              导出 JSON
            </button>
          ) : null}
          {onJumpToVideos ? (
            <button type="button" onClick={onJumpToVideos} className="glass-btn-base glass-btn-primary rounded-xl px-3 py-2 text-sm text-white">
              继续生成视频
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metaItems.map((item) => (
          <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="text-xs text-white/60">{item.label}</div>
            <div className="mt-1 text-lg font-semibold text-white">{item.value}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
