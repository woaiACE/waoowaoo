import { prisma } from '@/lib/prisma'
import { listLmStudioModels } from '@/lib/lmstudio/native'
import type { EmbedConfig } from './character-index'

/**
 * 从用户配置中找第一个已加载的 LM Studio embedding 模型。
 * 以下情况返回 null，调用方自动降级到字符串匹配：
 *   - 用户未配置 lmstudio provider
 *   - LM Studio 中没有已加载的 embedding 模型
 *   - LM Studio 不可达（网络错误）
 */
export async function resolveEmbedConfig(userId: string): Promise<EmbedConfig | null> {
  try {
    const pref = await prisma.userPreference.findUnique({
      where: { userId },
      select: { customProviders: true },
    })
    if (!pref?.customProviders) return null

    let rawProviders: unknown
    try {
      rawProviders = JSON.parse(pref.customProviders)
    } catch {
      return null
    }
    if (!Array.isArray(rawProviders)) return null

    // 找到第一个 lmstudio provider
    const lmProvider = rawProviders.find((p) => {
      if (typeof p !== 'object' || !p) return false
      const id = String((p as Record<string, unknown>).id ?? '')
      const colonIdx = id.indexOf(':')
      const key = colonIdx === -1 ? id : id.slice(0, colonIdx)
      return key.toLowerCase() === 'lmstudio'
    }) as Record<string, unknown> | undefined

    if (!lmProvider) return null

    const providerId = String(lmProvider.id ?? '').trim()
    const baseUrl = String(lmProvider.baseUrl ?? '').trim()
    if (!providerId || !baseUrl) return null

    const apiKey = typeof lmProvider.apiKey === 'string' ? lmProvider.apiKey : undefined

    // 查询 LM Studio 原生 API，找到已加载的 embedding 模型
    const models = await listLmStudioModels({ baseUrl, apiKey })
    const embeddingModel = models.find((m) => m.type === 'embedding' && m.isLoaded)
    if (!embeddingModel) return null

    return {
      userId,
      providerId,
      modelId: embeddingModel.key,
    }
  } catch {
    // LM Studio 不可达或解析失败，降级
    return null
  }
}
