'use client'

/**
 * 角色档案编辑对话框
 * 允许用户编辑角色档案的各项属性，并在LXT模式下生成8段叙述描述
 */

import { useTranslations } from 'next-intl'
import { useState, useEffect, useCallback } from 'react'
import { CharacterProfileData, RoleLevel, CostumeTier } from '@/types/character-profile'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'

interface CharacterProfileDialogProps {
    isOpen: boolean
    characterName: string
    profileData: CharacterProfileData
    onClose: () => void
    onSave: (profileData: CharacterProfileData) => void
    isSaving?: boolean
    /** LXT模式下传入，用于调用8段叙述生成API */
    projectId?: string
    /** LXT模式下传入，用于调用8段叙述生成API */
    assetId?: string
}

// 8段叙述段落配置
const NARRATIVE_SEGMENTS = [
    { key: 'narrative_seg1_identity' as const, labelKey: 'characterProfile.narrativeDescription.seg1Label', placeholderKey: 'characterProfile.narrativeDescription.seg1Placeholder', rows: 2 },
    { key: 'narrative_seg2_upper' as const,    labelKey: 'characterProfile.narrativeDescription.seg2Label', placeholderKey: 'characterProfile.narrativeDescription.seg2Placeholder', rows: 2 },
    { key: 'narrative_seg3_body' as const,     labelKey: 'characterProfile.narrativeDescription.seg3Label', placeholderKey: 'characterProfile.narrativeDescription.seg3Placeholder', rows: 2 },
    { key: 'narrative_seg4_face' as const,     labelKey: 'characterProfile.narrativeDescription.seg4Label', placeholderKey: 'characterProfile.narrativeDescription.seg4Placeholder', rows: 2 },
    { key: 'narrative_seg5_features' as const, labelKey: 'characterProfile.narrativeDescription.seg5Label', placeholderKey: 'characterProfile.narrativeDescription.seg5Placeholder', rows: 3 },
    { key: 'narrative_seg6_hair' as const,     labelKey: 'characterProfile.narrativeDescription.seg6Label', placeholderKey: 'characterProfile.narrativeDescription.seg6Placeholder', rows: 2 },
    { key: 'narrative_seg7_lower' as const,    labelKey: 'characterProfile.narrativeDescription.seg7Label', placeholderKey: 'characterProfile.narrativeDescription.seg7Placeholder', rows: 2 },
    { key: 'narrative_seg8_accessories' as const, labelKey: 'characterProfile.narrativeDescription.seg8Label', placeholderKey: 'characterProfile.narrativeDescription.seg8Placeholder', rows: 2 },
] as const

const ROLE_LEVELS: RoleLevel[] = ['S', 'A', 'B', 'C', 'D']
const COSTUME_TIERS: CostumeTier[] = [5, 4, 3, 2, 1]

