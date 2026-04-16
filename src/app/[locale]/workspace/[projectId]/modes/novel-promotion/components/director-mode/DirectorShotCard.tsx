'use client'

import type { DirectorShotViewModel } from './director-mode.types'

interface DirectorShotCardProps {
  shot: DirectorShotViewModel
  onClick?: () => void
}

function PromptBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-white/50">{label}</div>
      <div className="mt-1 line-clamp-3 text-xs text-white/80">{value || '暂无提示词'}</div>
    </div>
  )
}

export default function DirectorShotCard({ shot, onClick }: DirectorShotCardProps) {
  return (
    <article className="rounded-3xl border border-white/10 bg-black/20 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Shot {shot.shotNumber}</div>
          <div className="mt-1 text-xs text-white/60">
            {shot.shotType} · {shot.cameraAngle} · {shot.cameraMovement} · {shot.durationHint}
          </div>
        </div>
        {onClick ? (
          <button type="button" onClick={onClick} className="glass-btn-base glass-btn-secondary rounded-xl px-3 py-1.5 text-xs">
            查看详情
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.2fr,1fr]">
        <div className="space-y-3">
          <div>
            <div className="text-xs text-white/50">主体</div>
            <div className="text-sm text-white/90">{shot.subject}</div>
          </div>
          <div>
            <div className="text-xs text-white/50">导演描述</div>
            <div className="text-sm leading-6 text-white/85">{shot.description}</div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/80">
              <div className="mb-1 text-white/50">镜头文案</div>
              {shot.shotCaption || shot.voiceLine || '无'}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/80">
              <div className="mb-1 text-white/50">音效</div>
              {shot.soundEffect || '无'}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs text-white/50">四格图提示词</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <PromptBlock label="LT" value={shot.imagePrompts.lt} />
            <PromptBlock label="RT" value={shot.imagePrompts.rt} />
            <PromptBlock label="LB" value={shot.imagePrompts.lb} />
            <PromptBlock label="RB" value={shot.imagePrompts.rb} />
          </div>
        </div>
      </div>
    </article>
  )
}
