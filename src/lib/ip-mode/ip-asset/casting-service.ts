/**
 * IP 角色模式 — 选角服务
 * 基于全局资产库角色（GlobalCharacter），无需独立 IpCharacter
 */

import { prisma } from '@/lib/prisma'

const globalCharacterInclude = {
  appearances: {
    orderBy: { appearanceIndex: 'asc' as const },
    take: 1, // 默认取主形象
  },
}

export async function createIpCasting(params: {
  projectId: string
  globalCharacterId: string
  appearanceIndex?: number | null
  castRole?: string | null
  personalityOverride?: string | null
  speakingStyleOverride?: string | null
}) {
  return prisma.ipCasting.create({
    data: {
      projectId: params.projectId,
      globalCharacterId: params.globalCharacterId,
      appearanceIndex: params.appearanceIndex ?? null,
      castRole: params.castRole ?? null,
      personalityOverride: params.personalityOverride ?? null,
      speakingStyleOverride: params.speakingStyleOverride ?? null,
    },
    include: {
      globalCharacter: { include: globalCharacterInclude },
    },
  })
}

export async function listIpCastings(projectId: string) {
  return prisma.ipCasting.findMany({
    where: { projectId },
    include: {
      globalCharacter: {
        include: {
          appearances: { orderBy: { appearanceIndex: 'asc' } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
}

export async function getIpCasting(id: string) {
  return prisma.ipCasting.findUnique({
    where: { id },
    include: {
      globalCharacter: {
        include: {
          appearances: { orderBy: { appearanceIndex: 'asc' } },
        },
      },
    },
  })
}

export async function updateIpCasting(id: string, data: {
  appearanceIndex?: number | null
  castRole?: string | null
  personalityOverride?: string | null
  speakingStyleOverride?: string | null
  projectCharacterId?: string | null
}) {
  return prisma.ipCasting.update({
    where: { id },
    data,
    include: {
      globalCharacter: true,
    },
  })
}

export async function deleteIpCasting(id: string) {
  return prisma.ipCasting.delete({
    where: { id },
  })
}

export async function setProjectIpMode(projectId: string, enabled: boolean) {
  return prisma.novelPromotionProject.update({
    where: { id: projectId },
    data: { ipModeEnabled: enabled },
  })
}

export async function getProjectIpMode(projectId: string) {
  const project = await prisma.novelPromotionProject.findUnique({
    where: { id: projectId },
    select: { ipModeEnabled: true },
  })
  return project?.ipModeEnabled ?? false
}
