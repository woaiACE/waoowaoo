import { TASK_TYPE } from '@/lib/task/types'
import type { WorkflowDefinition } from './registry'

type DirectorPhase = 'events' | 'storyboard' | 'shot_image' | 'shot_video' | 'shot_sound'

function parseDirectorStepKey(stepKey: string): { sceneId: string; phase: DirectorPhase } | null {
  const match = /^scene_(.+)_(events|storyboard|shot_image|shot_video|shot_sound)$/.exec(stepKey.trim())
  if (!match) return null
  const sceneId = (match[1] || '').trim()
  const phase = match[2] as DirectorPhase
  if (!sceneId) return null
  return { sceneId, phase }
}

function uniqueStepKeys(stepKeys: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(stepKeys).filter((k) => k.trim().length > 0)))
}

function resolveDirectorModeInvalidation(params: {
  stepKey: string
  existingStepKeys: ReadonlySet<string>
}): string[] {
  const affected = new Set<string>([params.stepKey])

  const downstream: Record<string, string[]> = {
    analyze_characters: [
      'split_scenes', 'scene_to_events', 'events_to_storyboard',
      'shot_detail', 'persist_director_artifacts',
    ],
    analyze_locations: [
      'split_scenes', 'scene_to_events', 'events_to_storyboard',
      'shot_detail', 'persist_director_artifacts',
    ],
    split_scenes: [
      'scene_to_events', 'events_to_storyboard',
      'shot_detail', 'persist_director_artifacts',
    ],
    scene_to_events: [
      'events_to_storyboard', 'shot_detail', 'persist_director_artifacts',
    ],
    events_to_storyboard: [
      'shot_detail', 'persist_director_artifacts',
    ],
    shot_detail: [
      'persist_director_artifacts',
    ],
  }

  if (downstream[params.stepKey]) {
    for (const k of downstream[params.stepKey]) {
      affected.add(k)
    }
  }

  // Per-scene sub-step invalidation
  const parsed = parseDirectorStepKey(params.stepKey)
  if (parsed) {
    const prefix = `scene_${parsed.sceneId}_`
    if (parsed.phase === 'events') {
      affected.add(`${prefix}storyboard`)
      affected.add(`${prefix}shot_image`)
      affected.add(`${prefix}shot_video`)
      affected.add(`${prefix}shot_sound`)
    } else if (parsed.phase === 'storyboard') {
      affected.add(`${prefix}shot_image`)
      affected.add(`${prefix}shot_video`)
      affected.add(`${prefix}shot_sound`)
    }
    affected.add('persist_director_artifacts')
  }

  return uniqueStepKeys(Array.from(affected).filter((k) => params.existingStepKeys.has(k)))
}

export const DIRECTOR_MODE_DEFINITION: WorkflowDefinition = {
  workflowType: TASK_TYPE.DIRECTOR_MODE_RUN,
  orderedSteps: [
    // ── Stage 0: Asset analysis (parallel) ──
    {
      key: 'analyze_characters',
      dependsOn: [],
      retryable: true,
      artifactTypes: ['analysis.characters'],
      failureMode: 'fail_run',
    },
    {
      key: 'analyze_locations',
      dependsOn: [],
      retryable: true,
      artifactTypes: ['analysis.locations'],
      failureMode: 'fail_run',
    },

    // ── Stage 1: Scene splitting ──
    {
      key: 'split_scenes',
      dependsOn: ['analyze_characters', 'analyze_locations'],
      retryable: true,
      artifactTypes: ['director.scenes.split'],
      failureMode: 'fail_run',
    },

    // ── Stage 2: Scene → Events (per-scene parallel) ──
    {
      key: 'scene_to_events',
      dependsOn: ['split_scenes'],
      retryable: true,
      artifactTypes: ['director.scene.events'],
      failureMode: 'fail_run',
    },

    // ── Stage 3: Events → Storyboard (per-scene parallel) ──
    {
      key: 'events_to_storyboard',
      dependsOn: ['scene_to_events'],
      retryable: true,
      artifactTypes: ['director.scene.storyboard'],
      failureMode: 'fail_run',
    },

    // ── Stage 4: Shot detail (per-scene parallel, internal 3-phase parallel) ──
    {
      key: 'shot_detail',
      dependsOn: ['events_to_storyboard'],
      retryable: true,
      artifactTypes: [
        'director.scene.shot.image',
        'director.scene.shot.video',
        'director.scene.shot.sound',
      ],
      failureMode: 'fail_run',
    },

    // ── Stage 5: Persist ──
    {
      key: 'persist_director_artifacts',
      dependsOn: ['shot_detail'],
      retryable: false,
      artifactTypes: [],
      failureMode: 'fail_run',
    },
  ],

  resolveRetryInvalidationStepKeys: ({ stepKey, existingStepKeys }) =>
    resolveDirectorModeInvalidation({
      stepKey,
      existingStepKeys: new Set(existingStepKeys),
    }),
}
