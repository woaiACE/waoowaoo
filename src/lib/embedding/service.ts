import { runOpenAICompatEmbeddings } from '@/lib/model-gateway/openai-compat/embeddings'

export interface EmbedTextParams {
  userId: string
  providerId: string
  modelId: string
  text: string
}

/**
 * 调用 embedding 模型，返回向量。
 * 失败时（模型未配置 / 网络错误 / 模型不支持）静默返回 null，调用方降级到字符串匹配。
 */
export async function embedText(params: EmbedTextParams): Promise<number[] | null> {
  try {
    const result = await runOpenAICompatEmbeddings({
      userId: params.userId,
      providerId: params.providerId,
      modelId: params.modelId,
      input: params.text,
    })
    return result.embeddings[0] ?? null
  } catch {
    return null
  }
}

/**
 * 批量 embed，返回与 texts 等长的数组（每项 number[] | null）。
 * 整批失败时所有项返回 null，调用方降级到字符串匹配。
 */
export async function embedBatch(
  params: Omit<EmbedTextParams, 'text'> & { texts: string[] },
): Promise<Array<number[] | null>> {
  if (params.texts.length === 0) return []
  try {
    const result = await runOpenAICompatEmbeddings({
      userId: params.userId,
      providerId: params.providerId,
      modelId: params.modelId,
      input: params.texts,
    })
    return params.texts.map((_, i) => result.embeddings[i] ?? null)
  } catch {
    return params.texts.map(() => null)
  }
}
