import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  novelPromotionEpisode: {
    findUniqueOrThrow: vi.fn(),
  },
  directorScript: {
    upsert: vi.fn(async () => ({ id: 'director-script-1', createdAt: new Date(), updatedAt: new Date() })),
  },
  directorStoryboard: {
    upsert: vi.fn(async () => ({ id: 'director-storyboard-1' })),
  },
  directorShot: {
    deleteMany: vi.fn(async () => ({ count: 0 })),
    createMany: vi.fn(async () => ({ count: 0 })),
  },
  $transaction: vi.fn(),
}))

const aiRuntimeMock = vi.hoisted(() => ({
  executeAiTextStep: vi.fn(),
}))

const configMock = vi.hoisted(() => ({
  getUserWorkflowConcurrencyConfig: vi.fn(async () => ({ analysis: 2 })),
}))

const observeMock = vi.hoisted(() => ({
  withInternalLLMStreamCallbacks: vi.fn(async (_callbacks: unknown, fn: () => Promise<unknown>) => await fn()),
}))

const semanticLogMock = vi.hoisted(() => ({
  logAIAnalysis: vi.fn(),
}))

const sharedMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
}))

const leaseMock = vi.hoisted(() => ({
  assertWorkflowRunActive: vi.fn(async () => undefined),
  withWorkflowRunLease: vi.fn(async (params: { run: () => Promise<unknown> }) => await params.run()),
}))

const runtimeServiceMock = vi.hoisted(() => ({
  createArtifact: vi.fn(async () => undefined),
}))

const promptI18nMock = vi.hoisted(() => ({
  PROMPT_IDS: {
    NP_AGENT_CHARACTER_PROFILE: 'np_agent_character_profile',
    NP_SELECT_LOCATION: 'np_select_location',
    NP_DIRECTOR_SPLIT_SCENES: 'np_director_split_scenes',
    NP_DIRECTOR_SCENE_TO_EVENTS: 'np_director_scene_to_events',
    NP_DIRECTOR_EVENTS_TO_STORYBOARD: 'np_director_events_to_storyboard',
    NP_DIRECTOR_SHOT_IMAGE_PROMPT: 'np_director_shot_image_prompt',
    NP_DIRECTOR_SHOT_VIDEO_PROMPT: 'np_director_shot_video_prompt',
    NP_DIRECTOR_SHOT_SOUND_DESIGN: 'np_director_shot_sound_design',
  },
  getPromptTemplate: vi.fn(() => 'prompt-template'),
}))

const analysisModelMock = vi.hoisted(() => ({
  resolveAnalysisModel: vi.fn(async () => 'llm::analysis-1'),
}))

const llmStreamMock = vi.hoisted(() => ({
  createWorkerLLMStreamContext: vi.fn(() => ({ streamRunId: 'run-1', nextSeqByStepLane: {} })),
  createWorkerLLMStreamCallbacks: vi.fn(() => ({
    flush: vi.fn(async () => undefined),
    onStage: vi.fn(),
    onChunk: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
  })),
}))

