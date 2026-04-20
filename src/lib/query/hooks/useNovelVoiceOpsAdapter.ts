'use client'

/**
 * useNovelVoiceOpsAdapter — 通用（小说推广）模式音色操作适配器
 *
 * 将 novel-promotion 专属 mutations 包装成 VoiceOpsAdapter 接口。
 * 供 VoiceSettingsPanel 使用，与 useLxtVoiceOpsAdapter 对称。
 *
 * 调用方：
 *   const adapter = useNovelVoiceOpsAdapter({ projectId, characterId, character, onBindVoice })
 *   <VoiceSettingsPanel adapter={adapter} />
 */

import { useCallback } from 'react'
import {
  useUploadProjectCharacterVoice,
  useSaveProjectDesignedVoice,
} from '@/lib/query/mutations/character-voice-mutations'
import { useDesignProjectVoice } from '@/lib/query/mutations/useVoiceMutations'
import { generateVoiceDesignOptions } from '@/components/voice/voice-design-shared'
import type { VoiceOpsAdapter } from '@/components/voice/voice-ops-adapter'

interface CharacterVoiceFields {
  id: string
  name: string
  voiceId?: string | null
  voiceType?: string | null
  customVoiceUrl?: string | null
}

interface UseNovelVoiceOpsAdapterParams {
  projectId: string
  character: CharacterVoiceFields
  /** 打开声音库选择弹窗（由父组件控制状态） */
  onBindVoice: () => void
}

export function useNovelVoiceOpsAdapter({
  projectId,
  character,
  onBindVoice,
}: UseNovelVoiceOpsAdapterParams): VoiceOpsAdapter {
  const uploadMutation = useUploadProjectCharacterVoice(projectId)
  const saveDesignedMutation = useSaveProjectDesignedVoice(projectId)
  const designVoiceMutation = useDesignProjectVoice(projectId)

  const uploadVoice = useCallback(async (file: File) => {
    await uploadMutation.mutateAsync({ file, characterId: character.id })
  }, [uploadMutation, character.id])

  const saveDesignedVoice = useCallback(async (voiceId: string, audioBase64: string) => {
    await saveDesignedMutation.mutateAsync({ characterId: character.id, voiceId, audioBase64 })
  }, [saveDesignedMutation, character.id])

  const designVoice = useCallback(async (voicePrompt: string, previewText: string) => {
    const voices = await generateVoiceDesignOptions({
      count: 1,
      voicePrompt,
      previewText,
      defaultPreviewText: previewText,
      onDesignVoice: (payload) => designVoiceMutation.mutateAsync(payload),
    })
    const first = voices[0]
    if (first?.audioBase64 && first?.voiceId) {
      await saveDesignedMutation.mutateAsync({
        characterId: character.id,
        voiceId: first.voiceId,
        audioBase64: first.audioBase64,
      })
    }
  }, [designVoiceMutation, saveDesignedMutation, character.id])

  return {
    // State
    customVoiceUrl: character.customVoiceUrl,
    voiceId: character.voiceId,
    voiceType: character.voiceType,
    characterName: character.name,

    // Ops
    uploadVoice,
    isUploadingVoice: uploadMutation.isPending,

    saveDesignedVoice,
    isSavingDesignedVoice: saveDesignedMutation.isPending,

    designVoice,
    isDesigningVoice: designVoiceMutation.isPending || saveDesignedMutation.isPending,

    openVoiceLibraryPicker: onBindVoice,

    // Novel mode has no AI voice prompt inference
    inferVoicePrompt: undefined,
    isInferringVoicePrompt: false,
  }
}
