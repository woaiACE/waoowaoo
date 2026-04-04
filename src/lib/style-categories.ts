/**
 * 画风分类数据字典 — Single Source of Truth
 *
 * 架构说明：
 * - STYLE_CATEGORIES 是所有画风数据的唯一权威来源
 * - `as const` 确保 TypeScript 推断字面量类型，从而派生出严格的 ArtStyleValue 联合类型
 * - constants.ts 中的 isArtStyleValue / getArtStylePrompt 均从此处派生，
 *   因此新增画风后，9 个 API 路由 + 3 个 Worker 的白名单自动更新，无需逐一修改
 *
 * 如何新增画风：
 * 1. 在对应 category 的 styles 数组中新增一个对象
 * 2. 在 public/images/styles/<category-id>/<style-id>.jpg 放置封面图
 * 3. 无需修改任何 API 路由、Worker、或 isArtStyleValue 函数
 */

// ─── 类型定义（用于文档和 IDE 自动补全）───────────────────────────────────────

export interface StylePromptParams {
  /** 注入到 basePrompt 之前的风格前缀（如 "Pixar 3D animation style,"） */
  readonly prefix: string
  /** 注入到 basePrompt 之后的质量关键词后缀（如 "8K, masterpiece, studio lighting"） */
  readonly suffix: string
}

/** 运行时派生类型 — 不要手动定义，从 STYLE_CATEGORIES 自动推断 */
export type StyleItem = (typeof STYLE_CATEGORIES)[number]['styles'][number]
export type StyleCategory = (typeof STYLE_CATEGORIES)[number]

/** 严格联合类型 — TypeScript 从 as const 数据自动代码生成，新增风格后自动扩展 */
export type ArtStyleValue = StyleItem['id']

// ─── 核心数据字典 ─────────────────────────────────────────────────────────────

/**
 * 8 大画风类目及其下属具体风格
 *
 * 向后兼容保证：
 * 原有 4 个风格 ID（american-comic / chinese-comic / japanese-anime / realistic）
 * 已保留在对应类目中，ID 完全不变，数据库中的历史数据无需迁移。
 */
