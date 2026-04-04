'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '@/components/ui/icons'
import { STYLE_CATEGORIES, type StyleItem } from '@/lib/style-categories'

interface StyleSelectorModalProps {
  open: boolean
  currentStyleId: string
  onSelect: (style: StyleItem) => void
  onClose: () => void
}

/**
 * 画风视觉化选择器（全屏 Portal Modal）
 *
 * 交互结构：
 *   左侧栏  — 8 大类目垂直列表（固定宽度）
 *   右侧内容 — 当前类目下画风的 3列图片卡片网格
 *
 * 渲染方式：
 *   通过 createPortal 挂载到 document.body，
 *   z-[200] 确保显示在所有父级 Modal（SettingsModal z-[100] 等）上方，
 *   避免被父容器的 overflow-hidden / overflow-y-auto 裁切。
 */
export default function StyleSelectorModal({
  open,
  currentStyleId,
  onSelect,
  onClose,
}: StyleSelectorModalProps) {
  const [activeCategoryId, setActiveCategoryId] = useState(
    () =>
      STYLE_CATEGORIES.find((cat) =>
        (cat.styles as readonly { id: string }[]).some((s) => s.id === currentStyleId),
      )?.id ?? STYLE_CATEGORIES[0].id,
  )
  const [mounted, setMounted] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)

  // SSR 安全：仅在客户端挂载后启用 createPortal
  useEffect(() => {
    setMounted(true)
  }, [])

  // 打开时将 activeCategoryId 同步到当前选中风格所在类目
  useEffect(() => {
    if (!open) return
    const cat = STYLE_CATEGORIES.find((c) =>
      (c.styles as readonly { id: string }[]).some((s) => s.id === currentStyleId),
    )
    if (cat) setActiveCategoryId(cat.id)
  }, [open, currentStyleId])

  // 键盘 Escape 关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // 锁定滚动
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const activeCategory =
    STYLE_CATEGORIES.find((cat) => cat.id === activeCategoryId) ?? STYLE_CATEGORIES[0]

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) onClose()
  }

  const handleSelect = (style: StyleItem) => {
    onSelect(style)
    onClose()
  }

  if (!mounted || !open) return null

  return createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[200] glass-overlay flex items-center justify-center p-4 sm:p-6"
      onClick={handleBackdropClick}
    >
      <div
        className="glass-surface-modal w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="选择画风"
      >
        {/* ── 顶部标题栏 ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-stroke-base)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <AppIcon name="sparklesAlt" className="w-5 h-5 text-[var(--glass-accent-from)]" />
            <h2 className="text-base font-semibold text-[var(--glass-text-primary)]">
              选择画风
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="glass-btn-base glass-btn-soft w-8 h-8 rounded-full flex items-center justify-center text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-primary)] transition-colors"
            aria-label="关闭"
          >
            <AppIcon name="close" className="w-4 h-4" />
          </button>
        </div>

        {/* ── 主体：左侧类目 + 右侧卡片网格 ────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0">
          {/* 左侧类目导航栏 */}
          <nav
            className="w-36 sm:w-44 flex-shrink-0 overflow-y-auto app-scrollbar py-3 px-2 border-r border-[var(--glass-stroke-base)] space-y-1"
            aria-label="画风类目"
          >
            {STYLE_CATEGORIES.map((cat) => {
              const isActive = cat.id === activeCategoryId
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategoryId(cat.id)}
                  className={[
                    'w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-150',
                    isActive
                      ? 'bg-[var(--glass-tone-info-surface)] text-[var(--glass-tone-info-fg)] font-semibold'
                      : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-surface-soft)] hover:text-[var(--glass-text-primary)]',
                  ].join(' ')}
                >
                  {cat.name}
                </button>
              )
            })}
          </nav>

          {/* 右侧风格卡片网格 */}
          <div className="flex-1 overflow-y-auto app-scrollbar p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(activeCategory.styles as unknown as StyleItem[]).map((style) => {
                const isSelected = style.id === currentStyleId
                return (
                  <StyleCard
                    key={style.id}
                    style={style}
                    isSelected={isSelected}
                    onSelect={handleSelect}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ─── 风格卡片子组件 ────────────────────────────────────────────────────────────

interface StyleCardProps {
  style: StyleItem
  isSelected: boolean
  onSelect: (style: StyleItem) => void
}

function StyleCard({ style, isSelected, onSelect }: StyleCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(style)}
      className={[
        'group relative rounded-xl overflow-hidden aspect-[4/3] w-full',
        'transition-all duration-200 cursor-pointer',
        // 选中态：高亮边框 + 阴影
        isSelected
          ? 'ring-2 ring-[var(--glass-accent-from)] ring-offset-2 ring-offset-[var(--glass-surface-modal)] shadow-lg shadow-[var(--glass-accent-from)]/20'
          : 'ring-1 ring-[var(--glass-stroke-base)] hover:ring-[var(--glass-stroke-strong)] hover:shadow-md',
      ].join(' ')}
      aria-label={`选择 ${style.name}`}
      aria-pressed={isSelected}
    >
      {/* 封面图（带 Hover 放大动效） */}
      <div className="absolute inset-0 bg-[var(--glass-surface-soft)] overflow-hidden">
        <Image
          src={style.coverUrl}
          alt={style.name}
          fill
          sizes="(max-width: 640px) 45vw, 30vw"
          className="object-cover transition-transform duration-300 group-hover:scale-110"
          onError={(e) => {
            // 封面图 404 时自动切换到 picsum 占位图，使用 style id 作为 seed 保证图片唯一
            const img = e.target as HTMLImageElement
            const seed = encodeURIComponent(style.id)
            img.src = `https://picsum.photos/seed/${seed}/400/300`
            img.onerror = null  // 防止 picsum 也失败时死循环
          }}
        />
        {/* 图片完全不可用时的字符后备（picsum 也失败时显示） */}
        <div className="absolute inset-0 flex items-center justify-center text-3xl font-bold text-[var(--glass-text-tertiary)]/40 select-none pointer-events-none">
          {style.name[0]}
        </div>
      </div>

      {/* 底部半透明遮罩 + 风格名 */}
      <div
        className={[
          'absolute bottom-0 inset-x-0 px-3 py-2',
          'bg-gradient-to-t from-black/70 via-black/30 to-transparent',
          'transition-opacity duration-200',
          isSelected ? 'opacity-100' : 'opacity-80 group-hover:opacity-100',
        ].join(' ')}
      >
        <p className="text-white text-sm font-medium truncate text-left">{style.name}</p>
      </div>

      {/* 选中勾选角标 */}
      {isSelected && (
        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[var(--glass-accent-from)] flex items-center justify-center shadow-md">
          <AppIcon name="check" className="w-3.5 h-3.5 text-white" />
        </div>
      )}
    </button>
  )
}
