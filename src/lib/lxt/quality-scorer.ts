export interface DramaBenchScores {
  format: number
  narrative: number
  character: number
  emotion: number
  logic: number
  conflict: number
  overall: number
}

export interface CriticResult {
  scores: DramaBenchScores
  strengths: string[]
  weaknesses: string[]
  repairAdvice: string
}

const DEFAULT_PASS_THRESHOLD = 0.7

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function clampScore(v: unknown): number {
  return isNumber(v) ? Math.max(0, Math.min(1, v)) : 0
}

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string').slice(0, 5)
}

export function scoreCriticResponse(text: string): CriticResult | null {
  try {
    let jsonText = text.trim()
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')

    const firstBrace = jsonText.indexOf('{')
    const lastBrace = jsonText.lastIndexOf('}')
    if (firstBrace === -1 || lastBrace === -1) return null

    const parsed = JSON.parse(jsonText.substring(firstBrace, lastBrace + 1))
    if (!parsed || typeof parsed !== 'object') return null

    const scores = parsed.scores
    const result: CriticResult = {
      scores: {
        format: clampScore(scores?.format),
        narrative: clampScore(scores?.narrative),
        character: clampScore(scores?.character),
        emotion: clampScore(scores?.emotion),
        logic: clampScore(scores?.logic),
        conflict: clampScore(scores?.conflict),
        overall: clampScore(parsed.overall ?? scores?.overall),
      },
      strengths: stringArray(parsed.strengths),
      weaknesses: stringArray(parsed.weaknesses),
      repairAdvice:
        typeof parsed.repair_advice === 'string' && parsed.repair_advice.trim()
          ? parsed.repair_advice.trim()
          : '',
    }

    // Compute overall from sub-scores if not explicitly provided
    if (!isNumber(parsed.overall) && !isNumber(scores?.overall)) {
      const dims = [
        result.scores.format,
        result.scores.narrative,
        result.scores.character,
        result.scores.emotion,
        result.scores.logic,
        result.scores.conflict,
      ]
      result.scores.overall = dims.reduce((a, b) => a + b, 0) / dims.length
    }

    return result
  } catch {
    return null
  }
}

export function isPassing(scores: DramaBenchScores, threshold = DEFAULT_PASS_THRESHOLD): boolean {
  return scores.overall >= threshold
}

export function computeAggregate(results: DramaBenchScores[]): DramaBenchScores {
  if (results.length === 0) {
    return { format: 0, narrative: 0, character: 0, emotion: 0, logic: 0, conflict: 0, overall: 0 }
  }
  const keys = ['format', 'narrative', 'character', 'emotion', 'logic', 'conflict'] as const
  const aggregate = {} as Record<string, number>
  for (const key of keys) {
    aggregate[key] = results.reduce((sum, r) => sum + r[key], 0) / results.length
  }
  aggregate.overall = keys.reduce((sum, k) => sum + aggregate[k], 0) / keys.length
  return aggregate as unknown as DramaBenchScores
}