export const STYLE_CATEGORIES = [
  // ── 1. 3D 与动画 ────────────────────────────────────────────────────────────
  {
    id: '3d-animation',
    name: '3D 与动画',
    icon: 'cube',
    styles: [
      {
        id: 'pixar-3d',
        name: '皮克斯风',
        coverUrl: '/images/styles/3d-animation/pixar-3d.jpg',
        promptParams: {
          prefix: 'Pixar 3D animation style,',
          suffix:
            'high-quality CGI, studio lighting, subsurface scattering, expressive characters, Pixar film quality, 8K render',
        },
        negativePrompt:
          'blurry, low quality, flat 2D, distorted proportions, realistic photo, ugly',
      },
      {
        id: 'blind-box',
        name: '盲盒玩具风',
        coverUrl: '/images/styles/3d-animation/blind-box.jpg',
        promptParams: {
          prefix: 'cute blind box vinyl toy figure style,',
          suffix:
            'IP design, clean plastic texture, pastel colors, studio white background, trendy designer toy art, matte finish',
        },
        negativePrompt:
          'blurry, low quality, realistic, complex background, photorealistic, ugly',
      },
      {
        id: 'claymation',
        name: '黏土定格',
        coverUrl: '/images/styles/3d-animation/claymation.jpg',
        promptParams: {
          prefix: 'stop motion clay animation style,',
          suffix:
            'claymation texture, handcrafted look, visible clay fingerprints, warm colors, LAIKA studio quality, tactile surface',
        },
        negativePrompt:
          'smooth CG, photorealistic, blurry, low quality, digital render, ugly',
      },
    ],
  },

  // ── 2. 二次元与动漫 ──────────────────────────────────────────────────────────
  {
    id: 'anime',
    name: '二次元与动漫',
    icon: 'sparklesAlt',
    styles: [
      {
        // ⚠️ 向后兼容：原有 ID，保留原 promptEn
        id: 'american-comic',
        name: '漫画风',
        coverUrl: '/images/styles/anime/american-comic.jpg',
        promptParams: {
          prefix: '',
          suffix: 'Japanese anime style, high quality 2D illustration',
        },
        negativePrompt:
          'realistic, photographic, 3D render, blurry, low quality, ugly',
      },
      {
        // ⚠️ 向后兼容：原有 ID，保留原 promptEn
        id: 'chinese-comic',
        name: '精致国漫',
        coverUrl: '/images/styles/anime/chinese-comic.jpg',
        promptParams: {
          prefix: '',
          suffix:
            'Modern premium Chinese comic style, rich details, clean sharp line art, full texture, ultra-clear 2D anime aesthetics',
        },
        negativePrompt:
          'realistic, photographic, western style, blurry, low quality, ugly',
      },
      {
        // ⚠️ 向后兼容：原有 ID，保留原 promptEn
        id: 'japanese-anime',
        name: '日系动漫风',
        coverUrl: '/images/styles/anime/japanese-anime.jpg',
        promptParams: {
          prefix: '',
          suffix:
            'Modern Japanese anime style, cel shading, clean line art, visual-novel CG look, high-quality 2D style',
        },
        negativePrompt:
          'realistic, photographic, western style, blurry, low quality, ugly',
      },
      {
        id: 'ghibli',
        name: '吉卜力风',
        coverUrl: '/images/styles/anime/ghibli.jpg',
        promptParams: {
          prefix: 'Studio Ghibli animation style,',
          suffix:
            'hand-painted watercolor backgrounds, Hayao Miyazaki aesthetic, soft natural lighting, detailed lush environments, whimsical atmosphere',
        },
        negativePrompt:
          'photorealistic, dark, gritty, 3D CGI, blurry, low quality, ugly',
      },
      {
        id: 'shinkai',
        name: '新海诚风',
        coverUrl: '/images/styles/anime/shinkai.jpg',
        promptParams: {
          prefix: 'Makoto Shinkai animation style,',
          suffix:
            'hyper-detailed backgrounds, cinematic lens glow, volumetric atmospheric lighting, ultra-detailed sky, Your Name aesthetic, photorealistic backgrounds',
        },
        negativePrompt:
          'flat colors, low detail, blurry, ugly, photorealistic characters',
      },
      {
        id: 'cel-90s',
        name: '90年代赛璐璐',
        coverUrl: '/images/styles/anime/cel-90s.jpg',
        promptParams: {
          prefix: '1990s cel animation style,',
          suffix:
            'traditional hand-painted cel sheets, VHS era quality, slightly faded colors, Dragon Ball Z era aesthetics, bold outlines',
        },
        negativePrompt:
          'modern anime, 3D CGI, photorealistic, digital clean, blurry, ugly',
      },
    ],
  },

  // ── 3. 写实与摄影 ────────────────────────────────────────────────────────────
  {
    id: 'realistic-photo',
    name: '写实与摄影',
    icon: 'image',
    styles: [
      {
        // ⚠️ 向后兼容：原有 ID，保留原 promptEn
        id: 'realistic',
        name: '真人写实',
        coverUrl: '/images/styles/realistic-photo/realistic.jpg',
        promptParams: {
          prefix: '',
          suffix:
            'Realistic cinematic look, real-world scene fidelity, rich transparent colors, clean and refined image quality',
        },
        negativePrompt:
          'cartoon, anime, illustration, painting, blurry, overexposed, ugly',
      },
      {
        id: 'cinematic-8k',
        name: '电影级质感',
        coverUrl: '/images/styles/realistic-photo/cinematic-8k.jpg',
        promptParams: {
          prefix: 'Epic cinematic photography,',
          suffix:
            '8K resolution, anamorphic lens flare, dramatic movie lighting, film grain, photorealistic, RAW photo, Imax quality',
        },
        negativePrompt:
          'cartoon, anime, blurry, overexposed, low quality, flat lighting, ugly',
      },
      {
        id: 'film-photo',
        name: '胶片/拍立得',
        coverUrl: '/images/styles/realistic-photo/film-photo.jpg',
        promptParams: {
          prefix: 'Vintage film photography, polaroid style,',
          suffix:
            'film grain, light leaks, soft vignette, analog photography warmth, lomography aesthetic, faded tones',
        },
        negativePrompt:
          'digital clean, oversaturated, sharp digital, blurry subject, ugly',
      },
      {
        id: 'mono-bw',
        name: '极简黑白',
        coverUrl: '/images/styles/realistic-photo/mono-bw.jpg',
        promptParams: {
          prefix: 'Minimalist black and white photography,',
          suffix:
            'high contrast monochrome, pristine composition, Ansel Adams inspired, fine art photography, clean lines, rich tonal range',
        },
        negativePrompt: 'color, blurry, noisy, low contrast, cluttered, ugly',
      },
    ],
  },

  // ── 4. 插画与绘本 ────────────────────────────────────────────────────────────
  {
    id: 'illustration',
    name: '插画与绘本',
    icon: 'pencil',
    styles: [
      {
        id: 'healing-picturebook',
        name: '治愈系绘本',
        coverUrl: '/images/styles/illustration/healing-picturebook.jpg',
        promptParams: {
          prefix: 'Healing children\'s picture book illustration style,',
          suffix:
            'soft pastel colors, warm and cozy atmosphere, gentle brushstrokes, whimsical storybook art, heartwarming scene',
        },
        negativePrompt:
          'dark, gritty, realistic, photographic, sharp edges, ugly',
      },
      {
        id: 'western-comic',
        name: '经典美漫风',
        coverUrl: '/images/styles/illustration/western-comic.jpg',
        promptParams: {
          prefix: 'Classic Western superhero comic book art style,',
          suffix:
            'bold ink lines, halftone dot shading, primary color palette, Marvel and DC style, Ben-Day dots, dynamic action pose',
        },
        negativePrompt:
          'anime, realistic, photographic, soft colors, blurry, ugly',
      },
      {
        id: 'tarot-mystical',
        name: '塔罗牌/神秘学',
        coverUrl: '/images/styles/illustration/tarot-mystical.jpg',
        promptParams: {
          prefix: 'Tarot card mystical occult art,',
          suffix:
            'intricate ornamental borders, rich symbolism, Art Nouveau style, celestial and occult imagery, detailed allegory, esoteric',
        },
        negativePrompt:
          'modern, photorealistic, clean minimal, blurry, low detail, ugly',
      },
    ],
  },

  // ── 5. 国风与传统 ────────────────────────────────────────────────────────────
  {
    id: 'chinese-traditional',
    name: '国风与传统',
    icon: 'home',
    styles: [
      {
        id: 'ancient-chinese',
        name: '唯美古风插画',
        coverUrl: '/images/styles/chinese-traditional/ancient-chinese.jpg',
        promptParams: {
          prefix: 'Beautiful ancient Chinese illustration style, guofeng aesthetics,',
          suffix:
            'flowing silk robes, traditional architecture, ink-washed mountains, Tang Dynasty prosperity, delicate brushwork, ethereal atmosphere',
        },
        negativePrompt:
          'modern, western style, realistic photo, blurry, low quality, ugly',
      },
      {
        id: 'ink-wash',
        name: '传统水墨',
        coverUrl: '/images/styles/chinese-traditional/ink-wash.jpg',
        promptParams: {
          prefix: 'Traditional Chinese ink wash painting, shuimo hua style,',
          suffix:
            'sumi-e brushwork, minimal color, elegant negative space, xuan paper texture, calligraphic lines, Qi Baishi inspired',
        },
        negativePrompt:
          'colorful, photorealistic, western style, blurry, digital clean, ugly',
      },
      {
        id: 'dunhuang',
        name: '敦煌壁画风',
        coverUrl: '/images/styles/chinese-traditional/dunhuang.jpg',
        promptParams: {
          prefix: 'Dunhuang Mogao Caves fresco art style,',
          suffix:
            'vibrant mineral pigments, flying apsaras, intricate decorative patterns, Buddhist motifs, Tang Dynasty fresco style, aged texture',
        },
        negativePrompt:
          'modern, western, photorealistic, blurry, low quality, ugly',
      },
    ],
  },

  // ── 6. 科幻与未来 ────────────────────────────────────────────────────────────
  {
    id: 'scifi-future',
    name: '科幻与未来',
    icon: 'zap',
    styles: [
      {
        id: 'cyberpunk',
        name: '赛博朋克',
        coverUrl: '/images/styles/scifi-future/cyberpunk.jpg',
        promptParams: {
          prefix: 'Cyberpunk neon dystopia style,',
          suffix:
            'neon-lit rainy streets, holographic advertisements, dark gritty cityscape, Blade Runner 2049 aesthetic, high contrast, chromatic aberration',
        },
        negativePrompt:
          'bright daytime, nature, clean, pastoral, blurry, low quality, ugly',
      },
      {
        id: 'steampunk',
        name: '蒸汽朋克',
        coverUrl: '/images/styles/scifi-future/steampunk.jpg',
        promptParams: {
          prefix: 'Victorian steampunk art style,',
          suffix:
            'brass gears and clockwork, steam-powered machinery, retro-futuristic gadgets, sepia tones, leather and goggles, Jules Verne aesthetic',
        },
        negativePrompt:
          'modern technology, clean digital, blurry, low quality, ugly',
      },
      {
        id: 'post-apocalypse',
        name: '废土末日',
        coverUrl: '/images/styles/scifi-future/post-apocalypse.jpg',
        promptParams: {
          prefix: 'Post-apocalyptic wasteland survival art style,',
          suffix:
            'desolate ruins, rust and dust textures, survival gear aesthetics, Fallout inspired, dramatic desert lighting, weathered surfaces',
        },
        negativePrompt:
          'clean, modern, colorful, nature, blurry, low quality, ugly',
      },
    ],
  },

  // ── 7. 奇幻与游戏概念 ────────────────────────────────────────────────────────
  {
    id: 'fantasy-game',
    name: '奇幻与游戏概念',
    icon: 'layers',
    styles: [
      {
        id: 'epic-dark-fantasy',
        name: '史诗暗黑',
        coverUrl: '/images/styles/fantasy-game/epic-dark-fantasy.jpg',
        promptParams: {
          prefix: 'Epic dark fantasy digital concept art,',
          suffix:
            'dramatic chiaroscuro lighting, detailed armor and weaponry, mythical creatures, Warhammer grimdark atmosphere, painterly masterwork',
        },
        negativePrompt:
          'bright cheerful, cartoon, blurry, low quality, flat colors, ugly',
      },
      {
        id: 'cg-game-art',
        name: 'CG 游戏原画',
        coverUrl: '/images/styles/fantasy-game/cg-game-art.jpg',
        promptParams: {
          prefix: 'High-fidelity AAA game concept art,',
          suffix:
            'Unreal Engine 5 quality render, PBR materials, cinematic game poster, detailed environment design, game splash art',
        },
        negativePrompt:
          'blurry, low quality, flat, hand-drawn, watercolor, ugly',
      },
    ],
  },

  // ── 8. 纯艺术 ───────────────────────────────────────────────────────────────
  {
    id: 'fine-art',
    name: '纯艺术',
    icon: 'palette',
    styles: [
      {
        id: 'classical-oil',
        name: '经典油画',
        coverUrl: '/images/styles/fine-art/classical-oil.jpg',
        promptParams: {
          prefix: 'Classical oil painting masterwork style,',
          suffix:
            'Rembrandt lighting, impasto brushwork, rich varnished colors, canvas texture, Old Masters technique, Louvre museum quality',
        },
        negativePrompt:
          'digital art, photography, blurry, low quality, flat, anime, ugly',
      },
      {
        id: 'cyber-pop',
        name: '赛博波普',
        coverUrl: '/images/styles/fine-art/cyber-pop.jpg',
        promptParams: {
          prefix: 'Cyberpop art movement style,',
          suffix:
            'Andy Warhol meets digital age, neon silkscreen, bold graphic shapes, internet culture aesthetics, pop art colors, Memphis design',
        },
        negativePrompt:
          'realistic, dark, monochrome, blurry, low quality, subtle, ugly',
      },
    ],
  },
] as const

