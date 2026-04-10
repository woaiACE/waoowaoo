/**
 * 项目模板库
 * 覆盖 2023-2026 年热门短剧类型，每套模板预配最优参数组合
 * 用户选择模板后，一键批量填入 artStyle + colorGradePreset + targetPlatform + videoRatio
 */

export interface ProjectTemplate {
  id: string
  label: string
  description: string
  emoji: string
  tags: string[]
  config: {
    targetPlatform: string
    videoRatio: string
    artStyle: string
    colorGradePreset: string
    screenplayTone?: string
  }
}

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  // ── 古装 & 国风 ────────────────────────────────────────────────
  {
    id: 'ancient-romance',
    label: '古装言情',
    description: '宫廷恋曲、家国情仇，国漫写实风',
    emoji: '🏯',
    tags: ['古装', '言情', '宫廷'],
    config: {
      targetPlatform: 'douyin',
      videoRatio: '9:16',
      artStyle: 'ancient-chinese',
      colorGradePreset: 'ancient-warm',
    },
  },
  {
    id: 'wuxia',
    label: '武侠江湖',
    description: '侠义恩仇、武林争霸，国风写实',
    emoji: '⚔️',
    tags: ['武侠', '江湖', '动作'],
    config: {
      targetPlatform: 'douyin',
      videoRatio: '9:16',
      artStyle: 'ancient-chinese',
      colorGradePreset: 'ink-cyan',
    },
  },
  {
    id: 'cultivation-fantasy',
    label: '奇幻修仙',
    description: '东方玄幻、修仙升级、仙侠飞剑',
    emoji: '🗡️',
    tags: ['修仙', '玄幻', '奇幻'],
    config: {
      targetPlatform: 'douyin',
      videoRatio: '9:16',
      artStyle: 'epic-dark-fantasy',
      colorGradePreset: 'fantasy-purple',
    },
  },
  {
    id: 'republic-spy',
    label: '民国谍战',
    description: '民国风云、谍影重重、热血抗争',
    emoji: '🕵️',
    tags: ['民国', '谍战', '历史'],
    config: {
      targetPlatform: 'douyin',
      videoRatio: '9:16',
      artStyle: 'cinematic-8k',
      colorGradePreset: 'republic-sepia',
    },
  },
  {
    id: 'dunhuang-mystical',
    label: '西域敦煌',
    description: '丝路传奇、西域风情、敦煌壁画美学',
    emoji: '🏺',
    tags: ['西域', '敦煌', '历史奇幻'],
    config: {
      targetPlatform: 'bilibili',
      videoRatio: '16:9',
      artStyle: 'dunhuang',
      colorGradePreset: 'dunhuang-sunset',
    },
  },

  // ── 都市 & 现代言情 ────────────────────────────────────────────
  {
    id: 'modern-romance',
    label: '都市甜宠',
    description: '现代都市恋爱、甜蜜日常，写实风',
    emoji: '💕',
    tags: ['都市', '甜宠', '言情'],
    config: {
      targetPlatform: 'douyin',
      videoRatio: '9:16',
      artStyle: 'realistic',
      colorGradePreset: 'golden-hour',
    },
  },
  {
    id: 'ceo-romance',
    label: '霸道总裁',
    description: '豪门商战、总裁追妻，精英质感',
    emoji: '🏢',
    tags: ['总裁', '商战', '豪门'],
    config: {
      targetPlatform: 'douyin',
      videoRatio: '9:16',
      artStyle: 'cinematic-8k',
      colorGradePreset: 'mocha-brown',
    },
  },
  {
    id: 'wealthy-family',
    label: '豪门恩怨',
    description: '豪门家族、利益纠葛、复仇逆袭',
    emoji: '💎',
    tags: ['豪门', '复仇', '家族'],
    config: {
      targetPlatform: 'douyin',
      videoRatio: '9:16',
      artStyle: 'cinematic-8k',
      colorGradePreset: 'urban-cool',
    },
  },
  {
    id: 'rebirth-revenge',
    label: '重生逆袭',
    description: '重生归来、复仇打脸、逆袭爽剧',
    emoji: '🔥',
    tags: ['重生', '逆袭', '爽剧'],
    config: {
      targetPlatform: 'douyin',
      videoRatio: '9:16',
      artStyle: 'realistic',
      colorGradePreset: 'orange-teal',
    },
  },
  {
    id: 'campus-youth',
    label: '校园青春',
    description: '青涩校园、初恋悸动、青春记忆',
    emoji: '🌸',
    tags: ['校园', '青春', '初恋'],
    config: {
      targetPlatform: 'douyin',
      videoRatio: '9:16',
      artStyle: 'japanese-anime',
      colorGradePreset: 'japan-shojo',
    },
  },
  {
    id: 'entertainment-circle',
    label: '娱乐圈',
    description: '明星经纪、娱乐圈生存、追星爱情',
    emoji: '🎤',
    tags: ['娱乐圈', '明星', '追星'],
    config: {
      targetPlatform: 'douyin',
      videoRatio: '9:16',
      artStyle: 'cinematic-8k',
      colorGradePreset: 'golden-hour',
    },
  },

  // ── 悬疑 & 犯罪 ────────────────────────────────────────────────
  {
    id: 'suspense-crime',
    label: '悬疑犯罪',
    description: '烧脑推理、犯罪调查、黑暗美学',
    emoji: '🔍',
    tags: ['悬疑', '犯罪', '推理'],
    config: {
      targetPlatform: 'douyin',
      videoRatio: '9:16',
      artStyle: 'cinematic-8k',
      colorGradePreset: 'dark-moody',
    },
  },
  {
    id: 'horror-thriller',
    label: '恐怖惊悚',
    description: '鬼怪传说、心理恐怖、惊悚悬疑',
    emoji: '👻',
    tags: ['恐怖', '惊悚', '灵异'],
    config: {
      targetPlatform: 'douyin',
      videoRatio: '9:16',
      artStyle: 'cinematic-8k',
      colorGradePreset: 'thriller-red',
    },
  },
  {
    id: 'noir-detective',
    label: '硬汉侦探',
    description: '私家侦探、黑色电影、硬派风格',
    emoji: '🎩',
    tags: ['侦探', '黑色电影', '硬汉'],
    config: {
      targetPlatform: 'bilibili',
      videoRatio: '16:9',
      artStyle: 'cinematic-8k',
      colorGradePreset: 'silver-noir',
    },
  },

  // ── 科幻 & 未来 ────────────────────────────────────────────────
  {
    id: 'cyberpunk',
    label: '赛博朋克',
    description: '霓虹都市、人机融合、黑客帝国',
    emoji: '🤖',
    tags: ['赛博朋克', '科幻', '未来'],
    config: {
      targetPlatform: 'bilibili',
      videoRatio: '16:9',
      artStyle: 'cyberpunk',
      colorGradePreset: 'cyberpunk-neon',
    },
  },
  {
    id: 'scifi-space',
    label: '星际科幻',
    description: '宇宙探索、星际战争、外星文明',
    emoji: '🚀',
    tags: ['星际', '太空', '科幻'],
    config: {
      targetPlatform: 'bilibili',
      videoRatio: '16:9',
      artStyle: 'cg-game-art',
      colorGradePreset: 'cold-scifi',
    },
  },
  {
    id: 'scifi-apocalypse',
    label: '末世生存',
    description: '末日废土、末世求生、反乌托邦',
    emoji: '☢️',
    tags: ['末世', '废土', '生存'],
    config: {
      targetPlatform: 'bilibili',
      videoRatio: '16:9',
      artStyle: 'post-apocalypse',
      colorGradePreset: 'wasteland-khaki',
    },
  },
  {
    id: 'steampunk',
    label: '蒸汽朋克',
    description: '维多利亚蒸汽机械、奇幻冒险',
    emoji: '⚙️',
    tags: ['蒸汽朋克', '维多利亚', '机械'],
    config: {
      targetPlatform: 'bilibili',
      videoRatio: '16:9',
      artStyle: 'steampunk',
      colorGradePreset: 'republic-sepia',
    },
  },

  // ── 二次元 & 动漫 ────────────────────────────────────────────
  {
    id: 'japanese-anime',
    label: '日系动漫',
    description: '日系风格，热血少年或萌系校园',
    emoji: '🌟',
    tags: ['动漫', '日系', '热血'],
    config: {
      targetPlatform: 'bilibili',
      videoRatio: '16:9',
      artStyle: 'japanese-anime',
      colorGradePreset: 'japan-shojo',
    },
  },
  {
    id: 'ghibli-fantasy',
    label: '吉卜力童话',
    description: '宫崎骏风格，治愈奇幻童话',
    emoji: '🌿',
    tags: ['吉卜力', '治愈', '童话'],
    config: {
      targetPlatform: 'bilibili',
      videoRatio: '16:9',
      artStyle: 'ghibli',
      colorGradePreset: 'ghibli-green',
    },
  },
  {
    id: '3d-animation',
    label: '3D 动画',
    description: '皮克斯风格 CG 动画，合家欢',
    emoji: '🎮',
    tags: ['3D', 'CG', '动画'],
    config: {
      targetPlatform: 'bilibili',
      videoRatio: '16:9',
      artStyle: 'pixar-3d',
      colorGradePreset: 'auto',
    },
  },

  // ── 治愈 & 生活 ────────────────────────────────────────────────
  {
    id: 'healing-daily',
    label: '治愈日常',
    description: '温暖治愈、轻松日常、岁月静好',
    emoji: '☕',
    tags: ['治愈', '日常', '温暖'],
    config: {
      targetPlatform: 'xiaohongshu',
      videoRatio: '4:5',
      artStyle: 'healing-picturebook',
      colorGradePreset: 'pastel-healing',
    },
  },
  {
    id: 'rural-story',
    label: '乡村振兴',
    description: '田园乡村、返乡创业、温情乡土',
    emoji: '🌾',
    tags: ['乡村', '田园', '现实'],
    config: {
      targetPlatform: 'douyin',
      videoRatio: '9:16',
      artStyle: 'realistic',
      colorGradePreset: 'ghibli-green',
    },
  },
  {
    id: 'korean-romance',
    label: '韩剧质感',
    description: '韩式精致美感，清透唯美',
    emoji: '🌺',
    tags: ['韩剧', '唯美', '精致'],
    config: {
      targetPlatform: 'douyin',
      videoRatio: '9:16',
      artStyle: 'realistic',
      colorGradePreset: 'korean-drama',
    },
  },

  // ── 儿童 & 绘本 ────────────────────────────────────────────────
  {
    id: 'children-story',
    label: '儿童绘本',
    description: '低幼卡通、绘本风格、教育故事',
    emoji: '📖',
    tags: ['儿童', '绘本', '教育'],
    config: {
      targetPlatform: 'bilibili',
      videoRatio: '16:9',
      artStyle: 'healing-picturebook',
      colorGradePreset: 'pastel-healing',
    },
  },
] as const

export type ProjectTemplateId = typeof PROJECT_TEMPLATES[number]['id']

/** 根据 id 获取模板 */
export function getProjectTemplate(id: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find(t => t.id === id)
}
