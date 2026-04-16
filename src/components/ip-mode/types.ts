/**
 * IP 角色模式前端类型定义
 */

export interface IpCharacterSummary {
  id: string
  name: string
  status: 'draft' | 'ready' | 'archived'
  faceReferenceUrl: string | null
  voiceId: string | null
  variantCount: number
  refSheetCount: number
  createdAt: string
  updatedAt: string
}

export interface IpCharacterDetail extends IpCharacterSummary {
  faceDescriptorJson: unknown | null
  softProfileJson: unknown | null
  voiceModelKey: string | null
  voiceEmotionConfigJson: unknown | null
  globalFolderId: string | null
  variants: IpVariantSummary[]
  refSheets: IpRefSheetSummary[]
}

export interface IpVariantSummary {
  id: string
  label: string
  previewUrl: string | null
  costumeJson: unknown | null
  createdAt: string
}

export interface IpRefSheetSummary {
  id: string
  type: 'turnaround' | 'expression' | 'pose' | 'detail'
  imageUrl: string | null
  status: string
  createdAt: string
}

export interface IpCastingSummary {
  id: string
  globalCharacterId: string
  characterName: string
  roleLabel: string | null
  appearanceIndex: number | null
  faceReferenceUrl: string | null
}

export interface IpScreenplaySegment {
  id: string
  order: number
  type: 'dialogue' | 'narration' | 'action' | 'transition'
  speakerLabel: string | null
  text: string
  emotionTag: string | null
  stageDirection: string | null
  durationHint: number | null
}

export interface CreateIpCharacterInput {
  name: string
  faceReferenceUrl?: string
  globalFolderId?: string
}

export interface UpdateIpCharacterInput {
  name?: string
  softProfileJson?: unknown
  faceDescriptorJson?: unknown
}

export interface CreateIpVariantInput {
  label: string
  costumeJson?: unknown
}

export interface CreateIpCastingInput {
  globalCharacterId: string
  castRole?: string
  appearanceIndex?: number
}
