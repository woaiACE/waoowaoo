'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import DirectorModeOverview from './DirectorModeOverview'
import DirectorSceneSidebar from './DirectorSceneSidebar'
import DirectorShotGrid from './DirectorShotGrid'
import DirectorShotDetailModal from './DirectorShotDetailModal'
import { buildDirectorViewModel } from './buildDirectorViewModel'
import type { DirectorModeApiData, DirectorShotViewModel } from './director-mode.types'

interface DirectorModeStageViewProps {
  episodeName?: string
  data: DirectorModeApiData | null
  onRerun?: () => void
  onJumpToVideos?: () => void
}

export default function DirectorModeStageView({
  episodeName,
  data,
  onRerun,
  onJumpToVideos,
}: DirectorModeStageViewProps) {
  const viewModel = useMemo(() => buildDirectorViewModel(data), [data])
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)
  const [selectedShot, setSelectedShot] = useState<DirectorShotViewModel | null>(null)

  useEffect(() => {
    if (!viewModel) return
    if (!activeSceneId || !viewModel.scenes.some((scene) => scene.sceneId === activeSceneId)) {
      setActiveSceneId(viewModel.scenes[0]?.sceneId || null)
    }
  }, [viewModel, activeSceneId])

  const activeScene = useMemo(
    () => viewModel?.scenes.find((scene) => scene.sceneId === activeSceneId) || viewModel?.scenes[0] || null,
    [activeSceneId, viewModel],
  )

  const handleExport = useCallback(() => {
    if (!data || typeof window === 'undefined') return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${episodeName || 'director-mode'}-result.json`
    link.click()
    window.URL.revokeObjectURL(url)
  }, [data, episodeName])

  if (!viewModel) {
    return (
      <section className="rounded-3xl border border-dashed border-white/15 bg-black/20 p-8 text-center text-white/75 backdrop-blur-sm">
        <div className="text-lg font-semibold text-white">导演模式结果暂未生成</div>
        <p className="mt-2 text-sm">当前剧集还没有可审阅的导演结果，运行完成后会自动展示在这里。</p>
        {onRerun ? (
          <button type="button" onClick={onRerun} className="glass-btn-base glass-btn-primary mt-4 rounded-xl px-4 py-2 text-sm text-white">
            立即运行导演模式
          </button>
        ) : null}
      </section>
    )
  }

  return (
    <div className="space-y-6">
      <DirectorModeOverview
        episodeName={episodeName}
        status={viewModel.status}
        generatedAt={viewModel.generatedAt}
        summary={viewModel.summary}
        onRerun={onRerun}
        onExport={handleExport}
        onJumpToVideos={onJumpToVideos}
      />

      <div className="grid gap-6 xl:grid-cols-[280px,1fr]">
        <DirectorSceneSidebar
          scenes={viewModel.scenes}
          activeSceneId={activeScene?.sceneId || null}
          onSelectScene={(sceneId) => {
            setActiveSceneId(sceneId)
            setSelectedShot(null)
          }}
        />

        <DirectorShotGrid
          scene={activeScene}
          onSelectShot={(shot) => setSelectedShot(shot)}
        />
      </div>

      <DirectorShotDetailModal shot={selectedShot} onClose={() => setSelectedShot(null)} />
    </div>
  )
}
