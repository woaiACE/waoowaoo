import { parseLxtShots } from './parse-shots'

/**
 * 制作脚本单镜解析结果
 *
 * 来源：`LxtEpisode.scriptContent`
 * 格式（每镜）：
 *   分镜N
 *   镜头文案:...
 *   图片提示词:...
 *   视频提示词:...
 *   景别:
 *   语音分镜:...
 *   音效:...
 *   资产绑定:{"characters":[...],"scenes":[...],"props":[...]}  （可选，由 Phase1 LLM 输出）
 */

export interface LxtAssetBindings {
  characters: string[]
  scenes: string[]
  props: string[]
}

export interface LxtParsedScriptShot {
  shotIndex: number
  label: string
  copyText: string
  imagePrompt: string
  videoPrompt: string
  shotType: string
  assetBindings?: LxtAssetBindings
  /** 扁平资产绑定简写（Phase1 binding_string，供下游直接展示） */
  bindingString?: string
}

/** 所有已知字段前缀，用于多行字段识别"下一个字段从哪行开始"。 */
const KNOWN_FIELD_PREFIXES = [
  '镜头文案',
  '文案',
  '图片提示词',
  '提示词',
  '视频提示词',
  '景别',
  '语音分镜',
  '音效',
  '资产绑定',
  '资产绑定简写',
]

/**
 * 多行字段读取：从 `{key}:` 行起，读取到下一个已知字段前缀行（或块尾）为止。
 *
 * 解决 bug：当 LLM 把视频/图片提示词输出为多段（例如"第一个镜头...\n\n第二个镜头..."），
 * 原 single-line 匹配仅捕获首行，导致成片环节自动填充的 videoPrompt 只剩第一段。
 */
function readField(raw: string, keys: string[]): string {
  const lines = raw.split(/\r?\n/)
  for (const key of keys) {
    const headerRegex = new RegExp(`^\\s*${key}\\s*[：:]\\s*(.*)$`)
    for (let i = 0; i < lines.length; i++) {
      const headerMatch = lines[i].match(headerRegex)
      if (!headerMatch) continue

      const collected: string[] = []
      const first = (headerMatch[1] ?? '').trim()
      if (first) collected.push(first)

      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j]
        if (/^\s*分镜\d+\s*$/.test(nextLine)) break

        const nextIsKnownField = KNOWN_FIELD_PREFIXES.some((p) => {
          if (p === key) return false
          return new RegExp(`^\\s*${p}\\s*[：:]`).test(nextLine)
        })
        if (nextIsKnownField) break

        collected.push(nextLine)
      }

      const joined = collected.join('\n').replace(/\s+$/g, '').trim()
      if (joined) return joined
    }
  }
  return ''
}

function readAssetBindings(raw: string): LxtAssetBindings | undefined {
  for (const line of raw.split(/\r?\n/)) {
    const m = line.trim().match(/^资产绑定\s*[:：]\s*(.+)$/)
    if (m?.[1]) {
      try {
        const parsed = JSON.parse(m[1].trim()) as Record<string, unknown>
        if (parsed && typeof parsed === 'object') {
          const toStrArr = (v: unknown) =>
            Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
          return {
            characters: toStrArr(parsed['characters']),
            scenes: toStrArr(parsed['scenes']),
            props: toStrArr(parsed['props']),
          }
        }
      } catch {
        // malformed JSON — ignore, fallback to regex binding
      }
    }
  }
  return undefined
}

/**
 * 将 scriptContent 按分镜块解析为结构化数组。
 * - 复用 parseLxtShots 作为唯一分隔入口
 * - 容错：字段缺失时返回空字符串
 */
export function parseLxtScript(scriptContent: string | null | undefined): LxtParsedScriptShot[] {
  if (!scriptContent?.trim()) return []
  const shots = parseLxtShots(scriptContent)
  return shots.map((shot) => {
    const bindingString = readField(shot.raw, ['资产绑定简写']).trim() || undefined
    return {
      shotIndex: shot.index,
      label: shot.label,
      copyText:      readField(shot.raw, ['镜头文案', '文案']),
      imagePrompt:   readField(shot.raw, ['图片提示词', '提示词']),
      videoPrompt:   readField(shot.raw, ['视频提示词']),
      shotType:      readField(shot.raw, ['景别']),
      assetBindings: readAssetBindings(shot.raw),
      bindingString,
    }
  })
}
