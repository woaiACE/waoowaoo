/**
 * 剧本风格基调预设
 * 覆盖主流短剧/AI 影视常用创作风格，提交 story-to-script 时注入 tone_instruction 占位符
 */

export interface ScreenplayTonePreset {
  value: string
  label: string
  description: string
  /** 注入 prompt 的中文风格指令，空字符串表示不限定 */
  toneInstruction: string
}

export const SCREENPLAY_TONE_PRESETS: readonly ScreenplayTonePreset[] = [
  // ── 通用 ──────────────────────────────────────────────────────
  {
    value: 'auto',
    label: '自动',
    description: '不限定风格，LLM 自由发挥',
    toneInstruction: '',
  },

  // ── 言情系 ──────────────────────────────────────────────────
  {
    value: 'sweet-romance',
    label: '甜宠言情',
    description: '甜蜜治愈，双向奔赴',
    toneInstruction:
      '剧本风格：甜宠言情。对白充满甜蜜温馨，男女主互动可爱、暧昧升温，台词自然流畅，情感递进清晰，整体调性轻松浪漫，不出现悲剧转折。',
  },
  {
    value: 'angst-romance',
    label: '虐恋情深',
    description: '误会拉锯，虐心反转',
    toneInstruction:
      '剧本风格：虐恋情深。情节充满误解与撕扯，台词克制但充满张力，情感高低起伏，制造"心痛却停不下来"的观感，适当安排反转揭示真相。',
  },
  {
    value: 'rebirth-revenge',
    label: '重生复仇',
    description: '女主重生打脸爽文',
    toneInstruction:
      '剧本风格：重生逆袭复仇。女主（或男主）视角强烈，重生后节奏明快、打脸爽利，台词简短有力，情节推进快速、冲突清晰，不拖沓。',
  },
  {
    value: 'ceo-romance',
    label: '霸总甜宠',
    description: '霸道总裁爱上我',
    toneInstruction:
      '剧本风格：霸总甜宠。男主强势霸道但内心柔软，对白简短有力，女主独立可爱，双方斗嘴→升温节奏明快，符合短剧观众对"高富帅"剧情的期待。',
  },
  {
    value: 'historical-romance',
    label: '古装言情',
    description: '古风雅韵，宫廷或江湖情缘',
    toneInstruction:
      '剧本风格：古装言情。台词融合古典韵味与现代可读性，场景描述充满古典美感，人物行为符合时代背景，情感含蓄而深情。',
  },

  // ── 喜剧系 ──────────────────────────────────────────────────
  {
    value: 'light-comedy',
    label: '轻喜剧',
    description: '日常幽默，轻松活泼',
    toneInstruction:
      '剧本风格：轻喜剧。对白风趣幽默，节奏轻快，利用日常误会和反差制造笑点，台词自然接地气，整体氛围轻松愉快，不出现沉重情节。',
  },
  {
    value: 'slapstick',
    label: '搞笑夸张',
    description: '夸张喜剧，密集笑料',
    toneInstruction:
      '剧本风格：搞笑夸张喜剧。动作描述夸张到位，对白包含密集的梗和反转，节奏快、情节超展开，允许打破第四面墙式的喜剧处理。',
  },
  {
    value: 'satirical',
    label: '讽刺喜剧',
    description: '职场/社会讽刺，辛辣幽默',
    toneInstruction:
      '剧本风格：讽刺喜剧。台词暗含对职场/社会现实的讽刺，人物行为夸张折射现实，笑中带思，对白犀利但有节制，不流于说教。',
  },

  // ── 悬疑犯罪系 ──────────────────────────────────────────────
  {
    value: 'suspense',
    label: '悬疑推理',
    description: '烧脑反转，层层铺垫',
    toneInstruction:
      '剧本风格：悬疑推理。每个场景都需埋下伏笔或制造疑问，对话间充满信息暗示，节奏张弛有度，情节推进时保留关键信息，结尾予以反转或揭露。',
  },
  {
    value: 'crime-thriller',
    label: '犯罪惊悚',
    description: '紧张追凶，高压对抗',
    toneInstruction:
      '剧本风格：犯罪惊悚。动作描述紧张克制，对白简短强硬，压迫感贯穿全程，人物处于高风险高压力情境，情节快速推进不留喘息空间。',
  },
  {
    value: 'psychological',
    label: '心理悬疑',
    description: '心智博弈，氛围压抑',
    toneInstruction:
      '剧本风格：心理悬疑。重点刻画内心活动与心理博弈，台词暗含多层含义，旁白（voiceover）可用于内心剖白，氛围阴郁压抑，现实与幻觉模糊。',
  },

  // ── 动作爽文系 ──────────────────────────────────────────────
  {
    value: 'action-hero',
    label: '热血动作',
    description: '燃点满满，激战爽感',
    toneInstruction:
      '剧本风格：热血动作爽文。动作场景描写激烈干脆，台词简短有力，燃点密集，英雄主角气场强大，节奏快、打戏清晰，符合短剧"5秒一爽点"原则。',
  },
  {
    value: 'underdog-rise',
    label: '逆袭成长',
    description: '草根逆袭打脸流',
    toneInstruction:
      '剧本风格：逆袭成长。主角从被轻视到一步步证明自己，对白中反派嘲讽与主角回应形成强对比，每幕推进一级"爽感"，节奏紧凑不拖拉。',
  },
  {
    value: 'wuxia',
    label: '武侠江湖',
    description: '侠义恩仇，快意恩仇',
    toneInstruction:
      '剧本风格：武侠江湖。台词讲究侠义气节，动作描述融合武术美感，场景充满江湖豪情，对白简洁有骨气，情义与恩怨并重。',
  },

  // ── 奇幻玄幻系 ──────────────────────────────────────────────
  {
    value: 'cultivation',
    label: '仙侠修仙',
    description: '飞升问道，仙侠浪漫',
    toneInstruction:
      '剧本风格：仙侠修仙。台词融合仙气与现代感，场景描述充满奇幻色彩（灵气、法宝、山河），人物追求修炼问道，情感与道法交织，有史诗感。',
  },
  {
    value: 'urban-fantasy',
    label: '都市异能',
    description: '现代都市异能超能力',
    toneInstruction:
      '剧本风格：都市异能。现代都市背景混搭超自然能力，台词接地气又带神秘色彩，情节在生活日常与异能冲突之间切换，节奏快有惊喜感。',
  },
  {
    value: 'apocalypse',
    label: '末世废土',
    description: '末日生存，人性博弈',
    toneInstruction:
      '剧本风格：末世废土。台词简短压抑充满绝望感，情节聚焦生存与人性，背景描述荒凉壮阔，道德抉择是核心冲突，整体基调厚重苍凉。',
  },

  // ── 正剧与现实系 ────────────────────────────────────────────
  {
    value: 'family-drama',
    label: '家庭伦理',
    description: '亲情纠葛，现实写照',
    toneInstruction:
      '剧本风格：家庭伦理正剧。台词贴近生活真实，家庭关系纠葛是主轴，情感克制但有积累，矛盾来自代际差异或利益冲突，以情感共鸣取胜而非戏剧冲突。',
  },
  {
    value: 'workplace',
    label: '职场商战',
    description: '商战谋略，职场博弈',
    toneInstruction:
      '剧本风格：职场商战。台词精准有力，角色行为带有明确的利益目的，谋略对话暗流涌动，节奏干练，避免情感化拖沓，突出智商博弈与策略推演。',
  },
  {
    value: 'youth-campus',
    label: '青春校园',
    description: '青涩情感，校园友谊',
    toneInstruction:
      '剧本风格：青春校园。台词青春活泼，情感青涩纯真，校园日常场景充满活力，冲突来自友情与爱情的微妙，整体调性明朗温暖。',
  },

  // ── 儿童类 ──────────────────────────────────────────────────
  {
    value: 'fairy-tale',
    label: '儿童童话',
    description: '温馨奇幻，适合小朋友',
    toneInstruction:
      '剧本风格：儿童童话。语言简单温暖，句子短小易懂，充满想象力和奇幻色彩，角色善良可爱，主题积极正向（友谊、勇气、善良），结局美好圆满，绝对不出现暴力或恐怖元素。',
  },
  {
    value: 'parent-child',
    label: '亲子成长',
    description: '亲情温暖，陪伴成长',
    toneInstruction:
      '剧本风格：亲子成长。以亲子关系为核心，台词温暖真实，情节围绕孩子的成长烦恼与父母的陪伴展开，笑中带泪，传递家庭温情和正确价值观，语言平易近人适合全家观看。',
  },
  {
    value: 'kids-adventure',
    label: '儿童冒险',
    description: '探索冒险，童趣满满',
    toneInstruction:
      '剧本风格：儿童冒险。剧情充满探索惊喜，小主人公勇敢机智，台词活泼有趣充满童趣，冒险情节刺激但安全无害，强调团队合作和解决问题的乐趣，激发好奇心和创造力。',
  },
  {
    value: 'fable',
    label: '寓言故事',
    description: '寓教于乐，动物角色',
    toneInstruction:
      '剧本风格：寓言故事。以动物或拟人化角色为主，台词简短生动，情节简单清晰，每个故事传递一个明确的道理（诚实、善良、勤奋等），结局用简单直白的方式点明寓意，适合低龄受众。',
  },
  {
    value: 'school-life-kids',
    label: '校园成长',
    description: '校园日常，友谊第一',
    toneInstruction:
      '剧本风格：儿童校园成长。围绕小学/幼儿园日常展开，台词贴近儿童真实语言习惯，情节轻松有趣，聚焦友谊建立、面对困难和自我成长，正能量满满，无需爱情元素。',
  },

  // ── 特殊风格系 ──────────────────────────────────────────────
  {
    value: 'cinematic-art',
    label: '文艺电影感',
    description: '慢节奏，意象丰富',
    toneInstruction:
      '剧本风格：文艺电影感。台词简练含蓄充满意象，场景描述注重氛围而非情节推进，角色内心冲突大于外部冲突，适合慢节奏、情绪积累式的叙事结构。',
  },
  {
    value: 'documentary',
    label: '纪实风格',
    description: '真实感，克制平淡',
    toneInstruction:
      '剧本风格：纪实风格。台词符合真实人物说话习惯（不完整句、口语化、停顿），场景描述客观不夸张，情节避免戏剧化转折，追求生活流的真实感。',
  },
]

/**
 * 根据 value 获取风格基调的 toneInstruction
 * value 为 'auto' 或空时返回空字符串（不注入 prompt）
 */
export function getScreenplayToneInstruction(value: string | null | undefined): string {
  if (!value || value === 'auto') return ''
  return SCREENPLAY_TONE_PRESETS.find((p) => p.value === value)?.toneInstruction ?? ''
}
