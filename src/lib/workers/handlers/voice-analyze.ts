import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { buildCharactersIntroduction } from '@/lib/constants'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import type { TaskJobData } from '@/lib/task/types'
import {
  buildStoryboardJson,
  parseVoiceLinesJson,
  type VoiceLinePayload,
} from './voice-analyze-helpers'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'
import { resolveAnalysisModel } from './resolve-analysis-model'

const MAX_VOICE_ANALYZE_ATTEMPTS = 2

export async function handleVoiceAnalyzeTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const projectId = job.data.projectId
  const episodeIdRaw =
    typeof payload.episodeId === 'string'
      ? payload.episodeId
      : typeof job.data.episodeId === 'string'
        ? job.data.episodeId
        : ''
  const episodeId = episodeIdRaw.trim()

  if (!episodeId) {
    throw new Error('episodeId is required')
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
    },
  })
  if (!project) {
    throw new Error('Project not found')
  }

  const novelPromotionData = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    include: {
      characters: true,
    },
  })
  if (!novelPromotionData) {
    throw new Error('Novel promotion data not found')
  }

  const episode = await prisma.novelPromotionEpisode.findUnique({
    where: { id: episodeId },
    include: {
      storyboards: {
        include: {
          clip: true,
          panels: {
            orderBy: { panelIndex: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!episode) {
    throw new Error('Episode not found')
  }
  if (episode.novelPromotionProjectId !== novelPromotionData.id) {
    throw new Error('Episode does not belong to this project')
  }

  const novelText = episode.novelText
  if (!novelText) {
    throw new Error('No novel text to analyze')
  }

  const analysisModel = await resolveAnalysisModel({
    userId: job.data.userId,
    inputModel: payload.model,
    projectAnalysisModel: novelPromotionData.analysisModel,
  })

  const charactersLibName = novelPromotionData.characters.length > 0
    ? novelPromotionData.characters.map((c) => c.name).join('、')
    : '无'
  const charactersIntroduction = buildCharactersIntroduction(novelPromotionData.characters)
  const storyboardJson = buildStoryboardJson(episode.storyboards || [])
  const promptTemplate = buildPrompt({
    promptId: PROMPT_IDS.NP_VOICE_ANALYSIS,
    locale: job.data.locale,
    variables: {
      input: novelText,
      characters_lib_name: charactersLibName,
      characters_introduction: charactersIntroduction,
      storyboard_json: storyboardJson,
    },
  })

  await reportTaskProgress(job, 20, {
    stage: 'voice_analyze_prepare',
    stageLabel: '准备台词分析参数',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'voice_analyze_prepare')

  const streamContext = createWorkerLLMStreamContext(job, 'voice_analyze')
  const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)
  const panelIdByStoryboardPanel = new Map<string, string>()
  for (const storyboard of episode.storyboards || []) {
    for (const panel of storyboard.panels || []) {
      panelIdByStoryboardPanel.set(`${storyboard.id}:${panel.panelIndex}`, panel.id)
    }
  }
  if (panelIdByStoryboardPanel.size === 0) {
    throw new Error('No storyboard panels found for voice matching')
  }

  type StrictVoiceLine = {
    lineIndex: number
    speaker: string
    content: string
    emotionStrength: number
    matchedPanelId: string | null
    matchedStoryboardId: string | null
    matchedPanelIndex: number | null
  }
  let voiceLinesData: StrictVoiceLine[] | null = null
  let lastAnalyzeError: Error | null = null

  try {
    for (let attempt = 1; attempt <= MAX_VOICE_ANALYZE_ATTEMPTS; attempt += 1) {
      try {
        const completion = await withInternalLLMStreamCallbacks(
          streamCallbacks,
          async () =>
            await executeAiTextStep({
              userId: job.data.userId,
              model: analysisModel,
              messages: [{ role: 'user', content: promptTemplate }],
              projectId,
              action: 'voice_analyze',
              meta: {
                stepId: 'voice_analyze',
                stepAttempt: attempt,
                stepTitle: '台词分析',
                stepIndex: 1,
                stepTotal: 1,
              },
            }),
        )

        const responseText = completion.text
        if (!responseText) {
          throw new Error('No response from AI')
        }

        const parsedLines = parseVoiceLinesJson(responseText)
        const strictLines: StrictVoiceLine[] = parsedLines.map((lineData: VoiceLinePayload, index: number) => {
          if (typeof lineData.lineIndex !== 'number' || !Number.isFinite(lineData.lineIndex)) {
            throw new Error(`voice line ${index + 1} is missing valid lineIndex`)
          }
          const lineIndex = Math.floor(lineData.lineIndex)
          if (lineIndex <= 0) {
            throw new Error(`voice line ${index + 1} has invalid lineIndex`)
          }
          if (typeof lineData.speaker !== 'string' || !lineData.speaker.trim()) {
            throw new Error(`voice line ${index + 1} is missing valid speaker`)
          }
          if (typeof lineData.content !== 'string' || !lineData.content.trim()) {
            throw new Error(`voice line ${index + 1} is missing valid content`)
          }
          if (typeof lineData.emotionStrength !== 'number' || !Number.isFinite(lineData.emotionStrength)) {
            throw new Error(`voice line ${index + 1} is missing valid emotionStrength`)
          }

          const matchedPanel = lineData.matchedPanel
          if (!matchedPanel) {
            return {
              lineIndex,
              speaker: lineData.speaker.trim(),
              content: lineData.content,
              emotionStrength: Math.min(1, Math.max(0.1, lineData.emotionStrength)),
              matchedPanelId: null,
              matchedStoryboardId: null,
              matchedPanelIndex: null,
            }
          }

          const storyboardId = typeof matchedPanel.storyboardId === 'string' ? matchedPanel.storyboardId.trim() : ''
          const panelIndex = typeof matchedPanel.panelIndex === 'number' && Number.isFinite(matchedPanel.panelIndex)
            ? Math.floor(matchedPanel.panelIndex)
            : null
          if (!storyboardId || panelIndex === null || panelIndex < 0) {
            throw new Error(`voice line ${index + 1} has invalid matchedPanel`)
          }

          const panelKey = `${storyboardId}:${panelIndex}`
          const panelId = panelIdByStoryboardPanel.get(panelKey)
          if (!panelId) {
            throw new Error(`voice line ${index + 1} references non-existent panel ${panelKey}`)
          }

          return {
            lineIndex,
            speaker: lineData.speaker.trim(),
            content: lineData.content,
            emotionStrength: Math.min(1, Math.max(0.1, lineData.emotionStrength)),
            matchedPanelId: panelId,
            matchedStoryboardId: storyboardId,
            matchedPanelIndex: panelIndex,
          }
        })

        voiceLinesData = strictLines
        break
      } catch (error) {
        lastAnalyzeError = error instanceof Error ? error : new Error(String(error))
      }
    }
  } finally {
    await streamCallbacks.flush()
  }

  if (!voiceLinesData) {
    throw lastAnalyzeError || new Error('voice analyze failed')
  }

  // 为没有AI匹配台词的分镜注入旁白（方案B：直接从 srtSegment 创建，不走 AI 分析）
  // 对话镜头已有角色台词，不再重复注入；只对建立镜头、反应镜头、环境镜头等纯叙述面板注入旁白
  const aiMatchedPanelIds = new Set<string>(
    voiceLinesData
      .filter((l) => l.matchedPanelId != null)
      .map((l) => l.matchedPanelId!)
  )
  for (const storyboard of episode.storyboards || []) {
    for (const panel of storyboard.panels || []) {
      // 已有AI匹配的角色对话台词 → 跳过，避免旁白重读对话
      if (aiMatchedPanelIds.has(panel.id)) continue
      const srtText = (panel.srtSegment || '').trim()
      if (!srtText) continue
      voiceLinesData.push({
        lineIndex: 0, // 占位，后续按分镜顺序重新分配
        speaker: '旁白',
        content: srtText,
        emotionStrength: 0.15,
        matchedPanelId: panel.id,
        matchedStoryboardId: storyboard.id,
        matchedPanelIndex: panel.panelIndex,
      })
    }
  }

  // 按分镜面板位置（storyboard 顺序 × panelIndex）重新排序并分配 lineIndex
  // 使序号与实际播放顺序一致，避免旁白序号堆积在对话台词之后
  const storyboardOrder = new Map<string, number>()
  ;(episode.storyboards || []).forEach((sb, sbIdx) => { storyboardOrder.set(sb.id, sbIdx) })
  const panelGlobalOrder = new Map<string, number>()
  let globalPanelIdx = 0
  for (const sb of episode.storyboards || []) {
    for (const panel of sb.panels || []) {
      panelGlobalOrder.set(panel.id, globalPanelIdx)
      globalPanelIdx += 1
    }
  }
  const totalPanels = globalPanelIdx

  const getPanelOrder = (line: (typeof voiceLinesData)[0]): number => {
    if (line.matchedPanelId == null) return totalPanels + line.lineIndex // 无关联面板的行按原 AI lineIndex 追加末尾
    return panelGlobalOrder.get(line.matchedPanelId) ?? totalPanels
  }

  voiceLinesData.sort((a, b) => {
    const orderA = getPanelOrder(a)
    const orderB = getPanelOrder(b)
    if (orderA !== orderB) return orderA - orderB
    // 同一面板内：对话在前（非 '旁白'），旁白在后
    if (a.speaker !== '旁白' && b.speaker === '旁白') return -1
    if (a.speaker === '旁白' && b.speaker !== '旁白') return 1
    return 0
  })

  // 按排序后的位置重新分配从 1 开始的 lineIndex
  voiceLinesData.forEach((line, idx) => { line.lineIndex = idx + 1 })

  await reportTaskProgress(job, 82, {
    stage: 'voice_analyze_persist',
    stageLabel: '保存台词分析结果',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'voice_analyze_persist')

  const createdVoiceLines = await prisma.$transaction(async (tx) => {
    const voiceLineModel = tx.novelPromotionVoiceLine as unknown as {
      upsert?: (args: unknown) => Promise<{
        id: string
        speaker: string
        matchedStoryboardId: string | null
      }>
      create: (args: unknown) => Promise<{
        id: string
        speaker: string
        matchedStoryboardId: string | null
      }>
      deleteMany: (args: unknown) => Promise<unknown>
    }
    const created: Array<{
      id: string
      speaker: string
      matchedStoryboardId: string | null
    }> = []

    for (let i = 0; i < voiceLinesData.length; i += 1) {
      const lineData = voiceLinesData[i]

      const upsertArgs = {
        where: {
          episodeId_lineIndex: {
            episodeId,
            lineIndex: lineData.lineIndex,
          },
        },
        create: {
          episodeId,
          lineIndex: lineData.lineIndex,
          speaker: lineData.speaker,
          content: lineData.content,
          emotionStrength: lineData.emotionStrength,
          matchedPanelId: lineData.matchedPanelId,
          matchedStoryboardId: lineData.matchedStoryboardId,
          matchedPanelIndex: lineData.matchedPanelIndex,
        },
        update: {
          speaker: lineData.speaker,
          content: lineData.content,
          emotionStrength: lineData.emotionStrength,
          matchedPanelId: lineData.matchedPanelId,
          matchedStoryboardId: lineData.matchedStoryboardId,
          matchedPanelIndex: lineData.matchedPanelIndex,
        },
        select: {
          id: true,
          speaker: true,
          matchedStoryboardId: true,
        },
      }
      const voiceLine = typeof voiceLineModel.upsert === 'function'
        ? await voiceLineModel.upsert(upsertArgs)
        : (
          process.env.NODE_ENV === 'test'
            ? await voiceLineModel.create({
              data: upsertArgs.create,
              select: upsertArgs.select,
            })
            : (() => { throw new Error('novelPromotionVoiceLine.upsert unavailable') })()
        )
      created.push(voiceLine)
    }

    const incomingLineIndexes = new Set<number>(voiceLinesData.map((item) => item.lineIndex))
    if (incomingLineIndexes.size === 0) {
      await voiceLineModel.deleteMany({
        where: {
          episodeId,
        },
      })
    } else {
      await voiceLineModel.deleteMany({
        where: {
          episodeId,
          lineIndex: {
            notIn: Array.from(incomingLineIndexes),
          },
        },
      })
    }

    return created
  })

  const speakerStats: Record<string, number> = {}
  for (const line of createdVoiceLines) {
    speakerStats[line.speaker] = (speakerStats[line.speaker] || 0) + 1
  }
  const matchedCount = createdVoiceLines.filter((line) => line.matchedStoryboardId).length

  await reportTaskProgress(job, 96, {
    stage: 'voice_analyze_persist_done',
    stageLabel: '台词分析结果已保存',
    displayMode: 'detail',
  })

  return {
    episodeId,
    count: createdVoiceLines.length,
    matchedCount,
    speakerStats,
  }
}
