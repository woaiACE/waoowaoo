/**
 * IP 角色模式 — 选角服务
 */

import { prisma } from '@/lib/prisma'

export async function createIpCasting(params: {
  projectId: string
  ipCharacterId: string
  ipVariantId?: string | null
  castRole?: string | null
  personalityOverride?: string | null
  speakingStyleOverride?: string | null
}) {
  return prisma.ipCasting.create({
    data: {
      projectId: params.projectId,
      ipCharacterId: params.ipCharacterId,
      ipVariantId: params.ipVariantId ?? null,
      castRole: params.castRole ?? null,
      personalityOverride: params.personalityOverride ?? null,
      speakingStyleOverride: params.speakingStyleOverride ?? null,
    },
    include: {
      ipCharacter: {
        include: { variants: true },
      },
      ipVariant: true,
    },
  })
}

export async function listIpCastings(projectId: string) {
  return prisma.ipCasting.findMany({
    where: { projectId },
    include: {
      ipCharacter: {
        include: {
          variants: { orderBy: { sortOrder: 'asc' } },
          referenceSheets: true,
        },
      },
      ipVariant: true,
    },
    orderBy: { createdAt: 'asc' },
  })
}

export async function getIpCasting(id: string) {
  return prisma.ipCasting.findUnique({
    where: { id },
    include: {
      ipCharacter: {
        include: {
          variants: true,
          referenceSheets: true,
        },
      },
      ipVariant: true,
    },
  })
}

export async function updateIpCasting(id: string, data: {
  ipVariantId?: string | null
  castRole?: string | null
  personalityOverride?: string | null
  speakingStyleOverride?: string | null
  projectCharacterId?: string | null
}) {
  return prisma.ipCasting.update({
    where: { id },
    data,
    include: {
      ipCharacter: true,
      ipVariant: true,
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
