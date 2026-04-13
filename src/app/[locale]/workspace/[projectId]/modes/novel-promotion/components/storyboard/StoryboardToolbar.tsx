'use client'

import { useTranslations } from 'next-intl'
import type { TaskPresentationState } from '@/lib/task/presentation'
import StoryboardHeader from './StoryboardHeader'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { AppIcon } from '@/components/ui/icons'
import { GlassButton } from '@/components/ui/primitives'

interface StoryboardToolbarProps {
  totalSegments: number
  totalPanels: number
  isDownloadingImages: boolean
  runningCount: number
  pendingPanelCount: number
  isBatchSubmitting: boolean
  addingStoryboardGroup: boolean
  addingStoryboardGroupState: TaskPresentationState | null
  pendingVoiceCount?: number
  isBatchVoiceSubmitting?: boolean
  onDownloadAllImages: () => Promise<void>
  onGenerateAllPanels: () => Promise<void>
  onGenerateAllImagesAndVoices?: () => void
  onGenerateAllVoices?: () => void
  onAddStoryboardGroupAtStart: () => void
  onBack: () => void
}

export default function StoryboardToolbar({
  totalSegments,
  totalPanels,
  isDownloadingImages,
  runningCount,
  pendingPanelCount,
  isBatchSubmitting,
  addingStoryboardGroup,
  addingStoryboardGroupState,
  pendingVoiceCount,
  isBatchVoiceSubmitting,
  onDownloadAllImages,
  onGenerateAllPanels,
  onGenerateAllImagesAndVoices,
  onGenerateAllVoices,
  onAddStoryboardGroupAtStart,
  onBack,
}: StoryboardToolbarProps) {
  const t = useTranslations('storyboard')
  return (
    <>
      <StoryboardHeader
        totalSegments={totalSegments}
        totalPanels={totalPanels}
        isDownloadingImages={isDownloadingImages}
        runningCount={runningCount}
        pendingPanelCount={pendingPanelCount}
        isBatchSubmitting={isBatchSubmitting}
        pendingVoiceCount={pendingVoiceCount}
        isBatchVoiceSubmitting={isBatchVoiceSubmitting}
        onDownloadAllImages={onDownloadAllImages}
        onGenerateAllPanels={onGenerateAllPanels}
        onGenerateAllImagesAndVoices={onGenerateAllImagesAndVoices}
        onGenerateAllVoices={onGenerateAllVoices}
        onBack={onBack}
      />

      <div className="flex justify-center">
        <GlassButton
          variant="ghost"
          size="sm"
          onClick={onAddStoryboardGroupAtStart}
          disabled={addingStoryboardGroup}
          className="opacity-60 hover:opacity-100"
        >
          {addingStoryboardGroup ? (
            <TaskStatusInline state={addingStoryboardGroupState} />
          ) : (
            <>
              <AppIcon name="plusAlt" className="w-4 h-4" />
              <span>{t('group.addAtStart')}</span>
            </>
          )}
        </GlassButton>
      </div>
    </>
  )
}
