'use client'

import type { DirectorSceneViewModel } from './director-mode.types'

interface DirectorSceneSidebarProps {
  scenes: DirectorSceneViewModel[]
  activeSceneId: string | null
  onSelectScene: (sceneId: string) => void
}

export default function DirectorSceneSidebar({ scenes, activeSceneId, onSelectScene }: DirectorSceneSidebarProps) {
  return (
    <aside className="rounded-3xl border border-white/10 bg-black/20 p-3 backdrop-blur-sm">
      <div className="mb-3 px-2 text-sm font-medium text-white/70">场次导航</div>
      <div className="space-y-2">
        {scenes.map((scene) => {
          const isActive = scene.sceneId === activeSceneId
          return (
            <button
              key={scene.sceneId}
              type="button"
              onClick={() => onSelectScene(scene.sceneId)}
              className={`w-full rounded-2xl border px-3 py-3 text-left transition ${isActive ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-white">Scene {scene.sceneNumber}</span>
                <span className="text-xs text-white/60">{scene.shotCount} 镜头</span>
              </div>
              <div className="mt-1 text-sm text-white/80">{scene.location}</div>
              <div className="mt-1 text-xs text-white/60">{scene.time} · {scene.characters.join('、') || '无角色'}</div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
