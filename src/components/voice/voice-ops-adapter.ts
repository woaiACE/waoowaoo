/**
 * VoiceOpsAdapter — 跨模式音色操作适配器接口
 *
 * 解决问题：通用模式 (novel-promotion) 和 LXT 模式的音色 CRUD 操作
 * 逻辑完全相同，但 API 路径、数据库表、缓存 key 不同。
 *
 * 方案：UI 组件（VoiceSettingsPanel）只依赖此接口，
 * 每种模式提供自己的适配器实现（hook），实现零耦合复用。
 *
 * 通用模式 → useNovelVoiceOpsAdapter(projectId, characterId)
 * LXT 模式  → useLxtVoiceOpsAdapter(projectId, assetId)
 */

export interface VoiceOpsAdapter {
  // ── 当前状态 ────────────────────────────────────────
  customVoiceUrl: string | null | undefined
  voiceId: string | null | undefined
  voiceType: string | null | undefined
  voicePrompt?: string | null
  characterName: string

  // ── 上传音频 ────────────────────────────────────────
  uploadVoice: (file: File) => Promise<void>
  isUploadingVoice: boolean

  // ── 保存 AI 设计的声音 ──────────────────────────────
  /** voiceId: 百炼返回的 voice_id；audioBase64: 试听音频 */
  saveDesignedVoice: (voiceId: string, audioBase64: string) => Promise<void>
  isSavingDesignedVoice: boolean

  // ── AI 设计 (触发 qwen-voice-design 任务) ───────────
  /** 提交 AI 音色设计任务并等待结果 */
  designVoice: (voicePrompt: string, previewText: string) => Promise<void>
  isDesigningVoice: boolean

  // ── 从声音库选择 ────────────────────────────────────
  /** 打开选择弹窗，弹窗关闭后自动刷新 */
  openVoiceLibraryPicker: () => void

  // ── LXT 专属：LLM 推理音色描述（optional） ───────────
  inferVoicePrompt?: () => Promise<string>
  isInferringVoicePrompt?: boolean
}
