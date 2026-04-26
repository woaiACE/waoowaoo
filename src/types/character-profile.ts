/**
 * 角色档案数据结构
 * 用于两阶段角色生成系统
 */

export type RoleLevel = 'S' | 'A' | 'B' | 'C' | 'D'

export type CostumeTier = 1 | 2 | 3 | 4 | 5

export interface CharacterProfileData {
    /** 角色重要性层级 */
    role_level: RoleLevel

    /** 角色原型 (如: 霸道总裁, 心机婊) */
    archetype: string

    /** 性格标签 */
    personality_tags: string[]

    /** 时代背景 */
    era_period: string

    /** 社会阶层 */
    social_class: string

    /** 职业 (可选) */
    occupation?: string

    /** 服装华丽度 (1-5) */
    costume_tier: CostumeTier

    /** 建议色彩 */
    suggested_colors: string[]

    /** 主要辨识标志 (S/A级角色必须) */
    primary_identifier?: string

    /** 视觉关键词 */
    visual_keywords: string[]

    /** 性别 */
    gender: string

    /** 年龄段描述 */
    age_range: string

    /** 体型比例描述（非人类或特殊体型时填写，如"头身比1:2，幼崽圆润比例，体长约0.7m"） */
    body_proportion?: string

    /** 物种形态特征关键词（非人类角色填写，如["耷拉软耳","灰白细绒毛","浅灰色蹄"]） */
    species_traits?: string[]

    // ── 8段叙述描述字段（图片生成用，LLM自动生成后可手动编辑） ──

    /** 段1：基础身份（物种/年龄/性别/肤质，25-35字） */
    narrative_seg1_identity?: string
    /** 段2：上衣装扮（款式/颜色/图案，30-40字） */
    narrative_seg2_upper?: string
    /** 段3：身体特征（身高/体型/比例，35-45字） */
    narrative_seg3_body?: string
    /** 段4：脸型基础（脸型/轮廓，25-35字） */
    narrative_seg4_face?: string
    /** 段5：五官气质（眼鼻口+神态+气质，55-70字，最关键段落） */
    narrative_seg5_features?: string
    /** 段6：头发风格（发型/发质/发色，20-30字） */
    narrative_seg6_hair?: string
    /** 段7：下装腿脚（下装/脚部/鞋类，30-40字） */
    narrative_seg7_lower?: string
    /** 段8：配饰细节（颈部/装饰品，25-35字） */
    narrative_seg8_accessories?: string

    /** 8段合并后的完整叙述描述（提交时自动合并，用于图片生成） */
    narrativeDescription?: string
}

/**
 * 从JSON字符串解析角色档案
 */
export function parseProfileData(profileDataJson: string | null): CharacterProfileData | null {
    if (!profileDataJson) return null
    try {
        return JSON.parse(profileDataJson) as CharacterProfileData
    } catch {
        return null
    }
}

/**
 * 将角色档案序列化为JSON字符串
 */
export function stringifyProfileData(profileData: CharacterProfileData): string {
    return JSON.stringify(profileData)
}

/**
 * 验证角色档案数据完整性
 */
export function validateProfileData(data: unknown): data is CharacterProfileData {
    if (!data || typeof data !== 'object') return false
    const candidate = data as Partial<CharacterProfileData>
    return !!(
        typeof candidate.role_level === 'string' &&
        ['S', 'A', 'B', 'C', 'D'].includes(candidate.role_level) &&
        typeof candidate.archetype === 'string' &&
        Array.isArray(candidate.personality_tags) &&
        typeof candidate.era_period === 'string' &&
        typeof candidate.social_class === 'string' &&
        typeof candidate.costume_tier === 'number' &&
        candidate.costume_tier >= 1 &&
        candidate.costume_tier <= 5 &&
        Array.isArray(candidate.suggested_colors) &&
        Array.isArray(candidate.visual_keywords) &&
        typeof candidate.gender === 'string' &&
        typeof candidate.age_range === 'string'
    )
}
