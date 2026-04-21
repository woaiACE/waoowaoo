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
 */
export interface LxtParsedScriptShot {
  shotIndex: number
  label: string
  copyText: string
  imagePrompt: string
  videoPrompt: string
}

function readField(raw: string, keys: string[]): string {
  for (const key of keys) {
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      const m = trimmed.match(new RegExp(`^${key}\\s*[：:]\\s*(.+)$`))
      if (m?.[1]) return m[1].trim()
    }
  }
  return ''
}

/**
 * 将 scriptContent 按分镜块解析为结构化数组。
 * - 复用 parseLxtShots 作为唯一分隔入口
 * - 容错：字段缺失时返回空字符串
 */
export function parseLxtScript(scriptContent: string | null | undefined): LxtParsedScriptShot[] {
  if (!scriptContent?.trim()) return []
  const shots = parseLxtShots(scriptContent)
  return shots.map((shot) => ({
    shotIndex: shot.index,
    label: shot.label,
    copyText:    readField(shot.raw, ['镜头文案', '文案']),
    imagePrompt: readField(shot.raw, ['图片提示词', '提示词']),
    videoPrompt: readField(shot.raw, ['视频提示词']),
  }))
}
