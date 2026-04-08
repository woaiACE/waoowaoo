/**
 * 全局色调基调预设
 * 覆盖 2023-2026 年主流短剧/AI 影视常用色调风格
 * promptKeywords 将追加到 artStyle prompt，在阶段 6 分镜图生成时自动注入
 */

export interface ColorGradePreset {
  value: string
  label: string
  description: string
  promptKeywords: string
  /** 仅保留质感/氛围词，剔除具体色相词。当场景已有 color_tone 时使用，避免与场景色调冲突 */
  textureKeywords?: string
}

export const COLOR_GRADE_PRESETS: readonly ColorGradePreset[] = [
  // ── 自动 ──────────────────────────────────────────
  {
    value: 'auto',
    label: '自动',
    description: '跟随美术风格，不强制色调',
    promptKeywords: '',
  },

  // ── 古典与国风 ─────────────────────────────────────
  {
    value: 'ancient-warm',
    label: '暖黄古风',
    description: '古装言情标配，金黄暖调',
    promptKeywords: 'warm golden hour lighting, antique amber color grading, soft ochre highlights, cinematic warm tones, classical Chinese photography',
  },
  {
    value: 'ink-cyan',
    label: '水墨青灰',
    description: '国风水墨，青灰意境',
    promptKeywords: 'traditional Chinese ink wash palette, celadon cyan shadows, misty grey atmosphere, Eastern aesthetics color grading, elegant desaturated tones',
  },
  {
    value: 'dunhuang-sunset',
    label: '敦煌暮色',
    description: '敦煌壁画金橙，西域沙漠黄昏',
    promptKeywords: 'Dunhuang fresco color palette, terracotta orange, deep crimson accent, desert golden sunset, rich saturated ancient pigments',
  },
  {
    value: 'republic-sepia',
    label: '民国旧调',
    description: '民国谍战老照片质感，棕褐胶片',
    promptKeywords: 'vintage sepia tone, 1930s Republic of China film look, brownish silver gelatin, aged photographic paper, warm dusty highlights',
  },

  // ── 电影级调色 ─────────────────────────────────────
  {
    value: 'orange-teal',
    label: '电影橙青',
    description: '好莱坞主流，人物橙肤/阴影青绿',
    promptKeywords: 'cinematic orange and teal color grading, Hollywood blockbuster LUT, warm skin tones with teal shadows, Split-tone contrast',
  },
  {
    value: 'silver-noir',
    label: '银黑诺伊尔',
    description: '黑色电影，高反差银白+深黑',
    promptKeywords: 'film noir black and white, high contrast silver halide look, deep blacks, bright highlights, 1940s classic cinema aesthetic',
  },
  {
    value: 'kodak-film',
    label: '柯达胶片',
    description: '柯达 200 胶片质感，温暖饱和',
    promptKeywords: 'Kodak 200 film emulation, warm saturated colors, subtle grain, lifted shadows, natural film look, analog photography aesthetic',
  },
  {
    value: 'fuji-green',
    label: '富士青绿',
    description: '富士胶片，青绿偏色，清透日系',
    promptKeywords: 'Fujifilm film simulation, subtle green-cyan cast, clean highlights, fresh natural color, Japanese photography aesthetic, airy tone',
  },

  // ── 都市与现代 ─────────────────────────────────────
  {
    value: 'urban-cool',
    label: '都市冷调',
    description: '现代都市，冷蓝钢铁质感',
    promptKeywords: 'urban cool blue tones, desaturated city palette, steel grey, neon reflections on wet pavement, metropolitan cold grading',
  },
  {
    value: 'golden-hour',
    label: '阳光暖意',
    description: '黄金时刻，自然暖光甜宠',
    promptKeywords: 'golden hour sunlight, warm amber backlight, soft lens flare, romantic warm glow, natural daylight color grading',
  },
  {
    value: 'pastel-healing',
    label: '粉彩治愈',
    description: '治愈系，低饱和粉柔色调',
    promptKeywords: 'soft pastel palette, low saturation gentle colors, dreamy washed-out tones, healing aesthetic light pink and lavender, airy overexposed highlights',
    textureKeywords: 'soft pastel palette, low saturation gentle colors, dreamy washed-out tones, airy overexposed highlights',
  },
  {
    value: 'mocha-brown',
    label: '摩卡咖啡',
    description: '轻奢质感，棕系中性暖调',
    promptKeywords: 'mocha brown neutral palette, warm earthy tones, beige and caramel highlights, premium café aesthetic, sophisticated muted warm grading',
  },

  // ── 科幻与赛博 ─────────────────────────────────────
  {
    value: 'cyberpunk-neon',
    label: '赛博霓虹',
    description: '赛博朋克，紫品红+电蓝霓虹',
    promptKeywords: 'cyberpunk neon city, electric blue and magenta neon lights, rain-soaked reflections, high contrast dark atmosphere, dystopian urban glow',
  },
  {
    value: 'cold-scifi',
    label: '冷蓝科幻',
    description: '星际科幻，钢蓝冷光',
    promptKeywords: 'cold blue science fiction lighting, teal and blue color grading, sterile metallic palette, futuristic LED light color, space age aesthetic',
  },
  {
    value: 'holographic',
    label: '全息幻彩',
    description: '赛博波普，虹彩全息渐变',
    promptKeywords: 'holographic iridescent colors, rainbow prismatic light, chrome reflections, vivid neon gradient, cyberpop art color palette',
  },
  {
    value: 'matrix-green',
    label: '矩阵绿码',
    description: '黑客矩阵，深灰底+荧光绿',
    promptKeywords: 'matrix green phosphor glow, dark grey background, bright neon green digital light, hacker aesthetic, monochrome with green accent',
  },

  // ── 奇幻与魔幻 ─────────────────────────────────────
  {
    value: 'fantasy-purple',
    label: '奇幻紫境',
    description: '修仙奇幻，紫色灵气仙气',
    promptKeywords: 'mystical purple atmosphere, celestial violet glow, ethereal magical light, fantasy realm color grading, deep indigo with luminous highlights',
  },
  {
    value: 'dark-fantasy',
    label: '暗黑奇幻',
    description: '史诗暗黑，深红+黑金',
    promptKeywords: 'epic dark fantasy palette, deep crimson and black gold, dramatic shadow contrast, demonic red atmospheric glow, gothic dark aesthetic',
  },
  {
    value: 'ghibli-green',
    label: '吉卜力草绿',
    description: '宫崎骏风，翠绿温暖自然',
    promptKeywords: 'Studio Ghibli color palette, lush emerald green, soft natural daylight, watercolor-like warm tones, idyllic countryside aesthetic',
  },

  // ── 悬疑与惊悚 ─────────────────────────────────────
  {
    value: 'dark-moody',
    label: '暗黑戏剧',
    description: '悬疑犯罪，深暗压抑氛围',
    promptKeywords: 'dark moody atmosphere, deep desaturated shadows, high contrast dramatic lighting, noir thriller color grading, oppressive cold tone',
  },
  {
    value: 'thriller-red',
    label: '惊悚血红',
    description: '恐怖惊悚，深黑+深红强调',
    promptKeywords: 'horror thriller dark palette, deep black shadows with crimson red accent lighting, unsettling high contrast, blood red glow, sinister atmosphere',
  },

  // ── 末世与废土 ─────────────────────────────────────
  {
    value: 'wasteland-khaki',
    label: '末世废土',
    description: '末日荒漠，黄灰沙土色调',
    promptKeywords: 'post-apocalyptic wasteland color grading, desaturated khaki and brown, dust haze atmosphere, bleached-out sky, dystopian barren landscape tones',
  },

  // ── 小清新与日系 ───────────────────────────────────
  {
    value: 'japan-shojo',
    label: '日系少女',
    description: '日系少女漫，高光溢出粉嫩',
    promptKeywords: 'Japanese shojo manga color aesthetic, overexposed bright highlights, soft pink and white glow, delicate pastel romance, dreamy lens bloom',
    textureKeywords: 'Japanese shojo manga color aesthetic, overexposed bright highlights, dreamy lens bloom',
  },
  {
    value: 'korean-drama',
    label: '韩剧滤镜',
    description: '韩剧质感，清透肤色+冷绿',
    promptKeywords: 'Korean drama color grading, clean bright skin tones, subtle mint green teal cast, polished high-key look, premium K-drama aesthetic',
  },
] as const

export type ColorGradePresetValue = typeof COLOR_GRADE_PRESETS[number]['value']

/**
 * 获取色调 prompt 关键词，自动追加到 artStyle 之后。
 * @param preset 色调预设 value
 * @param sceneHasColorTone 场景是否已有 color_tone 指令（来自 photography_rules）。
 *   为 true 时优先返回 textureKeywords（仅质感词，不含色相词），避免与场景色调冲突。
 */
export function getColorGradePromptKeywords(
  preset: string | null | undefined,
  sceneHasColorTone = false,
): string {
  if (!preset || preset === 'auto') return ''
  const found = COLOR_GRADE_PRESETS.find(p => p.value === preset)
  if (!found) return ''
  if (sceneHasColorTone && found.textureKeywords !== undefined) return found.textureKeywords
  return found.promptKeywords
}

/** 获取预设对象 */
export function getColorGradePreset(value: string): ColorGradePreset | undefined {
  return COLOR_GRADE_PRESETS.find(p => p.value === value)
}
