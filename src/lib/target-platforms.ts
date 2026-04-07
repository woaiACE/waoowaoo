/**
 * 目标投放平台预设
 * 选择平台后自动联动推荐 videoRatio
 */

export interface TargetPlatform {
  value: string
  label: string
  description: string
  videoRatio: string | null  // null 表示不覆盖 videoRatio（自定义）
  icon: string               // emoji 图标
}

export const TARGET_PLATFORMS: readonly TargetPlatform[] = [
  {
    value: 'douyin',
    label: '抖音 / 快手 / 视频号',
    description: '竖屏短剧，主流短视频平台',
    videoRatio: '9:16',
    icon: '📱',
  },
  {
    value: 'bilibili',
    label: 'B站 / 优酷 / 爱奇艺',
    description: '横屏内容，长视频平台',
    videoRatio: '16:9',
    icon: '📺',
  },
  {
    value: 'youtube',
    label: 'YouTube / 海外平台',
    description: '海外横屏内容发行',
    videoRatio: '16:9',
    icon: '🌐',
  },
  {
    value: 'xiaohongshu',
    label: '小红书 / 微博',
    description: '图文竖版信息流',
    videoRatio: '4:5',
    icon: '📷',
  },
  {
    value: 'theater',
    label: '院线 / 大屏',
    description: '超宽银幕影院级画幅',
    videoRatio: '21:9',
    icon: '🎬',
  },
  {
    value: 'square',
    label: '通用方形',
    description: '头像、封面、社交平台通用',
    videoRatio: '1:1',
    icon: '⬛',
  },
  {
    value: 'custom',
    label: '自定义',
    description: '手动设置比例，不自动联动',
    videoRatio: null,
    icon: '⚙️',
  },
] as const

export type TargetPlatformValue = typeof TARGET_PLATFORMS[number]['value']

/** 根据平台值获取推荐的 videoRatio */
export function getPlatformVideoRatio(platform: string | null | undefined): string | null {
  if (!platform) return null
  return TARGET_PLATFORMS.find(p => p.value === platform)?.videoRatio ?? null
}

/** 获取平台对象 */
export function getTargetPlatform(value: string): TargetPlatform | undefined {
  return TARGET_PLATFORMS.find(p => p.value === value)
}
