/**
 * IP 角色模式 — 特征解耦器
 *
 * 将 IP 角色的不可变特征 (面部/骨架) 和可变特征 (服装/发型)
 * 分层组装为增强版 image prompt，确保面部一致性。
 */

import type { DecomposedPrompt } from '../types'
import type { IpCharacter, IpCharacterVariant } from '@prisma/client'

/**
 * 从 IP 角色 + 变体 + 场景 prompt 中解耦特征
 */
export function decomposeFeatures(params: {
  ipCharacter: IpCharacter
  variant: IpCharacterVariant | null
  panelPrompt: string | null
  sceneContext: string | null
}): DecomposedPrompt {
  const { ipCharacter, variant, panelPrompt, sceneContext } = params

  // 解析面部描述
  let faceDescription = ''
  if (ipCharacter.faceDescriptor) {
    try {
      const descriptor = JSON.parse(ipCharacter.faceDescriptor)
      faceDescription = descriptor.summary || ''
    } catch {
      faceDescription = ipCharacter.faceDescriptor
    }
  }

  return {
    immutableFeatures: {
      faceDescription,
      bodyArchetype: ipCharacter.bodyArchetype || '',
    },
    mutableFeatures: {
      costume: variant?.costumeDescription || '',
      hairstyle: variant?.hairstyleDescription || '',
      accessories: variant?.accessoryDescription || '',
      environment: variant?.environmentHint || '',
    },
    sceneContext: parseSceneContext(panelPrompt, sceneContext),
  }
}

function parseSceneContext(panelPrompt: string | null, photographyRules: string | null): DecomposedPrompt['sceneContext'] {
  const context: DecomposedPrompt['sceneContext'] = {
    action: '',
    emotion: '',
    cameraAngle: '',
    lighting: '',
  }

  if (photographyRules) {
    try {
      const rules = JSON.parse(photographyRules)
      if (typeof rules === 'object' && rules !== null) {
        context.cameraAngle = rules.shotType || rules.cameraAngle || ''
        context.lighting = rules.lighting || ''
      }
    } catch {
      // 非 JSON，作为纯文本处理
    }
  }

  if (panelPrompt) {
    context.action = panelPrompt
  }

  return context
}

/**
 * 将解耦后的特征组装为最终的 image prompt
 *
 * 不可变层放在最前面，使 image model 优先关注面部一致性
 */
export function assembleIpImagePrompt(decomposed: DecomposedPrompt): string {
  const parts: string[] = []

  // 不可变层（最高优先级）
  const immutable = [
    decomposed.immutableFeatures.faceDescription,
    decomposed.immutableFeatures.bodyArchetype,
  ].filter(Boolean).join(', ')

  if (immutable) {
    parts.push(`[CHARACTER IDENTITY - MUST PRESERVE] ${immutable}`)
  }

  // 可变层
  const mutable = [
    decomposed.mutableFeatures.costume,
    decomposed.mutableFeatures.hairstyle,
    decomposed.mutableFeatures.accessories,
  ].filter(Boolean).join(', ')

  if (mutable) {
    parts.push(`[APPEARANCE] ${mutable}`)
  }

  // 环境
  if (decomposed.mutableFeatures.environment) {
    parts.push(`[ENVIRONMENT] ${decomposed.mutableFeatures.environment}`)
  }

  // 场景/动作
  if (decomposed.sceneContext.action) {
    parts.push(`[SCENE] ${decomposed.sceneContext.action}`)
  }

  // 摄影
  const camera = [
    decomposed.sceneContext.cameraAngle,
    decomposed.sceneContext.lighting,
  ].filter(Boolean).join(', ')

  if (camera) {
    parts.push(`[CAMERA] ${camera}`)
  }

  return parts.join('. ')
}

/**
 * 为 IP 模式构建 negative prompt 附加项
 */
export function buildIpNegativePromptSuffix(): string {
  return 'different face, wrong identity, inconsistent facial features, face morphing'
}
