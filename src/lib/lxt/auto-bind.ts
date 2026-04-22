import { parseLxtShots } from './parse-shots'

/**
 * 按名称从资产库自动匹配角色/场景绑定
 *
 * 输入：
 *  - shotListContent：分镜脚本（每镜含"出场角色:"、"场景:"字段）
 *  - assets：资产库快照（只需 id / name / kind）
 *
 * 逻辑：
 *  1. 解析每个分镜的出场角色/场景名
 *  2. 按名称精确匹配资产库（不区分大小写、去除空格）
 *  3. 返回每个 shotIndex 对应的 bindings（未匹配到的不填）
 *
 * 注意：只写入能匹配到的资产，匹配不到的保持原有绑定（由外层 applyRowPatch merge 决定）
 */

export interface AutoBindAsset {
  id: string
  name: string
  kind: string
}

export interface AutoBindResult {
  shotIndex: number
  characterAssetIds: string[]
  sceneAssetId: string | null
  propAssetIds: string[]
}

const IGNORE_NAMES = new Set([
  '无', '暂无', '无角色', '无道具', '无人物', '空镜', '环境',
  '多人', '若干', 'none', 'n/a', '-', '/',
])

const SPLIT_RE = /[、，,\/|；;]+/

function normalizeName(value: string): string {
  return value
    .replace(/[【】\[\]()（）]/g, ' ')
    .replace(/^[-:：*•\s]+/, '')
    .replace(/[-:：*•\s]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase()
}

function splitNames(rawValue: string): string[] {
  return rawValue
    .split(SPLIT_RE)
    .map(normalizeName)
    .filter((p) => p.length > 0 && !IGNORE_NAMES.has(p))
}

function readLineValue(raw: string, labels: string[]): string[] {
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    for (const label of labels) {
      // 匹配字段值，遇到行内分隔符（连续两个或以上空格，如"出场角色：A、B  角色行动：…"）时截断
      const m = trimmed.match(new RegExp(`^${label}\\s*[：:]\\s*(.+?)(?:\\s{2,}|$)`))
      if (m?.[1]?.trim()) return splitNames(m[1])
    }
  }
  return []
}

export function autoBindAssetsFromShotList(
  shotListContent: string,
  assets: AutoBindAsset[],
): AutoBindResult[] {
  if (!shotListContent?.trim()) return []

  // 构建名称 → id 映射（忽略大小写 + 空格）
  const charMap = new Map<string, string>()
  const sceneMap = new Map<string, string>()
  const propMap = new Map<string, string>()
  for (const a of assets) {
    const key = normalizeName(a.name)
    if (!key) continue
    if (a.kind === 'character') charMap.set(key, a.id)
    if (a.kind === 'location') sceneMap.set(key, a.id)
    if (a.kind === 'prop') propMap.set(key, a.id)
  }

  const shots = parseLxtShots(shotListContent)
  return shots.map((shot) => {
    const charNames = readLineValue(shot.raw, ['出场角色', '角色', '人物', '主角'])
    const sceneNames = readLineValue(shot.raw, ['场景', '地点', '环境'])
    const propNames = readLineValue(shot.raw, ['道具', '关键道具', '物件', '主要道具'])

    const characterAssetIds = charNames
      .map((n) => charMap.get(n))
      .filter((id): id is string => !!id)

    // 场景匹配：优先精确，miss 后降级为包含匹配
    const sceneAssetId = findSceneId(sceneNames, sceneMap)

    const propAssetIds = propNames
      .map((n) => propMap.get(n))
      .filter((id): id is string => !!id)

    return { shotIndex: shot.index, characterAssetIds, sceneAssetId, propAssetIds }
  })
}

/** 精确匹配优先，miss 后降级为包含关系匹配 */
function findSceneId(sceneNames: string[], sceneMap: Map<string, string>): string | null {
  // 1. 精确匹配
  for (const n of sceneNames) {
    const id = sceneMap.get(n)
    if (id) return id
  }
  // 2. 包含关系降级匹配（资产名包含查询词，或查询词包含资产名）
  for (const n of sceneNames) {
    for (const [key, id] of sceneMap) {
      if (key.includes(n) || n.includes(key)) return id
    }
  }
  return null
}
