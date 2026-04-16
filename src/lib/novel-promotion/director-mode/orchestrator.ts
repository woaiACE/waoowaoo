import { safeParseJsonObject } from '@/lib/json-repair'
import { normalizeAnyError } from '@/lib/errors/normalize'
import { createScopedLogger } from '@/lib/logging/core'
import { mapWithConcurrency } from '@/lib/async/map-with-concurrency'
import {
  DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY,
  normalizeWorkflowConcurrencyValue,
} from '@/lib/workflow-concurrency'

// ── Types ──

export type DirectorStepMeta = {
  stepId: string
  stepAttempt?: number
  stepTitle: string
  stepIndex: number
  stepTotal: number
  dependsOn?: string[]
  groupId?: string
  parallelKey?: string
  retryable?: boolean
  blockedBy?: string[]
}

export type DirectorStepOutput = {
  text: string
  reasoning: string
}

export type DirectorScene = {
  scene_id: string
  scene_number: number
  time: string
  location: string
  characters: string[]
  start_text: string
  end_text: string
  content: string
}

export type DirectorSceneEvent = {
  event_number: number
  description: string
}

export type DirectorSceneDialogue = {
  after_event: number
  speaker: string
  line: string
}

export type DirectorSceneEvents = {
  scene_id: string
  events: DirectorSceneEvent[]
  dialogues: DirectorSceneDialogue[]
}

export type DirectorStoryboardShot = {
  shot_number: number
  shot_type: string
  camera_angle: string
  camera_movement: string
  subject: string
  description: string
  from_events: number[]
  voice_line: string | null
  voice_speaker: string | null
  duration_hint: string
}

export type DirectorSceneStoryboard = {
  scene_id: string
  shots: DirectorStoryboardShot[]
}

export type DirectorShotImagePrompts = {
  shot_number: number
  image_prompt_lt: string
  image_prompt_rt: string
  image_prompt_lb: string
  image_prompt_rb: string
}

export type DirectorShotVideoPrompt = {
  shot_number: number
  video_prompt: string
}

export type DirectorShotSoundDesign = {
  shot_number: number
  sound_effect: string
  voice_speaker: string | null
}

export type DirectorShotDetail = {
  shot_number: number
  image_prompt_lt: string
  image_prompt_rt: string
  image_prompt_lb: string
  image_prompt_rb: string
  video_prompt: string
  sound_effect: string
  voice_speaker: string | null
}

export type DirectorSceneShotDetails = {
  scene_id: string
  shots: DirectorShotDetail[]
}

export type DirectorPromptTemplates = {
  characterPromptTemplate: string
  locationPromptTemplate: string
  splitScenesPromptTemplate: string
  sceneToEventsPromptTemplate: string
  eventsToStoryboardPromptTemplate: string
  shotImagePromptTemplate: string
  shotVideoPromptTemplate: string
  shotSoundDesignTemplate: string
}

export type DirectorOrchestratorInput = {
  concurrency?: number
  content: string
  baseCharacters: string[]
  baseLocations: string[]
  baseCharacterIntroductions: Array<{ name: string; introduction?: string | null }>
  baseCharacterDescriptions: Array<{ name: string; description?: string | null; ageGender?: string | null; voiceConfig?: string | null }>
  baseLocationDescriptions: Array<{ name: string; description?: string | null }>
  promptTemplates: DirectorPromptTemplates
  runStep: (
    meta: DirectorStepMeta,
    prompt: string,
    action: string,
    maxOutputTokens: number,
  ) => Promise<DirectorStepOutput>
  onStepError?: (meta: DirectorStepMeta, message: string) => void
  onLog?: (message: string, details?: Record<string, unknown>) => void
}

