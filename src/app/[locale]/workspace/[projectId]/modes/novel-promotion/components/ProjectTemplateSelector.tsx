'use client'

import { useState } from 'react'
import { PROJECT_TEMPLATES, type ProjectTemplate } from '@/lib/project-templates'
import { AppIcon } from '@/components/ui/icons'

interface ProjectTemplateSelectorProps {
  onApply: (template: ProjectTemplate) => void
}

const CATEGORY_LABELS: Record<string, string> = {
  '古装历史': '🏯 古装历史',
  '都市现代': '🏢 都市现代',
  '悬疑犯罪': '🔍 悬疑犯罪',
  '科幻未来': '🚀 科幻未来',
  '二次元': '🌟 二次元',
  '治愈生活': '☕ 治愈生活',
  '儿童': '📖 儿童',
}

/** 按类别分组模板 */
function groupTemplates() {
  const groups: Record<string, ProjectTemplate[]> = {
    '古装历史': [],
    '都市现代': [],
    '悬疑犯罪': [],
    '科幻未来': [],
    '二次元': [],
    '治愈生活': [],
    '儿童': [],
  }
  for (const t of PROJECT_TEMPLATES) {
    if (t.tags.some(tag => ['古装', '武侠', '修仙', '民国', '西域', '谍战', '历史奇幻'].includes(tag))) {
      groups['古装历史'].push(t)
    } else if (t.tags.some(tag => ['都市', '总裁', '豪门', '逆袭', '校园', '娱乐圈', '言情', '重生', '甜宠', '商战'].includes(tag))) {
      groups['都市现代'].push(t)
    } else if (t.tags.some(tag => ['悬疑', '犯罪', '推理', '恐怖', '惊悚', '侦探', '黑色电影'].includes(tag))) {
      groups['悬疑犯罪'].push(t)
    } else if (t.tags.some(tag => ['科幻', '赛博朋克', '末世', '蒸汽朋克', '星际', '太空'].includes(tag))) {
      groups['科幻未来'].push(t)
    } else if (t.tags.some(tag => ['动漫', '日系', '吉卜力', '3D', 'CG', '热血'].includes(tag))) {
      groups['二次元'].push(t)
    } else if (t.tags.some(tag => ['治愈', '日常', '温暖', '乡村', '田园', '韩剧', '唯美'].includes(tag))) {
      groups['治愈生活'].push(t)
    } else if (t.tags.some(tag => ['儿童', '绘本', '教育'].includes(tag))) {
      groups['儿童'].push(t)
    }
  }
  return groups
}

export default function ProjectTemplateSelector({ onApply }: ProjectTemplateSelectorProps) {
  const [open, setOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('古装历史')
  const groups = groupTemplates()

  return (
    <div className="glass-surface overflow-hidden">
      {/* 头部触发行 */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--glass-surface-hover,rgba(255,255,255,0.04))] transition-colors"
      >
        <AppIcon name="sparkles" className="w-4 h-4 text-[#7c3aed] flex-shrink-0" />
        <span className="text-sm font-medium text-[var(--glass-text-secondary)] flex-1">
          🎬 快速套用模板
        </span>
        <span className="text-xs text-[var(--glass-text-tertiary)]">
          {PROJECT_TEMPLATES.length} 套热门短剧配置
        </span>
        <AppIcon
          name={open ? 'chevronUp' : 'chevronDown'}
          className="w-4 h-4 text-[var(--glass-text-tertiary)] flex-shrink-0"
        />
      </button>

      {/* 展开内容 */}
      {open && (
        <div className="border-t border-[var(--glass-stroke-subtle)]">
          {/* 分类 Tab */}
          <div className="flex gap-0 overflow-x-auto px-1 pt-1 pb-1 border-b border-[var(--glass-stroke-subtle)] scrollbar-hide">
            {Object.keys(CATEGORY_LABELS).map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={[
                  'flex-shrink-0 px-3 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap',
                  activeCategory === cat
                    ? 'bg-[var(--glass-tone-info-fg)] text-white font-semibold'
                    : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-surface-hover,rgba(255,255,255,0.06))]',
                ].join(' ')}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* 模板卡片网格 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3">
            {(groups[activeCategory] ?? []).map(template => (
              <button
                key={template.id}
                onClick={() => {
                  onApply(template)
                  setOpen(false)
                }}
                className="text-left p-3 rounded-xl border border-[var(--glass-stroke-subtle)] hover:border-[var(--glass-tone-info-fg)]/50 hover:bg-[var(--glass-surface-hover,rgba(255,255,255,0.04))] transition-all group"
              >
                <div className="text-lg mb-1">{template.emoji}</div>
                <div className="text-xs font-semibold text-[var(--glass-text-primary)] group-hover:text-[var(--glass-tone-info-fg)] transition-colors">
                  {template.label}
                </div>
                <div className="text-[11px] text-[var(--glass-text-tertiary)] mt-0.5 line-clamp-2">
                  {template.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
