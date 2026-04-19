import { parseLxtShots } from './parse-shots'

export type LxtAssetKind = 'character' | 'location' | 'prop'

export interface LxtExtractedAsset {
  kind: LxtAssetKind
  name: string
  summary?: string | null
  sourceShotLabels: string[]
}

export interface LxtPromptAssetSummary {
  kind: string
  name: string
  summary?: string | null
  voiceType?: string | null
  voiceId?: string | null
  customVoiceUrl?: string | null
}

const SPLIT_RE = /[、，,\/|；;]+/
const IGNORE_NAMES = new Set(['无', '暂无', '无角色', '无道具', '无人物', '空镜', '环境', '多人', '若干'])

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
    .map((part) => normalizeName(part))
    .filter((part) => part.length > 0 && !IGNORE_NAMES.has(part))
}

function readLineValue(raw: string, labels: string[]): string[] {
  const results: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    for (const label of labels) {
      const pattern = new RegExp(`^${label}\\s*[：:]\\s*(.+)$`)
      const match = trimmed.match(pattern)
      if (match?.[1]) {
        results.push(...splitNames(match[1]))
      }
    }
  }
  return results
}

function addAsset(
  target: Map<string, LxtExtractedAsset>,
  kind: LxtAssetKind,
  name: string,
  shotLabel: string,
) {
  const key = `${kind}:${name}`
  const current = target.get(key)
  if (current) {
    if (!current.sourceShotLabels.includes(shotLabel)) current.sourceShotLabels.push(shotLabel)
    return
  }
  target.set(key, {
    kind,
    name,
    sourceShotLabels: [shotLabel],
  })
}

export function extractLxtAssetsFromShotList(shotListContent: string) {
  const shots = parseLxtShots(shotListContent || '')
  const bucket = new Map<string, LxtExtractedAsset>()

  for (const shot of shots) {
    const characters = readLineValue(shot.raw, ['出场角色', '角色', '人物', '主角'])
    const locations = readLineValue(shot.raw, ['场景', '地点', '环境'])
    const props = readLineValue(shot.raw, ['道具', '关键道具', '物件'])

    characters.forEach((name) => addAsset(bucket, 'character', name, shot.label))
    locations.forEach((name) => addAsset(bucket, 'location', name, shot.label))
    props.forEach((name) => addAsset(bucket, 'prop', name, shot.label))
  }

  const all = Array.from(bucket.values())

  return {
    all,
    characters: all.filter((item) => item.kind === 'character'),
    locations: all.filter((item) => item.kind === 'location'),
    props: all.filter((item) => item.kind === 'prop'),
  }
}

export function buildLxtAssetPromptContext(assets: LxtPromptAssetSummary[]): string {
  if (!assets || assets.length === 0) return ''

  const groups = {
    character: assets.filter((item) => item.kind === 'character'),
    location: assets.filter((item) => item.kind === 'location'),
    prop: assets.filter((item) => item.kind === 'prop'),
  }

  const lines: string[] = []

  if (groups.character.length > 0) {
    lines.push('角色资产：')
    for (const item of groups.character) {
      const extra = [item.summary, item.voiceType ? `音色类型=${item.voiceType}` : null, item.voiceId ? `音色ID=${item.voiceId}` : null]
        .filter(Boolean)
        .join('；')
      lines.push(`- ${item.name}${extra ? `（${extra}）` : ''}`)
    }
  }

  if (groups.location.length > 0) {
    lines.push('场景资产：')
    for (const item of groups.location) {
      lines.push(`- ${item.name}${item.summary ? `（${item.summary}）` : ''}`)
    }
  }

  if (groups.prop.length > 0) {
    lines.push('道具资产：')
    for (const item of groups.prop) {
      lines.push(`- ${item.name}${item.summary ? `（${item.summary}）` : ''}`)
    }
  }

  return lines.join('\n')
}