export type DirectorOrchestratorResult = {
  characterStep: DirectorStepOutput
  locationStep: DirectorStepOutput
  splitStep: DirectorStepOutput
  charactersObject: Record<string, unknown>
  locationsObject: Record<string, unknown>
  analyzedCharacters: Record<string, unknown>[]
  analyzedLocations: Record<string, unknown>[]
  charactersLibName: string
  locationsLibName: string
  charactersIntroduction: string
  sceneList: DirectorScene[]
  sceneEventsMap: Map<string, DirectorSceneEvents>
  sceneStoryboardMap: Map<string, DirectorSceneStoryboard>
  sceneShotDetailsMap: Map<string, DirectorSceneShotDetails>
  summary: {
    characterCount: number
    locationCount: number
    sceneCount: number
    totalEvents: number
    totalShots: number
  }
}

// ── Helpers ──

const orchestratorLogger = createScopedLogger({ module: 'worker.orchestrator.director_mode' })

function applyTemplate(template: string, replacements: Record<string, string>) {
  let next = template
  for (const [key, value] of Object.entries(replacements)) {
    next = next.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }
  return next
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toObjectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function extractAnalyzedCharacters(obj: Record<string, unknown>): Record<string, unknown>[] {
  const primary = toObjectArray(obj.characters)
  if (primary.length > 0) return primary
  return toObjectArray(obj.new_characters)
}

function extractAnalyzedLocations(obj: Record<string, unknown>): Record<string, unknown>[] {
  return toObjectArray(obj.locations)
}

function buildCharactersIntroductionText(
  introductions: Array<{ name: string; introduction?: string | null }>,
): string {
  if (introductions.length === 0) return '暂无角色介绍'
  return introductions
    .map((item, i) => {
      const intro = item.introduction || '暂无介绍'
      return `${i + 1}. ${item.name}：${intro}`
    })
    .join('\n')
}

// ── Retry logic ──

const MAX_STEP_ATTEMPTS = 3
const MAX_RETRY_DELAY_MS = 10_000

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function computeRetryDelayMs(attempt: number) {
  const base = Math.min(1_000 * Math.pow(2, Math.max(0, attempt - 1)), MAX_RETRY_DELAY_MS)
  const jitter = Math.floor(Math.random() * 300)
  return base + jitter
}

function isRecoverableJsonParseError(error: unknown, normalizedMessage: string): boolean {
  if (normalizedMessage.includes('ark responses 调用失败')) return false
  if (normalizedMessage.includes('invalidparameter')) return false
  if (error instanceof SyntaxError) return true
  return normalizedMessage.includes('unexpected token')
    || normalizedMessage.includes('unexpected end of json input')
    || normalizedMessage.includes('json format invalid')
}

async function runStepWithRetry<T>(
  runStep: DirectorOrchestratorInput['runStep'],
  baseMeta: DirectorStepMeta,
  prompt: string,
  action: string,
  maxOutputTokens: number,
  parse: (text: string) => T,
): Promise<{ output: DirectorStepOutput; parsed: T }> {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= MAX_STEP_ATTEMPTS; attempt++) {
    const meta = attempt === 1
      ? baseMeta
      : { ...baseMeta, stepAttempt: attempt }
    try {
      const output = await runStep(meta, prompt, action, maxOutputTokens)
      const parsed = parse(output.text)
      return { output, parsed }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      const normalizedError = normalizeAnyError(error, { context: 'worker' })
      const lowerMessage = normalizedError.message.toLowerCase()
      const shouldRetry = attempt < MAX_STEP_ATTEMPTS
        && (normalizedError.retryable || isRecoverableJsonParseError(error, lowerMessage))

      orchestratorLogger.error({
        action: 'orchestrator.step.retry',
        message: shouldRetry ? 'step failed, retrying' : 'step failed, no more retry',
        errorCode: normalizedError.code,
        retryable: normalizedError.retryable,
        details: { stepId: baseMeta.stepId, action, attempt, maxAttempts: MAX_STEP_ATTEMPTS },
        error: { name: lastError.name, message: lastError.message, stack: lastError.stack },
      })
      if (!shouldRetry) break
      await wait(computeRetryDelayMs(attempt))
    }
  }
  throw lastError!
}

// ── Scene parsing ──

