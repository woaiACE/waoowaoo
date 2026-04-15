import { embedText, embedBatch } from './service'
import { findBestMatch, type VectorEntry } from './cosine'

export interface CharacterIndexEntry {
  id: string
  name: string
  aliases: string[]
  introduction: string
}

export interface EmbedConfig {
  userId: string
  providerId: string
  modelId: string
}

/**
 * 为一批角色建立内存向量索引。
 * 代表文本 = name + aliases + introduction 前 200 字。
 * embed 失败的角色会被跳过（不影响其余条目）。
 */
export async function buildCharacterIndex(
  characters: CharacterIndexEntry[],
  config: EmbedConfig,
): Promise<VectorEntry<CharacterIndexEntry>[]> {
  if (characters.length === 0) return []
  const texts = characters.map(makeRepresentText)
  const vectors = await embedBatch({ ...config, texts })

  const index: VectorEntry<CharacterIndexEntry>[] = []
  for (let i = 0; i < characters.length; i++) {
    const vec = vectors[i]
    if (vec) {
      index.push({ id: characters[i].id, payload: characters[i], vector: vec })
    }
  }
  return index
}

/**
 * 用候选文本查询索引，返回语义最近且超过阈值的角色。
 * config 为 null 或索引为空时直接返回 null（跳过 embedding）。
 */
export async function resolveCharacterByEmbedding(
  candidateText: string,
  index: VectorEntry<CharacterIndexEntry>[],
  config: EmbedConfig | null,
  threshold = 0.82,
): Promise<CharacterIndexEntry | null> {
  if (!config || index.length === 0) return null
  const vec = await embedText({ ...config, text: candidateText })
  if (!vec) return null
  const match = findBestMatch(vec, index, threshold)
  return match?.payload ?? null
}

function makeRepresentText(c: CharacterIndexEntry): string {
  const aliasPart = c.aliases.length > 0 ? `，又称${c.aliases.join('、')}` : ''
  const introPart = c.introduction ? `。${c.introduction.slice(0, 200)}` : ''
  return `${c.name}${aliasPart}${introPart}`
}
