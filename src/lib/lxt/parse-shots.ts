export type LxtShot = {
  index: number   // 0-based
  label: string   // e.g. "分镜1"
  raw: string     // 该分镜完整文本块
}

/**
 * 将 shotListContent 按 "分镜N" 分隔符解析为有序数组
 */
export function parseLxtShots(shotListContent: string): LxtShot[] {
  const segments = shotListContent.split(/(?=^分镜\d+[\s\S]{0,5}\n)/m).filter((s) => s.trim())
  return segments.map((segment, index) => {
    const labelMatch = segment.match(/^(分镜\d+)/)
    return {
      index,
      label: labelMatch ? labelMatch[1] : `分镜${index + 1}`,
      raw: segment.trim(),
    }
  })
}