function parseSceneStoryboard(responseText: string): DirectorSceneStoryboard {
  const obj = safeParseJsonObject(responseText)
  const sceneId = asString(obj.scene_id)
  const rawShots = toObjectArray(obj.shots)
  if (rawShots.length === 0) {
    throw new Error('events_to_storyboard returned empty shots array')
  }
  const shots: DirectorStoryboardShot[] = rawShots.map((item, index) => ({
    shot_number: typeof item.shot_number === 'number' ? item.shot_number : index + 1,
    shot_type: asString(item.shot_type),
    camera_angle: asString(item.camera_angle),
    camera_movement: asString(item.camera_movement),
    subject: asString(item.subject),
    description: asString(item.description),
    from_events: Array.isArray(item.from_events) ? item.from_events.filter((n): n is number => typeof n === 'number') : [],
    voice_line: item.voice_line != null ? asString(item.voice_line) : null,
    voice_speaker: item.voice_speaker != null ? asString(item.voice_speaker) : null,
    duration_hint: asString(item.duration_hint) || '2s',
  }))
  return { scene_id: sceneId, shots }
}

function parseShotImagePrompts(responseText: string): DirectorShotImagePrompts[] {
  const obj = safeParseJsonObject(responseText)
  const rawShots = toObjectArray(obj.shots)
  return rawShots.map((item, index) => ({
    shot_number: typeof item.shot_number === 'number' ? item.shot_number : index + 1,
    image_prompt_lt: asString(item.image_prompt_lt),
    image_prompt_rt: asString(item.image_prompt_rt),
    image_prompt_lb: asString(item.image_prompt_lb),
    image_prompt_rb: asString(item.image_prompt_rb),
  }))
}

function parseShotVideoPrompts(responseText: string): DirectorShotVideoPrompt[] {
  const obj = safeParseJsonObject(responseText)
  const rawShots = toObjectArray(obj.shots)
  return rawShots.map((item, index) => ({
    shot_number: typeof item.shot_number === 'number' ? item.shot_number : index + 1,
    video_prompt: asString(item.video_prompt),
  }))
}

function parseShotSoundDesigns(responseText: string): DirectorShotSoundDesign[] {
  const obj = safeParseJsonObject(responseText)
  const rawShots = toObjectArray(obj.shots)
  return rawShots.map((item, index) => ({
    shot_number: typeof item.shot_number === 'number' ? item.shot_number : index + 1,
    sound_effect: asString(item.sound_effect),
    voice_speaker: item.voice_speaker != null ? asString(item.voice_speaker) : null,
  }))
}

function parseSceneEvents(responseText: string): DirectorSceneEvents {
  const obj = safeParseJsonObject(responseText)
  const sceneId = asString(obj.scene_id)
  const rawEvents = toObjectArray(obj.events)
  if (rawEvents.length === 0) {
    throw new Error('scene_to_events returned empty events array')
  }
  const events: DirectorSceneEvent[] = rawEvents.map((item, index) => ({
    event_number: typeof item.event_number === 'number' ? item.event_number : index + 1,
    description: asString(item.description),
  }))
  const rawDialogues = toObjectArray(obj.dialogues)
  const dialogues: DirectorSceneDialogue[] = rawDialogues.map((item) => ({
    after_event: typeof item.after_event === 'number' ? item.after_event : 0,
    speaker: asString(item.speaker),
    line: asString(item.line),
  }))
  return { scene_id: sceneId, events, dialogues }
}

function parseSceneList(responseText: string): DirectorScene[] {
  const obj = safeParseJsonObject(responseText)
  const raw = toObjectArray(obj.scenes)
  if (raw.length === 0) {
    throw new Error('split_scenes returned empty scenes array')
  }
  return raw.map((item, index) => ({
    scene_id: asString(item.scene_id) || `scene_${index + 1}`,
    scene_number: typeof item.scene_number === 'number' ? item.scene_number : index + 1,
    time: asString(item.time) || '白天',
    location: asString(item.location) || '未知场景',
    characters: toStringArray(item.characters),
    start_text: asString(item.start_text),
    end_text: asString(item.end_text),
    content: asString(item.content),
  }))
}

