/**
 * IP 角色模式 — 资产管理 CRUD 服务
 */

import { prisma } from '@/lib/prisma'
import type { IpCharacterStatus } from '../types'

// ==================== IP 角色 CRUD ====================

export async function createIpCharacter(params: {
  userId: string
  name: string
  folderId?: string | null
  gender?: string | null
  ageRange?: string | null
  personality?: string | null
  speakingStyle?: string | null
  backstory?: string | null
  profileData?: string | null
  sourceGlobalCharacterId?: string | null
  sourceType?: string
}) {
  return prisma.ipCharacter.create({
    data: {
      userId: params.userId,
      name: params.name,
      folderId: params.folderId ?? null,
      gender: params.gender ?? null,
      ageRange: params.ageRange ?? null,
      personality: params.personality ?? null,
      speakingStyle: params.speakingStyle ?? null,
      backstory: params.backstory ?? null,
      profileData: params.profileData ?? null,
      sourceGlobalCharacterId: params.sourceGlobalCharacterId ?? null,
      sourceType: params.sourceType ?? 'manual',
      status: 'draft',
    },
    include: {
      variants: true,
      referenceSheets: true,
    },
  })
}

export async function getIpCharacter(id: string, userId: string) {
  return prisma.ipCharacter.findFirst({
    where: { id, userId },
    include: {
      variants: { orderBy: { sortOrder: 'asc' } },
      referenceSheets: { orderBy: { sheetType: 'asc' } },
    },
  })
}

export async function listIpCharacters(userId: string, options?: {
  folderId?: string | null
  status?: IpCharacterStatus
}) {
  const where: Record<string, unknown> = { userId }
  if (options?.folderId === 'null' || options?.folderId === null) {
    where.folderId = null
  } else if (options?.folderId) {
    where.folderId = options.folderId
  }
  if (options?.status) {
    where.status = options.status
  }

  return prisma.ipCharacter.findMany({
    where,
    include: {
      variants: { orderBy: { sortOrder: 'asc' } },
      referenceSheets: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function updateIpCharacter(id: string, userId: string, data: {
  name?: string
  aliases?: string | null
  gender?: string | null
  ageRange?: string | null
  personality?: string | null
  speakingStyle?: string | null
  backstory?: string | null
  profileData?: string | null
  bodyArchetype?: string | null
  status?: IpCharacterStatus
  folderId?: string | null
  voiceId?: string | null
  voiceType?: string | null
  customVoiceUrl?: string | null
  customVoiceMediaId?: string | null
  globalVoiceId?: string | null
  voiceEmotionConfig?: string | null
  faceDescriptor?: string | null
  faceReferenceUrl?: string | null
  faceMediaId?: string | null
}) {
  return prisma.ipCharacter.updateMany({
    where: { id, userId },
    data,
  })
}

export async function deleteIpCharacter(id: string, userId: string) {
  // 软删除: 设置为 archived
  return prisma.ipCharacter.updateMany({
    where: { id, userId },
    data: { status: 'archived' },
  })
}

// ==================== 形态预设 CRUD ====================

export async function createIpVariant(ipCharacterId: string, userId: string, data: {
  variantName: string
  costumeDescription?: string | null
  hairstyleDescription?: string | null
  accessoryDescription?: string | null
  environmentHint?: string | null
  isDefault?: boolean
}) {
  // 验证 IP 角色归属
  const character = await prisma.ipCharacter.findFirst({
    where: { id: ipCharacterId, userId },
  })
  if (!character) throw new Error('IP character not found')

  // 计算排序位置
  const maxSort = await prisma.ipCharacterVariant.aggregate({
    where: { ipCharacterId },
    _max: { sortOrder: true },
  })

  return prisma.ipCharacterVariant.create({
    data: {
      ipCharacterId,
      variantName: data.variantName,
      costumeDescription: data.costumeDescription ?? null,
      hairstyleDescription: data.hairstyleDescription ?? null,
      accessoryDescription: data.accessoryDescription ?? null,
      environmentHint: data.environmentHint ?? null,
      isDefault: data.isDefault ?? false,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
  })
}

export async function listIpVariants(ipCharacterId: string) {
  return prisma.ipCharacterVariant.findMany({
    where: { ipCharacterId },
    orderBy: { sortOrder: 'asc' },
  })
}

export async function updateIpVariant(id: string, ipCharacterId: string, data: {
  variantName?: string
  costumeDescription?: string | null
  hairstyleDescription?: string | null
  accessoryDescription?: string | null
  environmentHint?: string | null
  isDefault?: boolean
  previewUrl?: string | null
  previewMediaId?: string | null
  previewUrls?: string | null
  selectedPreviewIndex?: number | null
}) {
  return prisma.ipCharacterVariant.updateMany({
    where: { id, ipCharacterId },
    data,
  })
}

export async function deleteIpVariant(id: string, ipCharacterId: string) {
  return prisma.ipCharacterVariant.deleteMany({
    where: { id, ipCharacterId },
  })
}

// ==================== 参考图集 CRUD ====================

export async function createIpRefSheet(ipCharacterId: string, data: {
  sheetType: string
  description?: string | null
}) {
  return prisma.ipReferenceSheet.create({
    data: {
      ipCharacterId,
      sheetType: data.sheetType,
      description: data.description ?? null,
      status: 'pending',
    },
  })
}

export async function listIpRefSheets(ipCharacterId: string) {
  return prisma.ipReferenceSheet.findMany({
    where: { ipCharacterId },
    orderBy: { createdAt: 'asc' },
  })
}

export async function updateIpRefSheet(id: string, data: {
  status?: string
  imageUrl?: string | null
  imageMediaId?: string | null
  imageUrls?: string | null
  taskId?: string | null
}) {
  return prisma.ipReferenceSheet.update({
    where: { id },
    data,
  })
}
