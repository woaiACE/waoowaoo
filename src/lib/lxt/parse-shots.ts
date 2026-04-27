export interface LxtShotDialogue {
  speaker: string
  style: string   // "普通对话" | "独白" | "画外音" | "画外音(旁白)"
  text: string
}

export interface LxtShotJson {
  shot_label: string
  scene: string
  visual: string
  characters: string[]
  character_actions: string
  dialogue: LxtShotDialogue[]
  emotion: string
  props?: string[]
}

export type LxtShot = {
  index: number   // 0-based
  label: string   // e.g. "分镜1"
  raw: string     // 该分镜完整文本块（文本格式，供模板使用）
  json?: LxtShotJson  // JSON 格式的结构化数据（当 storyboard 输出 JSON 时填充）
}

function serializeShotJsonToText(json: LxtShotJson): string {
  const chars = json.characters.join('、')
  const dialogueLines = json.dialogue.map((d) => `${d.speaker}(${d.style})：${d.text}`)
  return [
    json.shot_label,
    `场景：${json.scene}`,
    `画面内容：${json.visual}`,
    `出场角色：${chars}  角色行动：${json.character_actions}`,
    `对白信息：${dialogueLines.join('\n')}`,
  ].join('\n')
}

function tryParseShotJson(text: string): LxtShotJson[] | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  // 先处理 markdown 代码块包裹（模板要求 ```json 包裹）
  let inner = trimmed
  const fenced = inner.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i)
  if (fenced) inner = fenced[1].trim()
  if (!inner.startsWith('[')) return null
  try {
    const parsed = JSON.parse(inner)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    // 验证第一条记录的必要字段
    if (!parsed[0].shot_label || !parsed[0].visual) return null
    return parsed as LxtShotJson[]
  } catch {
    return null
  }
}

/**
 * 将 shotListContent 解析为有序分镜数组。
 * 自动检测 JSON 格式：如果内容以 `[` 开头则按 JSON 数组解析，
 * 否则按 "分镜N" 分隔符的文本格式解析。
 */
export function parseLxtShots(shotListContent: string): LxtShot[] {
  const jsonShots = tryParseShotJson(shotListContent)
  if (jsonShots) {
    return jsonShots.map((json, index) => ({
      index,
      label: json.shot_label,
      raw: serializeShotJsonToText(json),
      json,
    }))
  }

  // 传统文本格式解析
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

// ---- 字段读取工具 ----

const SPLIT_RE = /[、，,\/|；;]+/
const IGNORE_NAMES = new Set([
  '无', '暂无', '无角色', '无道具', '无人物', '空镜', '环境',
  '多人', '若干', 'none', 'n/a', '-', '/',
])

function normalizeName(value: string): string {
  return value
    .replace(/[【】\[\]()（）]/g, ' ')
    .replace(/^[-:：*•\s]+/, '')
    .replace(/[-:：*•\s]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function splitNames(rawValue: string): string[] {
  return rawValue
    .split(SPLIT_RE)
    .map(normalizeName)
    .filter((p) => p.length > 0 && !IGNORE_NAMES.has(p))
}

function readLineValue(raw: string, labels: string[]): string[] {
  const results: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    for (const label of labels) {
      const m = trimmed.match(new RegExp(`^${label}\\s*[：:]\\s*(.+?)(?:\\s{2,}|$)`))
      if (m?.[1]?.trim()) {
        results.push(...splitNames(m[1]))
      }
    }
  }
  return results
}

/**
 * 从分镜中读取指定字段值，优先从 json 结构化数据读取，回退到 raw 文本正则匹配。
 *
 * @param shot 分镜对象
 * @param labels 字段标签候选（如 ['出场角色', '角色', '人物', '主角']），按优先级排列
 * @returns 字段值数组
 */
export function getShotField(shot: LxtShot, labels: string[]): string[] {
  if (shot.json) {
    for (const label of labels) {
      switch (label) {
        case '出场角色': case '角色': case '人物': case '主角':
          return shot.json.characters
        case '场景': case '地点': case '环境':
          return [shot.json.scene]
        case '道具': case '关键道具': case '物件': case '主要道具':
          return shot.json.props || []
        default:
          continue
      }
    }
  }
  return readLineValue(shot.raw, labels)
}
