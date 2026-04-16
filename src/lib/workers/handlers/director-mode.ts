import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { getUserWorkflowConcurrencyConfig } from '@/lib/config-service'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { logAIAnalysis } from '@/lib/logging/semantic'
import { TaskTerminatedError } from '@/lib/task/errors'
import type { TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertWorkflowRunActive, withWorkflowRunLease } from '@/lib/run-runtime/workflow-lease'
import { createArtifact } from '@/lib/run-runtime/service'
import { getPromptTemplate, PROMPT_IDS } from '@/lib/prompt-i18n'
import { resolveAnalysisModel } from './resolve-analysis-model'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import {
  runDirectorModeOrchestrator,
  type DirectorStepMeta,
  type DirectorOrchestratorResult,
} from '@/lib/novel-promotion/director-mode/orchestrator'

type AnyObj = Record<string, unknown>

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function parseEffort(value: unknown): 'low' | 'medium' | 'high' | undefined {
  if (value === 'low' || value === 'medium' || value === 'high') return value
  return undefined
}

function parseTemperature(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

function buildWorkflowWorkerId(job: Job<TaskJobData>, label: string) {
  return `${label}:${job.queueName}:${job.data.taskId}`
}

function toJsonText(value: unknown) {
  return JSON.stringify(value)
}

async function persistDirectorResultsToDb(params: {
  episodeId: string
  result: DirectorOrchestratorResult
}) {
  const { episodeId, result } = params

  const storyboardScenes = result.sceneList.map((scene) => ({
    ...scene,
    events: result.sceneEventsMap.get(scene.scene_id)?.events || [],
    dialogues: result.sceneEventsMap.get(scene.scene_id)?.dialogues || [],
    storyboard: result.sceneStoryboardMap.get(scene.scene_id)?.shots || [],
    shotDetails: result.sceneShotDetailsMap.get(scene.scene_id)?.shots || [],
  }))

  let nextShotIndex = 1
  const flatShots = storyboardScenes.flatMap((scene) => {
    const storyboardShots = Array.isArray(scene.storyboard) ? scene.storyboard : []
    const shotDetails = Array.isArray(scene.shotDetails) ? scene.shotDetails : []
    const shotDetailMap = new Map(
      shotDetails.map((item) => [typeof item?.shot_number === 'number' ? item.shot_number : 0, item]),
    )

    return storyboardShots.map((shot, index) => {
      const detail = shotDetailMap.get(typeof shot?.shot_number === 'number' ? shot.shot_number : index + 1)
      const sequenceIndex = nextShotIndex++
      return {
        shotIndex: sequenceIndex,
        shotCaption: typeof detail?.shot_caption === 'string' ? detail.shot_caption : (typeof shot?.voice_line === 'string' ? shot.voice_line : null),
        globalPosition: typeof detail?.global_position === 'string' ? detail.global_position : null,
        imagePromptLT: typeof detail?.image_prompt_lt === 'string' ? detail.image_prompt_lt : null,
        imagePromptRT: typeof detail?.image_prompt_rt === 'string' ? detail.image_prompt_rt : null,
        imagePromptLB: typeof detail?.image_prompt_lb === 'string' ? detail.image_prompt_lb : null,
        imagePromptRB: typeof detail?.image_prompt_rb === 'string' ? detail.image_prompt_rb : null,
        videoPrompt: typeof detail?.video_prompt === 'string' ? detail.video_prompt : null,
        shotType: typeof shot?.shot_type === 'string' ? shot.shot_type : null,
        voiceSpeaker: typeof detail?.voice_speaker === 'string'
          ? detail.voice_speaker
          : (typeof shot?.voice_speaker === 'string' ? shot.voice_speaker : null),
        soundEffect: typeof detail?.sound_effect === 'string' ? detail.sound_effect : null,
      }
    })
  })

  await prisma.$transaction(async (tx) => {
    const script = await tx.directorScript.upsert({
      where: { episodeId },
      create: {
        episodeId,
        sceneCount: result.summary.sceneCount,
        scriptJson: toJsonText({
          scenes: result.sceneList,
          summary: result.summary,
        }),
        characterInfo: toJsonText({
          characters: result.analyzedCharacters,
          introduction: result.charactersIntroduction,
          library: result.charactersLibName,
        }),
        locationInfo: toJsonText({
          locations: result.analyzedLocations,
          library: result.locationsLibName,
        }),
      },
      update: {
        sceneCount: result.summary.sceneCount,
        scriptJson: toJsonText({
          scenes: result.sceneList,
          summary: result.summary,
        }),
        characterInfo: toJsonText({
          characters: result.analyzedCharacters,
          introduction: result.charactersIntroduction,
          library: result.charactersLibName,
        }),
        locationInfo: toJsonText({
          locations: result.analyzedLocations,
          library: result.locationsLibName,
        }),
      },
    })

    const storyboard = await tx.directorStoryboard.upsert({
      where: { scriptId: script.id },
      create: {
        scriptId: script.id,
        shotCount: result.summary.totalShots,
        storyboardJson: toJsonText({
          scenes: storyboardScenes,
          summary: result.summary,
        }),
      },
      update: {
        shotCount: result.summary.totalShots,
        storyboardJson: toJsonText({
          scenes: storyboardScenes,
          summary: result.summary,
        }),
      },
    })

    await tx.directorShot.deleteMany({
      where: { storyboardId: storyboard.id },
    })

    if (flatShots.length > 0) {
      await tx.directorShot.createMany({
        data: flatShots.map((shot) => ({
          storyboardId: storyboard.id,
          ...shot,
        })),
      })
    }
  })
}

export async function handleDirectorModeTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const projectId = job.data.projectId
  const episodeId = asString(payload.episodeId || job.data.episodeId || '').trim()
  const content = asString(payload.content).trim()
  const retryStepKey = asString(payload.retryStepKey).trim()
  const reasoning = payload.reasoning !== false
  const requestedReasoningEffort = parseEffort(payload.reasoningEffort)
  const temperature = parseTemperature(payload.temperature)

  if (!episodeId) {
    throw new Error('episodeId is required')
  }
  if (!content && !retryStepKey) {
    throw new Error('content is required for initial run')
  }

  const episode = await prisma.novelPromotionEpisode.findUniqueOrThrow({
    where: { id: episodeId },
    include: {
      novelPromotionProject: {
        include: { characters: true, locations: true, project: { select: { name: true } } },
      },
    },
  })

  const project = episode.novelPromotionProject
  const model = await resolveAnalysisModel({
    userId: job.data.userId,
    inputModel: asString(payload.model).trim(),
    projectAnalysisModel: project.analysisModel,
  })
  const reasoningEffort = requestedReasoningEffort || 'medium'
  const projectName = project.project?.name || projectId

  const workflowConcurrency = await getUserWorkflowConcurrencyConfig(job.data.userId)

  // Load prompt templates
  const characterPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_AGENT_CHARACTER_PROFILE, job.data.locale)
  const locationPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_SELECT_LOCATION, job.data.locale)
  const splitScenesPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_DIRECTOR_SPLIT_SCENES, job.data.locale)
  const sceneToEventsPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_DIRECTOR_SCENE_TO_EVENTS, job.data.locale)
  const eventsToStoryboardPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_DIRECTOR_EVENTS_TO_STORYBOARD, job.data.locale)
  const shotImagePromptTemplate = getPromptTemplate(PROMPT_IDS.NP_DIRECTOR_SHOT_IMAGE_PROMPT, job.data.locale)
  const shotVideoPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_DIRECTOR_SHOT_VIDEO_PROMPT, job.data.locale)
  const shotSoundDesignTemplate = getPromptTemplate(PROMPT_IDS.NP_DIRECTOR_SHOT_SOUND_DESIGN, job.data.locale)

  const maxLength = 30000
  const inputContent = content.length > maxLength ? content.slice(0, maxLength) : content

  const payloadMeta = typeof payload.meta === 'object' && payload.meta !== null
    ? (payload.meta as AnyObj)
    : {}
  const runId = typeof payload.runId === 'string' && payload.runId.trim()
    ? payload.runId.trim()
    : (typeof payloadMeta.runId === 'string' ? payloadMeta.runId.trim() : '')
  if (!runId) {
    throw new Error('runId is required for director_mode pipeline')
  }

  const workerId = buildWorkflowWorkerId(job, 'director_mode')
  const assertRunActive = async (stage: string) => {
    await assertWorkflowRunActive({ runId, workerId, stage })
  }

  const streamContext = createWorkerLLMStreamContext(job, 'director_mode')
  const callbacks = createWorkerLLMStreamCallbacks(job, streamContext, {
    assertActive: async (stage) => {
      await assertRunActive(stage)
    },
    isActive: async () => {
      try {
        await assertRunActive('worker_llm_stream_probe')
        return true
      } catch (error) {
        if (error instanceof TaskTerminatedError) return false
        throw error
      }
    },
  })

  const runStep = async (
    meta: DirectorStepMeta,
    prompt: string,
    action: string,
    _maxOutputTokens: number,
  ) => {
    void _maxOutputTokens
    const stepAttempt = meta.stepAttempt || 1
    await assertRunActive(`director_mode_step:${meta.stepId}`)

    const progress = 15 + Math.min(55, Math.floor((meta.stepIndex / Math.max(1, meta.stepTotal)) * 55))
    await reportTaskProgress(job, progress, {
      stage: 'director_mode_step',
      stageLabel: 'progress.stage.directorModeStep',
      displayMode: 'detail',
      message: meta.stepTitle,
      stepId: meta.stepId,
      stepAttempt,
      stepTitle: meta.stepTitle,
      stepIndex: meta.stepIndex,
      stepTotal: meta.stepTotal,
      dependsOn: Array.isArray(meta.dependsOn) ? meta.dependsOn : [],
      groupId: meta.groupId || null,
      parallelKey: meta.parallelKey || null,
      retryable: meta.retryable !== false,
      blockedBy: Array.isArray(meta.blockedBy) ? meta.blockedBy : [],
    })

    logAIAnalysis(job.data.userId, 'worker', projectId, projectName, {
      action: `DIRECTOR_MODE_PROMPT:${action}`,
      input: { stepId: meta.stepId, stepTitle: meta.stepTitle, prompt },
      model,
    })

    const output = await executeAiTextStep({
      userId: job.data.userId,
      model,
      messages: [{ role: 'user', content: prompt }],
      projectId,
      action,
      meta: { ...meta, stepAttempt },
      temperature,
      reasoning,
      reasoningEffort,
    })
    await callbacks.flush()

    logAIAnalysis(job.data.userId, 'worker', projectId, projectName, {
      action: `DIRECTOR_MODE_OUTPUT:${action}`,
      output: {
        stepId: meta.stepId,
        stepTitle: meta.stepTitle,
        rawText: output.text,
        textLength: output.text.length,
        reasoningLength: output.reasoning.length,
      },
      model,
    })

    return { text: output.text, reasoning: output.reasoning }
  }

  // Build base character introductions
  const baseCharacterIntroductions = (project.characters || []).map((item) => ({
    name: item.name,
    introduction: (item as unknown as AnyObj).introduction as string || '',
  }))

  // Build character/location descriptions for P3/P4
  const baseCharacterDescriptions = (project.characters || []).map((item) => {
    const raw = item as unknown as AnyObj
    return {
      name: item.name,
      description: (raw.description as string) || null,
      ageGender: (raw.ageGender as string) || (raw.age_gender as string) || null,
      voiceConfig: (raw.voiceConfig as string) || (raw.voice_config as string) || null,
    }
  })

  const baseLocationDescriptions = (project.locations || []).map((item) => {
    const raw = item as unknown as AnyObj
    return {
      name: item.name,
      description: (raw.description as string) || null,
    }
  })

  const leaseResult = await withWorkflowRunLease({
    runId,
    userId: job.data.userId,
    workerId,
    run: async () => {
      await reportTaskProgress(job, 10, {
        stage: 'director_mode_prepare',
        stageLabel: 'progress.stage.directorModePrepare',
        displayMode: 'detail',
      })

      const result: DirectorOrchestratorResult = await (async () => {
        try {
          return await withInternalLLMStreamCallbacks(
            callbacks,
            async () => await runDirectorModeOrchestrator({
              concurrency: workflowConcurrency.analysis,
              content: inputContent,
              baseCharacters: baseCharacterIntroductions.map((item) => item.name),
              baseLocations: (project.locations || []).map((item) => item.name),
              baseCharacterIntroductions,
              baseCharacterDescriptions,
              baseLocationDescriptions,
              promptTemplates: {
                characterPromptTemplate,
                locationPromptTemplate,
                splitScenesPromptTemplate,
                sceneToEventsPromptTemplate,
                eventsToStoryboardPromptTemplate,
                shotImagePromptTemplate,
                shotVideoPromptTemplate,
                shotSoundDesignTemplate,
              },
              runStep,
              onLog: (message) => {
                logAIAnalysis(job.data.userId, 'worker', projectId, projectName, {
                  action: 'DIRECTOR_MODE_LOG',
                  output: { message },
                  model,
                })
              },
            }),
          )
        } finally {
          await callbacks.flush()
        }
      })()

      // Persist artifacts
      await createArtifact({
        runId,
        stepKey: 'analyze_characters',
        artifactType: 'analysis.characters',
        refId: episodeId,
        payload: {
          characters: result.analyzedCharacters,
          raw: result.charactersObject,
        },
      })
      await createArtifact({
        runId,
        stepKey: 'analyze_locations',
        artifactType: 'analysis.locations',
        refId: episodeId,
        payload: {
          locations: result.analyzedLocations,
          raw: result.locationsObject,
        },
      })
      await createArtifact({
        runId,
        stepKey: 'split_scenes',
        artifactType: 'director.scenes.split',
        refId: episodeId,
        payload: {
          sceneList: result.sceneList,
          charactersLibName: result.charactersLibName,
          locationsLibName: result.locationsLibName,
          charactersIntroduction: result.charactersIntroduction,
        },
      })

      // Persist per-scene events artifacts
      for (const scene of result.sceneList) {
        const events = result.sceneEventsMap.get(scene.scene_id)
        if (events) {
          await createArtifact({
            runId,
            stepKey: `scene_${scene.scene_id}_events`,
            artifactType: 'director.scene.events',
            refId: scene.scene_id,
            payload: events,
          })
        }
      }

      // Persist per-scene storyboard artifacts
      for (const scene of result.sceneList) {
        const storyboard = result.sceneStoryboardMap.get(scene.scene_id)
        if (storyboard) {
          await createArtifact({
            runId,
            stepKey: `scene_${scene.scene_id}_storyboard`,
            artifactType: 'director.scene.storyboard',
            refId: scene.scene_id,
            payload: storyboard,
          })
        }
      }

      // Persist per-scene shot detail artifacts
      for (const scene of result.sceneList) {
        const shotDetails = result.sceneShotDetailsMap.get(scene.scene_id)
        if (shotDetails) {
          await createArtifact({
            runId,
            stepKey: `scene_${scene.scene_id}_shot_detail`,
            artifactType: 'director.scene.shot_detail',
            refId: scene.scene_id,
            payload: shotDetails,
          })
        }
      }

      try {
        await persistDirectorResultsToDb({
          episodeId,
          result,
        })
      } catch (error) {
        logAIAnalysis(job.data.userId, 'worker', projectId, projectName, {
          action: 'DIRECTOR_MODE_DB_PERSIST_WARNING',
          output: {
            episodeId,
            message: error instanceof Error ? error.message : 'unknown persist error',
          },
          model,
        })
      }

      await reportTaskProgress(job, 90, {
        stage: 'director_mode_shots_done',
        stageLabel: 'progress.stage.directorModeShotsDone',
        displayMode: 'detail',
        message: `全部完成：${result.summary.sceneCount} 场次、${result.summary.totalEvents} 事件、${result.summary.totalShots} 镜头`,
      })

      await reportTaskProgress(job, 100, {
        stage: 'director_mode_completed',
        stageLabel: 'progress.stage.directorModeCompleted',
        displayMode: 'detail',
      })

      return {
        episodeId,
        sceneCount: result.summary.sceneCount,
        characterCount: result.summary.characterCount,
        locationCount: result.summary.locationCount,
        totalShots: result.summary.totalShots,
      }
    },
  })

  return leaseResult
}