// ─── 派生工具 ─────────────────────────────────────────────────────────────────

/** 所有风格项目扁平化（运行时用，不依赖 as const 字面量类型） */
export function getAllStyleItems(): StyleItem[] {
  return STYLE_CATEGORIES.flatMap((cat) => cat.styles as unknown as StyleItem[])
}

/** 所有有效风格 ID 的 Set（用于 O(1) 白名单验证） */
const _allStyleIdSet: ReadonlySet<string> = new Set(
  STYLE_CATEGORIES.flatMap((cat) =>
    (cat.styles as readonly { id: string }[]).map((s) => s.id),
  ),
)

/** 根据 ID 查找风格项（找不到返回 undefined） */
export function getStyleById(id: string | null | undefined): StyleItem | undefined {
  if (!id) return undefined
  for (const cat of STYLE_CATEGORIES) {
    for (const style of cat.styles) {
      if (style.id === id) return style as StyleItem
    }
  }
  return undefined
}

/** 默认兜底画风 ID */
const DEFAULT_FALLBACK_STYLE_ID = 'american-comic'

/**
 * 根据 ID 查找风格项，保证永不返回 undefined（兜底 Fallback）
 *
 * 使用场景：前端渲染 / 老数据回显，传入未知旧 ID 时不白屏、不崩溃。
 * 区别于 getStyleById：本函数在找不到时返回默认兜底配置，并 console.warn。
 *
 * @example
 *   getStyleConfigById('') // → american-comic
 *   getStyleConfigById('my-deleted-style') // → american-comic + warn
 */
