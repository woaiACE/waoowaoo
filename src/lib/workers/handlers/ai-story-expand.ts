import type { Job } from 'bullmq'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'
import type { TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import { getAiExpandToneInstruction, getAiExpandRewriteInstruction, getAiExpandLengthInstruction, getReaderInstruction } from '@/lib/screenplay-tone-presets'
import { buildCharactersIntroduction } from '@/lib/constants'
import { prisma } from '@/lib/prisma'

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export async function handleAiStoryExpandTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const promptInput = readText(payload.prompt).trim()
  const analysisModel = readText(payload.analysisModel).trim()
  const screenplayTone = readText(payload.screenplayTone).trim()
  const storyRewriteMode = readText(payload.storyRewriteMode).trim()
  const sourceText = readText(payload.sourceText).trim()
  const lengthTarget = readText(payload.lengthTarget).trim()

  if (!promptInput) {
    throw new Error('prompt is required')
  }
  if (!analysisModel) {
    throw new Error('analysisModel is required')
  }

  const toneInstruction = getAiExpandToneInstruction(screenplayTone)
  const rewriteInstruction = getAiExpandRewriteInstruction(storyRewriteMode)
  const lengthInstruction = getAiExpandLengthInstruction(lengthTarget)
  const readerProfile = readText(payload.readerProfile).trim()
  const readerInstruction = getReaderInstruction(readerProfile)
  const sourceTextBlock = sourceText
    ? `## 原始故事文本（请在此基础上进行改写）\n\n${sourceText}`
    : ''

  // 项目上下文注入：若有 projectId，查询项目角色和世界观
  const projectId = readText(payload.projectId).trim()
  let projectContextBlock = ''
  if (projectId && projectId !== 'home-ai-write') {
    try {
      const novelData = await prisma.novelPromotionProject.findUnique({
        where: { projectId },
        include: {
          characters: { select: { name: true, introduction: true } },
        },
      })
      if (novelData) {
        const parts: string[] = []
        const globalAsset = readText(novelData.globalAssetText).trim()
        if (globalAsset) {
          parts.push(`## 项目世界观与背景设定\n\n${globalAsset.slice(0, 800)}`)
        }

        // 合并项目角色和 IP 选角角色
        const allCharacters: Array<{ name: string; introduction?: string | null }> = [
          ...(novelData.characters || []),
        ]
        if (novelData.ipModeEnabled) {
          const ipCastings = await prisma.ipCasting.findMany({
            where: { projectId: novelData.id },
            include: { globalCharacter: true },
            orderBy: { createdAt: 'asc' },
          })
          for (const casting of ipCastings) {
            const char = casting.globalCharacter
            const personality = casting.personalityOverride ?? char.personality ?? ''
            const speakingStyle = casting.speakingStyleOverride ?? char.speakingStyle ?? ''
            const backstory = char.backstory ?? ''
            const castRole = casting.castRole ?? ''
            const ipIntro = [
              castRole ? `在本剧中扮演：${castRole}` : '',
              char.gender ? `性别：${char.gender}` : '',
              char.ageRange ? `年龄段：${char.ageRange}` : '',
              personality ? `性格：${personality}` : '',
              backstory ? `背景：${backstory}` : '',
              speakingStyle ? `说话风格：${speakingStyle}` : '',
            ].filter(Boolean).join('；')
            const existing = allCharacters.find((c) => c.name === char.name)
            if (existing) {
              existing.introduction = [existing.introduction, ipIntro].filter(Boolean).join('\n')
            } else {
              allCharacters.push({ name: char.name, introduction: ipIntro })
            }
          }
        }

        const charIntros = buildCharactersIntroduction(allCharacters)
        if (charIntros && charIntros !== '暂无角色介绍') {
          parts.push(`## 已有角色档案（改写时保持角色名称和性格一致）\n\n${charIntros}`)
        }
        if (parts.length > 0) {
          projectContextBlock = parts.join('\n\n')
        }
      }
    } catch {
      // 静默降级：查询失败不影响改写任务
    }
  }

  const prompt = buildPrompt({
    promptId: PROMPT_IDS.NP_AI_STORY_EXPAND,
    locale: job.data.locale,
    variables: {
      input: promptInput,
      tone_instruction: toneInstruction,
      rewrite_instruction: rewriteInstruction,
      length_instruction: lengthInstruction,
      reader_instruction: readerInstruction,
      source_text_block: sourceTextBlock,
      project_context_block: projectContextBlock,
    },
  })

  await reportTaskProgress(job, 25, {
    stage: 'ai_story_expand_prepare',
    stageLabel: '准备故事扩写参数',
    displayMode: 'loading',
  })
  await assertTaskActive(job, 'ai_story_expand_prepare')

  const streamContext = createWorkerLLMStreamContext(job, 'ai_story_expand')
  const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)

  const completion = await withInternalLLMStreamCallbacks(
    streamCallbacks,
    async () =>
      await executeAiTextStep({
        userId: job.data.userId,
        model: analysisModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        projectId: job.data.projectId || 'home-ai-write',
        action: 'ai_story_expand',
        meta: {
          stepId: 'ai_story_expand',
          stepTitle: '故事扩写',
          stepIndex: 1,
          stepTotal: 1,
        },
      }),
  )
  await streamCallbacks.flush()
  await assertTaskActive(job, 'ai_story_expand_persist')

  const expandedText = completion.text.trim()
  if (!expandedText) {
    throw new Error('AI story expand response is empty')
  }

  await reportTaskProgress(job, 96, {
    stage: 'ai_story_expand_done',
    stageLabel: '故事扩写已完成',
    displayMode: 'loading',
  })

  return {
    expandedText,
  }
}
