import type { LxtFinalFilmRow } from './final-film'

const CONTEXT_WINDOW = 1

/**
 * Build a multi-shot video prompt for Seedance by combining adjacent shot
 * context into a "Shot N: ..." storyboard format.
 *
 * Seedance 2.0 interprets storyboard-style text prompts natively. Including
 * the shots before and after the current one gives the model temporal context
 * and produces smoother continuity.
 */
export function buildMultiShotVideoPrompt(
  currentRow: LxtFinalFilmRow,
  allRows: LxtFinalFilmRow[],
): string {
  const sorted = [...allRows].sort((a, b) => a.shotIndex - b.shotIndex)
  const currentIdx = sorted.findIndex((r) => r.shotIndex === currentRow.shotIndex)
  if (currentIdx === -1) return currentRow.videoPrompt || ''

  const start = Math.max(0, currentIdx - CONTEXT_WINDOW)
  const end = Math.min(sorted.length - 1, currentIdx + CONTEXT_WINDOW)
  const context = sorted.slice(start, end + 1)

  const parts = context
    .filter((row) => {
      if (row.shotIndex === currentRow.shotIndex) return true
      return !!(row.videoPrompt?.trim())
    })
    .map((row) => {
      const prompt = row.videoPrompt?.trim() || ''
      const prefix = row.shotIndex === currentRow.shotIndex ? '>>' : ' '
      const label = row.label ? ` (${row.label})` : ''
      return `${prefix}Shot ${row.shotIndex + 1}${label}: ${prompt}`
    })

  return parts.join('\n')
}