export function getStyleConfigById(id: string | null | undefined): StyleItem {
  const found = getStyleById(id)
  if (found) return found
  if (id) {
    console.warn(
      `[style-categories] Unknown style id "${id}", falling back to "${DEFAULT_FALLBACK_STYLE_ID}". ` +
      'If this is a legacy ID, please migrate the data.',
    )
  }
  // 兜底：返回 american-comic，这个 ID 永远存在并向下兼容
  return getStyleById(DEFAULT_FALLBACK_STYLE_ID) as StyleItem
}

/**
 * 获取指定画风的 negativePrompt 字符串
 *
 * 用于 Worker 层拼装生图 API 的 negative_prompt 参数。
 * 对于未知 ID 或 null，返回全局默认负向提示词。
 */
export function getArtStyleNegativePrompt(id: string | null | undefined): string {
  const DEFAULT_NEGATIVE_PROMPT =
    'blurry, low quality, ugly, deformed, distorted, watermark, text, signature'
  const style = getStyleById(id)
  return style?.negativePrompt || DEFAULT_NEGATIVE_PROMPT
}

/**
 * 运行时风格 ID 白名单验证（类型守卫）
 *
 * 此函数是 constants.ts 中 isArtStyleValue 的底层实现，
 * 所有 API 路由和 Worker 通过 constants.ts 间接调用它。
 * 在 STYLE_CATEGORIES 中新增风格后，此验证自动包含新 ID。
 */
export function isValidStyleId(id: unknown): id is ArtStyleValue {
  return typeof id === 'string' && _allStyleIdSet.has(id)
}

/**
 * 组装最终的图像生成 Prompt
 *
 * 拼接规则：[style.prefix] + [basePrompt] + [style.suffix]
 *
 * @param basePrompt - 人物/场景基础描述
 * @param style      - 选中的画风（可选，不传则只返回 basePrompt）
 * @returns { prompt, negativePrompt }
 */
export function assembleImagePrompt(
  basePrompt: string,
  style?: StyleItem,
): { prompt: string; negativePrompt: string } {
  const DEFAULT_NEGATIVE_PROMPT =
    'blurry, low quality, ugly, deformed, distorted, watermark, text, signature'

  if (!style) {
    return { prompt: basePrompt, negativePrompt: DEFAULT_NEGATIVE_PROMPT }
  }

  const { prefix, suffix } = style.promptParams
  const parts: string[] = []

  if (prefix) parts.push(prefix)
  if (basePrompt) parts.push(basePrompt)
  if (suffix) parts.push(suffix)

  return {
    prompt: parts.join(' ').trim(),
    negativePrompt: style.negativePrompt || DEFAULT_NEGATIVE_PROMPT,
  }
}