const orchestratorMock = vi.hoisted(() => ({
  runDirectorModeOrchestrator: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/ai-runtime', () => aiRuntimeMock)
vi.mock('@/lib/config-service', () => configMock)
vi.mock('@/lib/llm-observe/internal-stream-context', () => observeMock)
vi.mock('@/lib/logging/semantic', () => semanticLogMock)
vi.mock('@/lib/workers/shared', () => sharedMock)
vi.mock('@/lib/run-runtime/workflow-lease', () => leaseMock)
vi.mock('@/lib/run-runtime/service', () => runtimeServiceMock)
vi.mock('@/lib/prompt-i18n', () => promptI18nMock)
vi.mock('@/lib/workers/handlers/resolve-analysis-model', () => analysisModelMock)
vi.mock('@/lib/workers/handlers/llm-stream', () => llmStreamMock)
vi.mock('@/lib/novel-promotion/director-mode/orchestrator', () => orchestratorMock)

import { handleDirectorModeTask } from '@/lib/workers/handlers/director-mode'

function buildJob(payload: Record<string, unknown>, episodeId = 'episode-1'): Job<TaskJobData> {
  return {
    queueName: 'text',
    data: {
      taskId: 'task-director-mode-1',
      type: TASK_TYPE.DIRECTOR_MODE_RUN,
      locale: 'zh',
      projectId: 'project-1',
      episodeId,
      targetType: 'NovelPromotionEpisode',
      targetId: episodeId,
      payload: {
        episodeId,
        runId: 'run-director-1',
        meta: { runId: 'run-director-1' },
        ...payload,
      },
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker director-mode behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => await fn(prismaMock))

    prismaMock.novelPromotionEpisode.findUniqueOrThrow.mockResolvedValue({
      id: 'episode-1',
      novelPromotionProject: {
        analysisModel: 'llm::analysis-1',
        characters: [{ name: '小蓝', introduction: '主角' }],
        locations: [{ name: '教室' }],
        project: { name: 'Project One' },
      },
    })

    orchestratorMock.runDirectorModeOrchestrator.mockResolvedValue({
      characterStep: { text: '', reasoning: '' },
      locationStep: { text: '', reasoning: '' },
      splitStep: { text: '', reasoning: '' },
      charactersObject: { characters: [{ name: '小蓝' }] },
      locationsObject: { locations: [{ name: '教室' }] },
      analyzedCharacters: [{ name: '小蓝' }],
      analyzedLocations: [{ name: '教室' }],
      charactersLibName: '小蓝',
      locationsLibName: '教室',
      charactersIntroduction: '小蓝：主角',
      sceneList: [
        {
          scene_id: 'scene_1',
          scene_number: 1,
          time: '白天',
          location: '教室',
          characters: ['小蓝'],
          start_text: '开头',
          end_text: '结尾',
          content: '教室里开始上课。',
        },
        {
          scene_id: 'scene_2',
          scene_number: 2,
          time: '傍晚',
          location: '走廊',
          characters: ['小蓝'],
          start_text: '下课后',
          end_text: '离开',
          content: '小蓝走出教室。',
        },
      ],
      sceneEventsMap: new Map([
        ['scene_1', {
          scene_id: 'scene_1',
          events: [{ event_number: 1, description: '小蓝坐在座位上。' }],
          dialogues: [],
        }],
        ['scene_2', {
          scene_id: 'scene_2',
          events: [{ event_number: 1, description: '小蓝走出教室。' }],
          dialogues: [],
        }],
      ]),
      sceneStoryboardMap: new Map([
        ['scene_1', {
          scene_id: 'scene_1',
          shots: [{
            shot_number: 1,
            shot_type: '中景',
            camera_angle: '平视',
            camera_movement: '固定',
            subject: '小蓝',
            description: '小蓝坐在教室里听课。',
            from_events: [1],
            voice_line: '无',
            voice_speaker: null,
            duration_hint: '6秒',
          }],
        }],
        ['scene_2', {
          scene_id: 'scene_2',
          shots: [{
            shot_number: 1,
            shot_type: '中景',
            camera_angle: '平视',
            camera_movement: '跟拍',
            subject: '小蓝',
            description: '小蓝走出教室。',
            from_events: [1],
            voice_line: '无',
            voice_speaker: null,
            duration_hint: '5秒',
          }],
        }],
      ]),
      sceneShotDetailsMap: new Map([
        ['scene_1', {
          scene_id: 'scene_1',
          shots: [{
            shot_number: 1,
            global_position: '小蓝位于画面中间偏左，摄影机在前方平视。',
            shot_caption: '旁白-平静:教室里很安静。',
            image_prompt_lt: 'prompt lt',
            image_prompt_rt: 'prompt rt',
            image_prompt_lb: 'prompt lb',
            image_prompt_rb: 'prompt rb',
            video_prompt: 'video prompt',
            sound_effect: 'paper rustling',
            voice_speaker: '旁白',
          }],
        }],
        ['scene_2', {
          scene_id: 'scene_2',
          shots: [{
            shot_number: 1,
            global_position: '小蓝位于画面右侧，摄影机从后方跟拍。',
            shot_caption: '无',
            image_prompt_lt: 'prompt 2 lt',
            image_prompt_rt: 'prompt 2 rt',
            image_prompt_lb: 'prompt 2 lb',
            image_prompt_rb: 'prompt 2 rb',
            video_prompt: 'video prompt 2',
            sound_effect: 'footsteps',
            voice_speaker: '旁白',
          }],
        }],
      ]),
      summary: {
        characterCount: 1,
        locationCount: 1,
        sceneCount: 2,
        totalEvents: 2,
        totalShots: 2,
      },
    })
  })

  it('requires content for the initial run', async () => {
    const job = buildJob({ content: '' })
    await expect(handleDirectorModeTask(job)).rejects.toThrow('content is required for initial run')
  })

  it('persists artifacts and structured DB rows after a successful run', async () => {
    const job = buildJob({ content: '从前，在教室里。' })
    const result = await handleDirectorModeTask(job)

    expect(result).toEqual({
      episodeId: 'episode-1',
      sceneCount: 2,
      characterCount: 1,
      locationCount: 1,
      totalShots: 2,
    })

    expect(runtimeServiceMock.createArtifact).toHaveBeenCalled()
    expect(prismaMock.directorScript.upsert).toHaveBeenCalled()
    expect(prismaMock.directorStoryboard.upsert).toHaveBeenCalled()
    expect(prismaMock.directorShot.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          storyboardId: 'director-storyboard-1',
          shotIndex: 1,
          shotCaption: '旁白-平静:教室里很安静。',
          globalPosition: '小蓝位于画面中间偏左，摄影机在前方平视。',
          videoPrompt: 'video prompt',
          soundEffect: 'paper rustling',
        }),
        expect.objectContaining({
          storyboardId: 'director-storyboard-1',
          shotIndex: 2,
          shotCaption: '无',
          globalPosition: '小蓝位于画面右侧，摄影机从后方跟拍。',
          videoPrompt: 'video prompt 2',
          soundEffect: 'footsteps',
        }),
      ],
    })
  })
})