export default function CharacterProfileDialog({
    isOpen,
    characterName,
    profileData,
    onClose,
    onSave,
    isSaving = false,
    projectId,
    assetId,
}: CharacterProfileDialogProps) {
    const t = useTranslations('assets')
    const savingState = isSaving
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'build',
            resource: 'image',
            hasOutput: false,
        })
        : null
    const [formData, setFormData] = useState<CharacterProfileData>(profileData)
    const [newTag, setNewTag] = useState('')
    const [newColor, setNewColor] = useState('')
    const [newKeyword, setNewKeyword] = useState('')
    // 8段叙述相关状态
    const [narrativeOpen, setNarrativeOpen] = useState(false)
    const [isGeneratingNarrative, setIsGeneratingNarrative] = useState(false)
    const [narrativeError, setNarrativeError] = useState<string | null>(null)

    const hasAnySegment = NARRATIVE_SEGMENTS.some(seg => !!formData[seg.key])

    useEffect(() => {
        setFormData(profileData)
        // 若已有叙述段落数据，自动展开该区块
        const hasSeg = NARRATIVE_SEGMENTS.some(seg => !!profileData[seg.key])
        if (hasSeg) setNarrativeOpen(true)
    }, [profileData])

    const generateNarrative = useCallback(async () => {
        if (!projectId || !assetId) return
        setIsGeneratingNarrative(true)
        setNarrativeOpen(true)
        setNarrativeError(null)
        // 清空当前8段以便流式填充
        setFormData(prev => ({
            ...prev,
            narrative_seg1_identity: '',
            narrative_seg2_upper: '',
            narrative_seg3_body: '',
            narrative_seg4_face: '',
            narrative_seg5_features: '',
            narrative_seg6_hair: '',
            narrative_seg7_lower: '',
            narrative_seg8_accessories: '',
        }))
        try {
            const res = await fetch(`/api/lxt/${projectId}/assets/${assetId}/generate-narrative`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profileData: formData }),
            })
            if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            while (true) {
                const { done, value } = await reader.read()
                if (done) {
                    // 处理流关闭前 buffer 中的剩余数据
                    if (buffer.trim()) {
                        const line = buffer.trim()
                        if (line.startsWith('data: ')) {
                            try {
                                const event = JSON.parse(line.slice(6)) as { kind: string; segments?: Record<string, string>; message?: string }
                                if (event.kind === 'done' && event.segments) {
                                    const segs = event.segments
                                    setFormData(prev => ({
                                        ...prev,
                                        narrative_seg1_identity: segs.seg1 ?? prev.narrative_seg1_identity ?? '',
                                        narrative_seg2_upper:    segs.seg2 ?? prev.narrative_seg2_upper ?? '',
                                        narrative_seg3_body:     segs.seg3 ?? prev.narrative_seg3_body ?? '',
                                        narrative_seg4_face:     segs.seg4 ?? prev.narrative_seg4_face ?? '',
                                        narrative_seg5_features: segs.seg5 ?? prev.narrative_seg5_features ?? '',
                                        narrative_seg6_hair:     segs.seg6 ?? prev.narrative_seg6_hair ?? '',
                                        narrative_seg7_lower:    segs.seg7 ?? prev.narrative_seg7_lower ?? '',
                                        narrative_seg8_accessories: segs.seg8 ?? prev.narrative_seg8_accessories ?? '',
                                    }))
                                } else if (event.kind === 'error') {
                                    setNarrativeError(event.message ?? '生成失败')
                                }
                            } catch { /* ignore */ }
                        }
                    }
                    break
                }
                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() ?? ''
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue
                    try {
                        const event = JSON.parse(line.slice(6)) as { kind: string; segments?: Record<string, string>; message?: string }
                        if (event.kind === 'done' && event.segments) {
                            const segs = event.segments
                            setFormData(prev => ({
                                ...prev,
                                narrative_seg1_identity: segs.seg1 ?? prev.narrative_seg1_identity ?? '',
                                narrative_seg2_upper:    segs.seg2 ?? prev.narrative_seg2_upper ?? '',
                                narrative_seg3_body:     segs.seg3 ?? prev.narrative_seg3_body ?? '',
                                narrative_seg4_face:     segs.seg4 ?? prev.narrative_seg4_face ?? '',
                                narrative_seg5_features: segs.seg5 ?? prev.narrative_seg5_features ?? '',
                                narrative_seg6_hair:     segs.seg6 ?? prev.narrative_seg6_hair ?? '',
                                narrative_seg7_lower:    segs.seg7 ?? prev.narrative_seg7_lower ?? '',
                                narrative_seg8_accessories: segs.seg8 ?? prev.narrative_seg8_accessories ?? '',
                            }))
                        } else if (event.kind === 'error') {
                            setNarrativeError(event.message ?? '生成失败')
                        }
                    } catch { /* skip malformed lines */ }
                }
            }
        } catch (err) {
            setNarrativeError(err instanceof Error ? err.message : '生成失败')
        } finally {
            setIsGeneratingNarrative(false)
        }
    }, [projectId, assetId, formData])

    if (!isOpen) return null

    const handleSubmit = () => {
        // 提交时将8段合并为 narrativeDescription
        const segs = NARRATIVE_SEGMENTS.map(seg => formData[seg.key]).filter(Boolean)
        const merged = segs.length > 0 ? segs.join('，') : undefined
        onSave({ ...formData, narrativeDescription: merged })
    }

    const addTag = () => {
        if (newTag.trim() && !formData.personality_tags.includes(newTag.trim())) {
            setFormData({ ...formData, personality_tags: [...formData.personality_tags, newTag.trim()] })
            setNewTag('')
        }
    }

    const removeTag = (index: number) => {
        setFormData({
            ...formData,
            personality_tags: formData.personality_tags.filter((_, i) => i !== index)
        })
    }

    const addColor = () => {
        if (newColor.trim() && !formData.suggested_colors.includes(newColor.trim())) {
            setFormData({ ...formData, suggested_colors: [...formData.suggested_colors, newColor.trim()] })
            setNewColor('')
        }
    }

    const removeColor = (index: number) => {
        setFormData({
            ...formData,
            suggested_colors: formData.suggested_colors.filter((_, i) => i !== index)
        })
    }

    const addKeyword = () => {
        if (newKeyword.trim() && !formData.visual_keywords.includes(newKeyword.trim())) {
            setFormData({ ...formData, visual_keywords: [...formData.visual_keywords, newKeyword.trim()] })
            setNewKeyword('')
        }
    }

    const removeKeyword = (index: number) => {
        setFormData({
            ...formData,
            visual_keywords: formData.visual_keywords.filter((_, i) => i !== index)
        })
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--glass-overlay)]" onClick={onClose}>
            <div
                className="bg-[var(--glass-bg-surface)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col m-4"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 头部 */}
                <div className="bg-[var(--glass-bg-surface)] border-b border-[var(--glass-stroke-base)] px-6 py-4 flex items-center justify-between shrink-0">
                    <h2 className="text-xl font-semibold text-[var(--glass-text-primary)]">{t('characterProfile.editDialogTitle', { name: characterName })}</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-[var(--glass-bg-muted)] rounded-lg transition-colors"
                    >
                        <AppIcon name="close" className="w-5 h-5" />
                    </button>
                </div>

                {/* 表单内容 */}
                <div className="p-6 space-y-4 overflow-y-auto app-scrollbar flex-1 min-h-0">
                    {/* 角色层级 */}
                    <div>
                        <label className="block text-sm font-medium text-[var(--glass-text-secondary)] mb-2">{t('characterProfile.importanceLevel')}</label>
                        <select
                            value={formData.role_level}
                            onChange={(e) => setFormData({ ...formData, role_level: e.target.value as RoleLevel })}
                            className="w-full px-3 py-2 border border-[var(--glass-stroke-strong)] rounded-lg focus:ring-2 focus:ring-[var(--glass-tone-info-fg)] focus:border-[var(--glass-stroke-focus)]"
                        >
                            {ROLE_LEVELS.map((level) => (
                                <option key={level} value={level}>
                                    {t(`characterProfile.importance.${level}` as never)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 角色原型 */}
                    <div>
                        <label className="block text-sm font-medium text-[var(--glass-text-secondary)] mb-2">{t('characterProfile.characterArchetype')}</label>
                        <input
                            type="text"
                            value={formData.archetype}
                            onChange={(e) => setFormData({ ...formData, archetype: e.target.value })}
                            placeholder={t('characterProfile.archetypePlaceholder')}
                            className="w-full px-3 py-2 border border-[var(--glass-stroke-strong)] rounded-lg focus:ring-2 focus:ring-[var(--glass-tone-info-fg)] focus:border-[var(--glass-stroke-focus)]"
                        />
                    </div>

                    {/* 性格标签 */}
                    <div>
                        <label className="block text-sm font-medium text-[var(--glass-text-secondary)] mb-2">{t('characterProfile.personalityTags')}</label>
                        <div className="flex gap-2 mb-2">
                            {formData.personality_tags.map((tag, i) => (
                                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] rounded-lg text-sm">
                                    {tag}
                                    <button onClick={() => removeTag(i)} className="inline-flex h-4 w-4 items-center justify-center hover:text-[var(--glass-text-primary)]">
                                        <AppIcon name="closeSm" className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                                placeholder={t('characterProfile.addTagPlaceholder')}
                                className="flex-1 px-3 py-2 border border-[var(--glass-stroke-strong)] rounded-lg"
                            />
                            <button onClick={addTag} className="px-4 py-2 bg-[var(--glass-accent-from)] text-white rounded-lg hover:bg-[var(--glass-accent-to)]">
                                {t("common.add")}
                            </button>
                        </div>
                    </div>

                    {/* 服装华丽度 */}
                    <div>
                        <label className="block text-sm font-medium text-[var(--glass-text-secondary)] mb-2">{t('characterProfile.costumeLevelLabel')}</label>
                        <select
                            value={formData.costume_tier}
                            onChange={(e) => setFormData({ ...formData, costume_tier: Number(e.target.value) as CostumeTier })}
                            className="w-full px-3 py-2 border border-[var(--glass-stroke-strong)] rounded-lg focus:ring-2 focus:ring-[var(--glass-tone-info-fg)] focus:border-[var(--glass-stroke-focus)]"
                        >
                            {COSTUME_TIERS.map((tier) => (
                                <option key={tier} value={tier}>
                                    {t(`characterProfile.costumeLevel.${tier}` as never)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 建议色彩 */}
                    <div>
                        <label className="block text-sm font-medium text-[var(--glass-text-secondary)] mb-2">{t('characterProfile.suggestedColors')}</label>
                        <div className="flex gap-2 mb-2 flex-wrap">
                            {formData.suggested_colors.map((color, i) => (
                                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] rounded-lg text-sm">
                                    {color}
                                    <button onClick={() => removeColor(i)} className="inline-flex h-4 w-4 items-center justify-center hover:text-[var(--glass-text-primary)]">
                                        <AppIcon name="closeSm" className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newColor}
                                onChange={(e) => setNewColor(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addColor())}
                                placeholder={t('characterProfile.colorPlaceholder')}
                                className="flex-1 px-3 py-2 border border-[var(--glass-stroke-strong)] rounded-lg"
                            />
                            <button onClick={addColor} className="px-4 py-2 bg-[var(--glass-accent-from)] text-white rounded-lg hover:bg-[var(--glass-accent-to)]">
                                {t("common.add")}
                            </button>
                        </div>
                    </div>

                    {/* 辨识标志 */}
                    <div>
                        <label className="block text-sm font-medium text-[var(--glass-text-secondary)] mb-2">
                            {t('characterProfile.primaryMarker')} <span className="text-xs text-[var(--glass-text-tertiary)]">{t('characterProfile.markerNote')}</span>
                        </label>
                        <input
                            type="text"
                            value={formData.primary_identifier || ''}
                            onChange={(e) => setFormData({ ...formData, primary_identifier: e.target.value })}
                            placeholder={t('characterProfile.markingsPlaceholder')}
                            className="w-full px-3 py-2 border border-[var(--glass-stroke-strong)] rounded-lg focus:ring-2 focus:ring-[var(--glass-tone-info-fg)] focus:border-[var(--glass-stroke-focus)]"
                        />
                    </div>

                    {/* 视觉关键词 */}
                    <div>
                        <label className="block text-sm font-medium text-[var(--glass-text-secondary)] mb-2">{t('characterProfile.visualKeywords')}</label>
                        <div className="flex gap-2 mb-2 flex-wrap">
                            {formData.visual_keywords.map((keyword, i) => (
                                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] rounded-lg text-sm">
                                    {keyword}
                                    <button onClick={() => removeKeyword(i)} className="inline-flex h-4 w-4 items-center justify-center hover:text-[var(--glass-text-primary)]">
                                        <AppIcon name="closeSm" className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newKeyword}
                                onChange={(e) => setNewKeyword(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                                placeholder={t('characterProfile.keywordsPlaceholder')}
                                className="flex-1 px-3 py-2 border border-[var(--glass-stroke-strong)] rounded-lg"
                            />
                            <button onClick={addKeyword} className="px-4 py-2 bg-[var(--glass-accent-from)] text-white rounded-lg hover:bg-[var(--glass-accent-to)]">
                                {t("common.add")}
                            </button>
                        </div>
                    </div>

                    {/* 8段叙述描述（仅LXT模式，需要 projectId + assetId） */}
                    {projectId && assetId && (
                        <div className="border border-[var(--glass-stroke-base)] rounded-xl overflow-hidden">
                            {/* 区块标题栏 */}
                            <div className="flex items-center justify-between px-4 py-3 bg-[var(--glass-bg-muted)]">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-[var(--glass-text-primary)]">
                                        {t('characterProfile.narrativeDescription.sectionTitle')}
                                    </span>
                                    {hasAnySegment && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]">
                                            ✓
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void generateNarrative()}
                                        disabled={isGeneratingNarrative || isSaving}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--glass-accent-from)] text-white hover:bg-[var(--glass-accent-to)] transition-colors disabled:opacity-50"
                                    >
                                        {isGeneratingNarrative ? (
                                            <>
                                                <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                                {t('characterProfile.narrativeDescription.generating')}
                                            </>
                                        ) : hasAnySegment ? (
                                            t('characterProfile.narrativeDescription.regenerateBtn')
                                        ) : (
                                            t('characterProfile.narrativeDescription.generateBtn')
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setNarrativeOpen(v => !v)}
                                        className="p-1.5 hover:bg-[var(--glass-bg-surface)] rounded-lg transition-colors text-[var(--glass-text-tertiary)]"
                                        aria-label={narrativeOpen ? t('characterProfile.narrativeDescription.collapseLabel') : t('characterProfile.narrativeDescription.expandLabel')}
                                    >
                                        <AppIcon name="chevronDown" className={`w-4 h-4 transition-transform ${narrativeOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                </div>
                            </div>

                            {/* 8段编辑表单 */}
                            {narrativeOpen && (
                                <div className="p-4 space-y-3">
                                    {narrativeError && (
                                        <div className="px-3 py-2 rounded-lg bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)] text-xs">
                                            {narrativeError}
                                        </div>
                                    )}
                                    {!hasAnySegment && !isGeneratingNarrative && (
                                        <p className="text-xs text-[var(--glass-text-tertiary)] text-center py-2">
                                            {t('characterProfile.narrativeDescription.generateFirst')}
                                        </p>
                                    )}
                                    {NARRATIVE_SEGMENTS.map((seg) => (
                                        <div key={seg.key}>
                                            <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-1">
                                                {t(seg.labelKey as never)}
                                                {seg.key === 'narrative_seg5_features' && (
                                                    <span className="ml-1 text-[10px] text-[var(--glass-tone-warning-fg)]">
                                                        {t('characterProfile.narrativeDescription.seg5Hint')}
                                                    </span>
                                                )}
                                            </label>
                                            <textarea
                                                value={formData[seg.key] ?? ''}
                                                onChange={(e) => setFormData(prev => ({ ...prev, [seg.key]: e.target.value }))}
                                                placeholder={isGeneratingNarrative ? '' : t(seg.placeholderKey as never)}
                                                rows={seg.rows}
                                                disabled={isGeneratingNarrative}
                                                className="w-full px-3 py-2 text-sm border border-[var(--glass-stroke-strong)] rounded-lg resize-none focus:ring-2 focus:ring-[var(--glass-tone-info-fg)] focus:border-[var(--glass-stroke-focus)] disabled:opacity-60 disabled:bg-[var(--glass-bg-muted)]"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* 底部按钮 */}
                <div className="bg-[var(--glass-bg-surface)] border-t border-[var(--glass-stroke-base)] px-6 py-4 flex gap-3 justify-end shrink-0">
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-6 py-2 border border-[var(--glass-stroke-strong)] rounded-lg hover:bg-[var(--glass-bg-muted)] transition-colors disabled:opacity-50"
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSaving}
                        className="px-6 py-2 bg-[var(--glass-accent-from)] text-white rounded-lg hover:bg-[var(--glass-accent-to)] transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSaving && <TaskStatusInline state={savingState} className="text-white [&>span]:sr-only [&_svg]:text-white" />}
                        {t('characterProfile.confirmAndGenerate')}
                    </button>
                </div>
            </div>
        </div>
    )
}
