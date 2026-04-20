'use client'

/**
 * useLxtVoiceOpsAdapter — LXT 模式音色操作适配器
 *
 * 将 LXT 专属的 mutations 包装成通用 VoiceOpsAdapter 接口，
 * 供 VoiceSettingsPanel 使用。
 *
 * 调用方：
 *   const adapter = useLxtVoiceOpsAdapter({ projectId, assetId, asset, onBindVoice })
 *   <VoiceSettingsPanel adapter={adapter} />
 */

import { useCallback } from 'react'
import {
  useUploadLxtAssetVoice,
  useDesignLxtAssetVoice,
  useInferLxtAssetVoicePrompt,
} from '@/lib/query/hooks/useLxtAssets'
import type { LxtProjectAsset } from '@/lib/query/hooks/useLxtAssets'
import type { VoiceOpsAdapter } from '@/components/voice/voice-ops-adapter'

interface UseLxtVoiceOpsAdapterParams {
  projectId: string | null
  assetId: string
  asset: LxtProjectAsset
  /** 打开声音库选择弹窗（由父组件控制状态） */
  onBindVoice: () => void
}

export function useLxtVoiceOpsAdapter({
  projectId,
  assetId,
  asset,
  onBindVoice,
}: UseLxtVoiceOpsAdapterParams): VoiceOpsAdapter {
  const uploadMutation = useUploadLxtAssetVoice(projectId)
  const designMutation = useDesignLxtAssetVoice(projectId)
  const inferMutation = useInferLxtAssetVoicePrompt(projectId)

  const uploadVoice = useCallback(async (file: File) => {
    await uploadMutation.mutateAsync({ assetId, file })
  }, [uploadMutation, assetId])

  const saveDesignedVoice = useCallback(async (_voiceId: string, _audioBase64: string) => {
    // LXT 通过 designVoice 自动写回，此方法暂不单独使用
  }, [])

  const designVoice = useCallback(async (voicePrompt: string, previewText: string) => {
    await designMutation.mutateAsync({ assetId, voicePrompt, previewText })
  }, [designMutation, assetId])

  const inferVoicePrompt = useCallback(async () => {
    const result = await inferMutation.mutateAsync(assetId)
    return result.voicePrompt
  }, [inferMutation, assetId])

  return {
    // State
    customVoiceUrl: asset.customVoiceUrl,
    voiceId: asset.voiceId,
    voiceType: asset.voiceType,
    characterName: asset.name,

    // Ops
    uploadVoice,
    isUploadingVoice: uploadMutation.isPending,

    saveDesignedVoice,
    isSavingDesignedVoice: false,

    designVoice,
    isDesigningVoice: designMutation.isPending,

    openVoiceLibraryPicker: onBindVoice,

    // LXT-only
    inferVoicePrompt,
    isInferringVoicePrompt: inferMutation.isPending,
  }
}
