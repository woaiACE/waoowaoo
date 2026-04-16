'use client'

import DirectorShotCard from './DirectorShotCard'
import type { DirectorSceneViewModel, DirectorShotViewModel } from './director-mode.types'

interface DirectorShotGridProps {
  scene: DirectorSceneViewModel | null
  onSelectShot: (shot: DirectorShotViewModel) => void
}

export default function DirectorShotGrid({ scene, onSelectShot }: DirectorShotGridProps) {
  if (!scene) {
    return (
      <section className="rounded-3xl border border-white/10 bg-black/20 p-6 text-sm text-white/70 backdrop-blur-sm">
        暂无可展示的导演结果。
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-white/10 bg-black/20 p-4 backdrop-blur-sm">
        <div className="text-xs text-white/50">Scene {scene.sceneNumber}</div>
        <div className="mt-1 text-xl font-semibold text-white">{scene.location}</div>
        <div className="mt-2 text-sm text-white/70">{scene.time} · {scene.characters.join('、') || '无角色'}</div>
        {scene.content ? <p className="mt-3 text-sm leading-6 text-white/80">{scene.content}</p> : null}
      </div>

      <div className="space-y-4">
        {scene.shots.map((shot) => (
          <DirectorShotCard key={shot.key} shot={shot} onClick={() => onSelectShot(shot)} />
        ))}
      </div>
    </section>
  )
}
