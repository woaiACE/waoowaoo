/**
 * 余弦相似度，值域 [-1, 1]，1 表示方向完全相同。
 * 任一向量为空 / 维度不匹配时返回 0（安全降级）。
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length !== a.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

export interface VectorEntry<T> {
  id: string
  payload: T
  vector: number[]
}

/**
 * 从 corpus 中找出与 query 余弦相似度最高且超过 threshold 的条目。
 * 未找到（或 corpus 为空）时返回 null。
 * @param threshold 相似度下界，默认 0.82
 */
export function findBestMatch<T>(
  query: number[],
  corpus: VectorEntry<T>[],
  threshold = 0.82,
): VectorEntry<T> | null {
  let best: VectorEntry<T> | null = null
  // 必须严格超过阈值才算命中
  let bestScore = threshold - 0.0001

  for (const entry of corpus) {
    const score = cosineSimilarity(query, entry.vector)
    if (score > bestScore) {
      bestScore = score
      best = entry
    }
  }
  return best
}
