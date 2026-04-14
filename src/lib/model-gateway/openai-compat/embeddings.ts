import { createOpenAICompatClient, resolveOpenAICompatClientConfig } from './common'

export interface OpenAICompatEmbeddingRequest {
  userId: string
  providerId: string
  modelId: string
  input: string | string[]
}

export interface OpenAICompatEmbeddingResult {
  embeddings: number[][]
  promptTokens?: number
  totalTokens?: number
}

export async function runOpenAICompatEmbeddings(
  input: OpenAICompatEmbeddingRequest,
): Promise<OpenAICompatEmbeddingResult> {
  const config = await resolveOpenAICompatClientConfig(input.userId, input.providerId)
  const client = createOpenAICompatClient(config)
  const response = await client.embeddings.create({
    model: input.modelId,
    input: input.input,
  })

  return {
    embeddings: response.data.map((item) => item.embedding),
    ...(typeof response.usage?.prompt_tokens === 'number' ? { promptTokens: response.usage.prompt_tokens } : {}),
    ...(typeof response.usage?.total_tokens === 'number' ? { totalTokens: response.usage.total_tokens } : {}),
  }
}