// ── Main orchestrator ──

export async function runDirectorModeOrchestrator(
  input: DirectorOrchestratorInput,
): Promise<DirectorOrchestratorResult> {
  const {
    concurrency: rawConcurrency,
    content,
    baseCharacters,
    baseLocations,
    baseCharacterIntroductions,
    baseCharacterDescriptions,
    baseLocationDescriptions,
    promptTemplates,
    runStep,
    onLog,
  } = input

  const concurrency = normalizeWorkflowConcurrencyValue(
    rawConcurrency,
    DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY,
  )

  const baseCharactersText = baseCharacters.length > 0 ? baseCharacters.join('、') : '无'
  const baseLocationsText = baseLocations.length > 0 ? baseLocations.join('、') : '无'
  const baseCharacterInfo = baseCharacterIntroductions.length > 0
    ? baseCharacterIntroductions.map((item, index) => {
        const introLine = item.introduction
          ? `\n   介绍：${item.introduction}`
          : `\n   介绍：（暂无）`
        return `${index + 1}. ${item.name}${introLine}`
      }).join('\n\n')
    : '暂无已有角色'

  // ── Step total calculation ──
  // analyze_characters(1) + analyze_locations(1) + split_scenes(1) = 3 base steps
  // + N scene_to_events steps (one per scene, counted after split)
  // We use a mutable ref so parallel tasks see the updated total once scenes are known.
  let stepTotal = 3

  // ── Stage 0: Parallel analysis (reuse existing character/location analysis) ──
  onLog?.('导演模式 - 步骤1：角色/场景分析（并行）')

  const characterPrompt = applyTemplate(promptTemplates.characterPromptTemplate, {
    input: content,
    characters_lib_name: baseCharactersText,
    characters_lib_info: baseCharacterInfo,
  })
  const locationPrompt = applyTemplate(promptTemplates.locationPromptTemplate, {
    input: content,
    locations_lib_name: baseLocationsText,
  })

  const analysisResults = await mapWithConcurrency(
    [
      () => runStepWithRetry(
        runStep,
        {
          stepId: 'analyze_characters',
          stepTitle: 'progress.streamStep.analyzeCharacters',
          stepIndex: 1,
          stepTotal,
          groupId: 'analysis',
          parallelKey: 'characters',
          retryable: true,
        },
        characterPrompt,
        'analyze_characters',
        2200,
        safeParseJsonObject,
      ),
      () => runStepWithRetry(
        runStep,
        {
          stepId: 'analyze_locations',
          stepTitle: 'progress.streamStep.analyzeLocations',
          stepIndex: 2,
          stepTotal,
          groupId: 'analysis',
          parallelKey: 'locations',
          retryable: true,
        },
        locationPrompt,
        'analyze_locations',
        2200,
        safeParseJsonObject,
      ),
    ],
    concurrency,
    async (run) => await run(),
  )

  const { output: characterStep, parsed: charactersObject } = analysisResults[0]
  const { output: locationStep, parsed: locationsObject } = analysisResults[1]

  const analyzedCharacters = extractAnalyzedCharacters(charactersObject)
  const analyzedLocations = extractAnalyzedLocations(locationsObject)

  const analyzedCharacterNames = analyzedCharacters
    .map((item) => asString(item.name).trim())
    .filter(Boolean)
  const analyzedLocationNames = analyzedLocations
    .map((item) => asString(item.name).trim())
    .filter(Boolean)

  // Merge discovered characters with existing library
  const analyzedCharacterNameSet = new Set(analyzedCharacterNames)
  const mergedCharacterNames = [
    ...analyzedCharacterNames,
    ...baseCharacters.filter((name) => !analyzedCharacterNameSet.has(name)),
  ]
  const charactersLibName = mergedCharacterNames.length > 0
    ? mergedCharacterNames.join('、')
    : baseCharactersText

  const locationsLibName = analyzedLocationNames.length > 0
    ? analyzedLocationNames.join('、')
    : baseLocationsText

  // Build characters introduction from analyzed + base data
  const charactersIntroduction = buildCharactersIntroductionText(
    analyzedCharacters.map((ch) => ({
      name: asString(ch.name),
      introduction: asString(ch.introduction) || null,
    })),
  )

  // ── Stage 1: Split scenes ──
  onLog?.('导演模式 - 步骤2：场次切分')

  const splitScenesPrompt = applyTemplate(promptTemplates.splitScenesPromptTemplate, {
    input: content,
    characters_lib_name: charactersLibName,
    locations_lib_name: locationsLibName,
    characters_introduction: charactersIntroduction,
  })

  const { output: splitStep, parsed: sceneList } = await runStepWithRetry(
    runStep,
    {
      stepId: 'split_scenes',
      stepTitle: 'progress.streamStep.splitScenes',
      stepIndex: 3,
      stepTotal,
      dependsOn: ['analyze_characters', 'analyze_locations'],
      retryable: true,
    },
    splitScenesPrompt,
    'split_scenes',
    3000,
    parseSceneList,
  )

  onLog?.(`导演模式 - 场次切分完成，共 ${sceneList.length} 个场次`)

  // Update step total: 3 base + N events + N storyboard + N shot_detail = 3 + 3N
  stepTotal = 3 + sceneList.length * 3

  // ── Stage 2: Per-scene event extraction (parallel) ──
  onLog?.(`导演模式 - 步骤3：场次事件拆解（${sceneList.length} 个场次并行）`)

  const sceneEventsResults = await mapWithConcurrency(
    sceneList,
    concurrency,
    async (scene, index) => {
      const scenePrompt = applyTemplate(promptTemplates.sceneToEventsPromptTemplate, {
        scene_content: scene.content,
        scene_time: scene.time,
        scene_location: scene.location,
        scene_characters: scene.characters.join('、'),
        scene_id: scene.scene_id,
        characters_lib_name: charactersLibName,
        locations_lib_name: locationsLibName,
        characters_introduction: charactersIntroduction,
      })

      const { parsed } = await runStepWithRetry(
        runStep,
        {
          stepId: `scene_${scene.scene_id}_events`,
          stepTitle: 'progress.streamStep.sceneToEvents',
          stepIndex: 4 + index,
          stepTotal,
          dependsOn: ['split_scenes'],
          groupId: 'scene_to_events',
          parallelKey: scene.scene_id,
          retryable: true,
        },
        scenePrompt,
        'scene_to_events',
        3000,
        parseSceneEvents,
      )

      // Ensure scene_id is consistent
      if (!parsed.scene_id) {
        parsed.scene_id = scene.scene_id
      }

      return parsed
    },
  )

  const sceneEventsMap = new Map<string, DirectorSceneEvents>()
  let totalEvents = 0
  for (const eventsResult of sceneEventsResults) {
    sceneEventsMap.set(eventsResult.scene_id, eventsResult)
    totalEvents += eventsResult.events.length
  }

  onLog?.(`导演模式 - 事件拆解完成，共 ${totalEvents} 个事件`)

  // ── Build description strings for P3/P4 ──
  const charactersFullDescription = baseCharacterDescriptions.length > 0
    ? baseCharacterDescriptions.map((ch, i) => {
        const desc = ch.description || '暂无描述'
        return `${i + 1}. ${ch.name}：${desc}`
      }).join('\n')
    : '暂无角色描述'

  const locationsDescription = baseLocationDescriptions.length > 0
    ? baseLocationDescriptions.map((loc, i) => {
        const desc = loc.description || '暂无描述'
        return `${i + 1}. ${loc.name}：${desc}`
      }).join('\n')
    : '暂无场景描述'

  const charactersAgeGender = baseCharacterDescriptions.length > 0
    ? baseCharacterDescriptions.map((ch, i) => {
        const ag = ch.ageGender || '未知'
        return `${i + 1}. ${ch.name}：${ag}`
      }).join('\n')
    : '暂无信息'

  const charactersVoiceConfig = baseCharacterDescriptions.length > 0
    ? baseCharacterDescriptions.map((ch, i) => {
        const vc = ch.voiceConfig || '默认'
        return `${i + 1}. ${ch.name}：${vc}`
      }).join('\n')
    : '暂无配置'

  // ── Stage 3: Per-scene storyboard generation (parallel) ──
  onLog?.(`导演模式 - 步骤4：分镜生成（${sceneList.length} 个场次并行）`)

  const storyboardBaseIndex = 4 + sceneList.length
  const sceneStoryboardResults = await mapWithConcurrency(
    sceneList,
    concurrency,
    async (scene, index) => {
      const events = sceneEventsMap.get(scene.scene_id)
      if (!events) throw new Error(`Missing events for scene ${scene.scene_id}`)

      const storyboardPrompt = applyTemplate(promptTemplates.eventsToStoryboardPromptTemplate, {
        scene_events_json: JSON.stringify(events, null, 2),
        scene_time: scene.time,
        scene_location: scene.location,
        characters_lib_name: charactersLibName,
        locations_lib_name: locationsLibName,
        characters_full_description: charactersFullDescription,
        locations_description: locationsDescription,
        characters_introduction: charactersIntroduction,
      })

      const { parsed } = await runStepWithRetry(
        runStep,
        {
          stepId: `scene_${scene.scene_id}_storyboard`,
          stepTitle: 'progress.streamStep.eventsToStoryboard',
          stepIndex: storyboardBaseIndex + index,
          stepTotal,
          dependsOn: [`scene_${scene.scene_id}_events`],
          groupId: 'events_to_storyboard',
          parallelKey: scene.scene_id,
          retryable: true,
        },
        storyboardPrompt,
        'events_to_storyboard',
        4000,
        parseSceneStoryboard,
      )

      if (!parsed.scene_id) {
        parsed.scene_id = scene.scene_id
      }
      return parsed
    },
  )

  const sceneStoryboardMap = new Map<string, DirectorSceneStoryboard>()
  let totalShots = 0
  for (const sb of sceneStoryboardResults) {
    sceneStoryboardMap.set(sb.scene_id, sb)
    totalShots += sb.shots.length
  }

  onLog?.(`导演模式 - 分镜生成完成，共 ${totalShots} 个镜头`)

  // ── Stage 4: Per-scene shot detail (image ‖ video ‖ sound parallel per scene) ──
  onLog?.(`导演模式 - 步骤5：镜头细节生成（${sceneList.length} 个场次 × 3 并行）`)

  const shotDetailBaseIndex = storyboardBaseIndex + sceneList.length
  const sceneShotDetailsMap = new Map<string, DirectorSceneShotDetails>()

  await mapWithConcurrency(
    sceneList,
    concurrency,
    async (scene, sceneIndex) => {
      const storyboard = sceneStoryboardMap.get(scene.scene_id)
      if (!storyboard) throw new Error(`Missing storyboard for scene ${scene.scene_id}`)

      const storyboardJson = JSON.stringify(storyboard, null, 2)

      // Run image / video / sound in parallel for this scene
      const [imageResults, videoResults, soundResults] = await mapWithConcurrency(
        [
          () => runStepWithRetry(
            runStep,
            {
              stepId: `scene_${scene.scene_id}_shot_image`,
              stepTitle: 'progress.streamStep.shotImagePrompt',
              stepIndex: shotDetailBaseIndex + sceneIndex,
              stepTotal,
              dependsOn: [`scene_${scene.scene_id}_storyboard`],
              groupId: 'shot_detail',
              parallelKey: `${scene.scene_id}_image`,
              retryable: true,
            },
            applyTemplate(promptTemplates.shotImagePromptTemplate, {
              scene_storyboard_json: storyboardJson,
              characters_full_description: charactersFullDescription,
              locations_description: locationsDescription,
            }),
            'shot_image_prompt',
            6000,
            parseShotImagePrompts,
          ),
          () => runStepWithRetry(
            runStep,
            {
              stepId: `scene_${scene.scene_id}_shot_video`,
              stepTitle: 'progress.streamStep.shotVideoPrompt',
              stepIndex: shotDetailBaseIndex + sceneIndex,
              stepTotal,
              dependsOn: [`scene_${scene.scene_id}_storyboard`],
              groupId: 'shot_detail',
              parallelKey: `${scene.scene_id}_video`,
              retryable: true,
            },
            applyTemplate(promptTemplates.shotVideoPromptTemplate, {
              scene_storyboard_json: storyboardJson,
              characters_age_gender: charactersAgeGender,
              characters_introduction: charactersIntroduction,
            }),
            'shot_video_prompt',
            3000,
            parseShotVideoPrompts,
          ),
          () => runStepWithRetry(
            runStep,
            {
              stepId: `scene_${scene.scene_id}_shot_sound`,
              stepTitle: 'progress.streamStep.shotSoundDesign',
              stepIndex: shotDetailBaseIndex + sceneIndex,
              stepTotal,
              dependsOn: [`scene_${scene.scene_id}_storyboard`],
              groupId: 'shot_detail',
              parallelKey: `${scene.scene_id}_sound`,
              retryable: true,
            },
            applyTemplate(promptTemplates.shotSoundDesignTemplate, {
              scene_storyboard_json: storyboardJson,
              characters_lib_name: charactersLibName,
              characters_voice_config: charactersVoiceConfig,
            }),
            'shot_sound_design',
            2000,
            parseShotSoundDesigns,
          ),
        ],
        3,  // all 3 run in parallel
        async (run) => await run(),
      ) as [
        { output: DirectorStepOutput; parsed: DirectorShotImagePrompts[] },
        { output: DirectorStepOutput; parsed: DirectorShotVideoPrompt[] },
        { output: DirectorStepOutput; parsed: DirectorShotSoundDesign[] },
      ]

      // Merge the three results by shot_number
      const imageMap = new Map(imageResults.parsed.map((s) => [s.shot_number, s]))
      const videoMap = new Map(videoResults.parsed.map((s) => [s.shot_number, s]))
      const soundMap = new Map(soundResults.parsed.map((s) => [s.shot_number, s]))

      const mergedShots: DirectorShotDetail[] = storyboard.shots.map((shot) => {
        const img = imageMap.get(shot.shot_number)
        const vid = videoMap.get(shot.shot_number)
        const snd = soundMap.get(shot.shot_number)
        return {
          shot_number: shot.shot_number,
          image_prompt_lt: img?.image_prompt_lt || '',
          image_prompt_rt: img?.image_prompt_rt || '',
          image_prompt_lb: img?.image_prompt_lb || '',
          image_prompt_rb: img?.image_prompt_rb || '',
          video_prompt: vid?.video_prompt || '',
          sound_effect: snd?.sound_effect || '',
          voice_speaker: snd?.voice_speaker ?? shot.voice_speaker,
        }
      })

      sceneShotDetailsMap.set(scene.scene_id, {
        scene_id: scene.scene_id,
        shots: mergedShots,
      })
    },
  )

  onLog?.(`导演模式 - 镜头细节生成完成，共 ${totalShots} 个镜头完成 image/video/sound`)

  return {
    characterStep,
    locationStep,
    splitStep,
    charactersObject,
    locationsObject,
    analyzedCharacters,
    analyzedLocations,
    charactersLibName,
    locationsLibName,
    charactersIntroduction,
    sceneList,
    sceneEventsMap,
    sceneStoryboardMap,
    sceneShotDetailsMap,
    summary: {
      characterCount: analyzedCharacters.length,
      locationCount: analyzedLocations.length,
      sceneCount: sceneList.length,
      totalEvents,
      totalShots,
    },
  }
}
