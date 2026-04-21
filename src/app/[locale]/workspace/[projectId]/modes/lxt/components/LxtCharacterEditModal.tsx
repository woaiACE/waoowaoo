'use client'

import { useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { shouldShowError } from '@/lib/error-utils'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { apiFetch } from '@/lib/api-fetch'
import { AiModifyDescriptionField } from '@/components/shared/assets/AiModifyDescriptionField'
import { useUpdateLxtAsset, useGenerateLxtAssetImage } from '@/lib/query/hooks/useLxtAssets'

export interface LxtCharacterEditModalProps {
  projectId: string
  assetId: string
  assetKind: 'character' | 'location' | 'prop'
  characterName: string
  /** asset.summary — 角色介绍 / 场景备注 */
  introduction: string | null
  /** asset.description — 形象描述提示词 */
  description: string
  isGeneratingImage?: boolean
  onClose: () => void
  /** 保存完成后通知父组件（传入 assetId）*/
  onSave: (assetId: string) => void
}

const KIND_LABELS = {
  character: '角色',
  location: '场景',
  prop: '道具',
}

export function LxtCharacterEditModal({
  projectId,
  assetId,
  assetKind,
  characterName,
  introduction,
  description,
  isGeneratingImage = false,
  onClose,
  onSave,
}: LxtCharacterEditModalProps) {
  const [editingName, setEditingName] = useState(characterName)
  const [editingIntroduction, setEditingIntroduction] = useState(introduction ?? '')
  const [editingDescription, setEditingDescription] = useState(description)
  const [aiInstruction, setAiInstruction] = useState('')
  const [isAiModifying, setIsAiModifying] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const updateAsset = useUpdateLxtAsset(projectId)
  const generateImage = useGenerateLxtAssetImage(projectId)

  const aiModifyingState = isAiModifying
    ? resolveTaskPresentationState({ phase: 'processing', intent: 'process', resource: 'text', hasOutput: false })
    : null
  const savingState = isSaving
    ? resolveTaskPresentationState({ phase: 'processing', intent: 'modify', resource: 'image', hasOutput: true })
    : null
  const taskRunningState = isGeneratingImage
    ? resolveTaskPresentationState({ phase: 'processing', intent: 'modify', resource: 'image', hasOutput: true })
    : null

  const handleAiModify = async (): Promise<boolean> => {
    if (!aiInstruction.trim()) return false
    setIsAiModifying(true)
    try {
      const res = await apiFetch(`/api/lxt/${projectId}/assets/${assetId}/ai-modify-description`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentDescription: editingDescription,
          modifyInstruction: aiInstruction,
        }),
      })
      if (!res.ok || !res.body) throw new Error('AI 改写请求失败')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let resultText = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as { kind: string; delta?: string; message?: string }
            if (event.kind === 'text' && event.delta) {
              resultText += event.delta
              setEditingDescription(resultText)
            } else if (event.kind === 'error') {
              throw new Error(event.message ?? 'AI 改写失败')
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue
            throw parseErr
          }
        }
      }

      if (resultText.trim()) {
        setEditingDescription(resultText.trim())
        setAiInstruction('')
        return true
      }
      return false
    } catch (err) {
      if (shouldShowError(err)) {
        alert(`AI 改写失败: ${err instanceof Error ? err.message : '未知错误'}`)
      }
      return false
    } finally {
      setIsAiModifying(false)
    }
  }

  const handleSaveOnly = async () => {
    setIsSaving(true)
    try {
      await updateAsset.mutateAsync({
        assetId,
        name: editingName.trim() || characterName,
        summary: editingIntroduction,
        description: editingDescription,
      })
      onSave(assetId)
      onClose()
    } catch (err) {
      if (shouldShowError(err)) {
        alert(`保存失败: ${err instanceof Error ? err.message : '未知错误'}`)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveAndGenerate = () => {
    // 立即关闭，后台执行保存+生成
    onClose()
    void (async () => {
      try {
        await updateAsset.mutateAsync({
          assetId,
          name: editingName.trim() || characterName,
          summary: editingIntroduction,
          description: editingDescription,
        })
        await generateImage.mutateAsync({ assetId })
        onSave(assetId)
      } catch {
        // 错误由后台静默处理，不影响已关闭的弹框
      }
    })()
  }

  const kindLabel = KIND_LABELS[assetKind] ?? '资产'

  return (
    <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50 p-4">
      <div className="glass-surface-modal max-w-2xl w-full max-h-[80vh] flex flex-col">
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* 标题栏 */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">
              编辑{kindLabel} - {characterName}
            </h3>
            <button
              onClick={onClose}
              className="glass-btn-base glass-btn-soft w-9 h-9 rounded-full text-[var(--glass-text-tertiary)]"
            >
              <AppIcon name="close" className="w-6 h-6" />
            </button>
          </div>

          {/* 角色名称 */}
          <div className="space-y-2">
            <label className="glass-field-label block">{kindLabel}名</label>
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              className="glass-input-base w-full px-3 py-2"
              placeholder={`${kindLabel}名称`}
            />
          </div>

          {/* 角色介绍 / 场景备注 */}
          <div className="space-y-2">
            <label className="glass-field-label block">
              {assetKind === 'character' ? '角色介绍' : `${kindLabel}说明`}
            </label>
            <textarea
              value={editingIntroduction}
              onChange={(e) => setEditingIntroduction(e.target.value)}
              rows={3}
              className="glass-textarea-base w-full px-3 py-2 resize-none"
              placeholder={
                assetKind === 'character'
                  ? '描述角色在故事中的身份、叙述视角（如我对应谁）、其他角色如何称呼等'
                  : `描述${kindLabel}的背景信息…`
              }
            />
            {assetKind === 'character' && (
              <p className="glass-field-hint">
                描述角色在故事中的身份、叙述视角（如我对应谁）、其他角色如何称呼等
              </p>
            )}
          </div>

          {/* 形象描述提示词 + AI 改写 */}
          <AiModifyDescriptionField
            label="形象描述提示词"
            description={editingDescription}
            onDescriptionChange={setEditingDescription}
            descriptionPlaceholder="AI 生成的视觉形象描述，可手动编辑后用于图像生成…"
            descriptionHeightClassName="h-64"
            aiInstruction={aiInstruction}
            onAiInstructionChange={setAiInstruction}
            aiInstructionPlaceholder={
              assetKind === 'character'
                ? '例如：把发型改成金色卷发，添加眼镜…'
                : '例如：改成夜晚氛围，增加霓虹灯效果…'
            }
            onAiModify={handleAiModify}
            isAiModifying={isAiModifying}
            aiModifyingState={aiModifyingState}
            actionLabel="AI修改描述"
            cancelLabel="取消"
          />
        </div>

        {/* 底部按钮栏 */}
        <div className="flex gap-3 justify-end p-4 border-t border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] rounded-b-lg flex-shrink-0">
          <button
            onClick={onClose}
            className="glass-btn-base glass-btn-secondary px-4 py-2 rounded-lg"
            disabled={isSaving}
          >
            取消
          </button>
          <button
            onClick={() => void handleSaveOnly()}
            disabled={isSaving || !editingDescription.trim()}
            className="glass-btn-base glass-btn-tone-info px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? (
              <TaskStatusInline state={savingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
            ) : (
              '仅保存'
            )}
          </button>
          <button
            onClick={handleSaveAndGenerate}
            disabled={isSaving || isGeneratingImage || !editingDescription.trim()}
            className="glass-btn-base glass-btn-primary px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isGeneratingImage ? (
              <TaskStatusInline state={taskRunningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
            ) : (
              '保存并生成'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
