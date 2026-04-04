'use client'

import Image from 'next/image'
import { AppIcon } from '@/components/ui/icons'
import { getStyleConfigById } from '@/lib/style-categories'

interface StyleSelectorCardProps {
  /** 当前选中的画风 ID（如 'pixar-3d'） */
  currentStyleId: string
  /** 点击卡片时的回调，用于打开 StyleSelectorModal */
  onClick: () => void
  /** 按钮是否禁用 */
  disabled?: boolean
}

/**
 * 画风选择入口卡片 (Trigger)
 *
 * 展示当前选中的画风名称 + 缩略图 + 更换提示。
 * 点击后由父组件控制打开 StyleSelectorModal。
 */
export default function StyleSelectorCard({
  currentStyleId,
  onClick,
  disabled = false,
}: StyleSelectorCardProps) {
  const currentStyle = getStyleConfigById(currentStyleId)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl',
        'glass-btn-base glass-btn-soft border border-[var(--glass-stroke-base)]',
        'transition-all duration-200',
        'hover:border-[var(--glass-stroke-strong)] hover:scale-[1.01]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100',
        'text-left',
      ].join(' ')}
    >
      {/* 缩略图 */}
      <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-[var(--glass-surface-soft)]">
        <Image
          src={currentStyle.coverUrl}
          alt={currentStyle.name}
          fill
          sizes="40px"
          className="object-cover transition-transform duration-300 group-hover:scale-110"
          onError={(e) => {
            // 封面图 404 时自动切换到 picsum 占位图，使用 style id 作为 seed 保证图片唯一
            const img = e.target as HTMLImageElement
            const seed = encodeURIComponent(currentStyle.id)
            img.src = `https://picsum.photos/seed/${seed}/80/80`
            img.onerror = null  // 防止 picsum 也失败时死循环
          }}
        />
        {/* 后备：风格名首字（图片完全无法加载时显示） */}
        <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-[var(--glass-text-tertiary)]">
          {currentStyle.name[0]}
        </span>
      </div>

      {/* 文字区域 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--glass-text-primary)] truncate">
          {currentStyle.name}
        </p>
        <p className="text-xs text-[var(--glass-text-tertiary)] mt-0.5">
          点击更换画风
        </p>
      </div>

      {/* 右侧图标 */}
      <div className="flex-shrink-0 text-[var(--glass-text-tertiary)] group-hover:text-[var(--glass-text-secondary)] transition-colors">
        <AppIcon name="chevronRight" className="w-4 h-4" />
      </div>
    </button>
  )
}
