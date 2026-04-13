/**
 * 平台导出预设
 * 各平台推荐的宽高比与时长限制（供 UI 提示用，不强制修改 config）
 */
export interface PlatformPreset {
    label: string
    ratio: string | null
    maxSeconds: number | null
    description: string
}

export const PLATFORM_PRESETS: Record<string, PlatformPreset> = {
    douyin:   { label: '抖音 / TikTok', ratio: '9:16',  maxSeconds: 60,   description: '竖屏 9:16，最长 60s' },
    bilibili: { label: 'B站',           ratio: '16:9',  maxSeconds: 600,  description: '横屏 16:9，最长 10 分钟' },
    youtube:  { label: 'YouTube',       ratio: '16:9',  maxSeconds: 3600, description: '横屏 16:9，时长不限' },
    custom:   { label: '自定义',         ratio: null,    maxSeconds: null, description: '不限制' },
}

export const DEFAULT_PLATFORM = 'custom' as const
export type PlatformKey = keyof typeof PLATFORM_PRESETS
