'use client'

import type { ReactNode } from 'react'
import { AppIcon } from '@/components/ui/icons'

type UnifiedAssetToolbarProps = {
  title: string
  countText: string
  leftSlot?: ReactNode
  rightSlot?: ReactNode
  onDownloadAll?: () => void
  isDownloading?: boolean
  disableDownload?: boolean
  downloadTitle?: string
}

export default function UnifiedAssetToolbar({
  title,
  countText,
  leftSlot,
  rightSlot,
  onDownloadAll,
  isDownloading = false,
  disableDownload = false,
  downloadTitle = '下载全部',
}: UnifiedAssetToolbarProps) {
  return (
    <div className="glass-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-[var(--glass-text-secondary)] inline-flex items-center gap-2">
            <AppIcon name="diamond" className="w-4 h-4 text-[var(--glass-tone-info-fg)]" />
            {title}
          </span>
          {leftSlot}
          <span className="text-sm text-[var(--glass-text-tertiary)]">{countText}</span>
        </div>
        <div className="flex items-center gap-2">
          {rightSlot}
          {onDownloadAll ? (
            <button
              type="button"
              onClick={onDownloadAll}
              disabled={isDownloading || disableDownload}
              title={downloadTitle}
              className="glass-btn-base glass-btn-secondary flex items-center justify-center w-9 h-9 disabled:opacity-50 disabled:cursor-not-allowed border border-[var(--glass-stroke-base)]"
            >
              <AppIcon
                name={isDownloading ? 'refresh' : 'download'}
                className={`w-4 h-4 ${isDownloading ? 'animate-spin' : ''}`}
              />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
