'use client'

import type { DirectorShotViewModel } from './director-mode.types'

interface DirectorShotDetailModalProps {
  shot: DirectorShotViewModel | null
  onClose: () => void
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!value || typeof navigator === 'undefined' || !navigator.clipboard) return
        void navigator.clipboard.writeText(value)
      }}
      className="glass-btn-base glass-btn-secondary rounded-lg px-2 py-1 text-xs"
    >
      复制{label}
    </button>
  )
}

export default function DirectorShotDetailModal({ shot, onClose }: DirectorShotDetailModalProps) {
  if (!shot) return null

  return (
    <div className="fixed inset-0 z-120 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-[min(960px,100%)] overflow-y-auto rounded-3xl border border-white/10 bg-slate-950/95 p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-white/50">镜头详情</div>
            <h3 className="mt-1 text-2xl font-semibold">Shot {shot.shotNumber}</h3>
            <div className="mt-1 text-sm text-white/60">{shot.shotType} · {shot.cameraAngle} · {shot.cameraMovement}</div>
          </div>
          <button type="button" onClick={onClose} className="glass-btn-base glass-btn-secondary rounded-xl px-3 py-2 text-sm">
            关闭
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 text-xs text-white/50">导演描述</div>
              <div className="text-sm leading-6 text-white/85">{shot.description}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 text-xs text-white/50">全局空间位置</div>
              <div className="text-sm leading-6 text-white/85">{shot.globalPosition || '暂无'}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs text-white/50">视频提示词</span>
                <CopyButton value={shot.videoPrompt} label="视频提示词" />
              </div>
              <div className="text-sm leading-6 text-white/85">{shot.videoPrompt || '暂无'}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 text-xs text-white/50">声音设计</div>
              <div className="space-y-2 text-sm text-white/85">
                <div>镜头文案：{shot.shotCaption || '无'}</div>
                <div>音效：{shot.soundEffect || '暂无'}</div>
                <div>说话人：{shot.voiceSpeaker || '无'}</div>
                <div>对白：{shot.voiceLine || '无'}</div>
                <div>来源事件：{shot.sourceEvents.length > 0 ? shot.sourceEvents.join('、') : '无'}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 text-xs text-white/50">四格图提示词</div>
            <div className="space-y-3">
              {([
                ['LT', shot.imagePrompts.lt],
                ['RT', shot.imagePrompts.rt],
                ['LB', shot.imagePrompts.lb],
                ['RB', shot.imagePrompts.rb],
              ] as const).map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-white/60">{label}</span>
                    <CopyButton value={value} label={`${label} 提示词`} />
                  </div>
                  <div className="text-sm leading-6 text-white/85">{value || '暂无'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
