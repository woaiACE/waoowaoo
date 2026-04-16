import { describe, expect, it } from 'vitest'
import { runDirectorModeOrchestrator } from '@/lib/novel-promotion/director-mode/orchestrator'

describe('director mode orchestrator resilience', () => {
  it('synthesizes a fallback shot when a storyboard step returns an empty shots array', async () => {
    const result = await runDirectorModeOrchestrator({
      concurrency: 1,
      content: '小蓝在教室里安静地看向窗外。',
      baseCharacters: ['小蓝'],
      baseLocations: ['教室'],
      baseCharacterIntroductions: [{ name: '小蓝', introduction: '内向的学生' }],
      baseCharacterDescriptions: [{ name: '小蓝', description: '穿校服的小学生', ageGender: '女孩', voiceConfig: '轻柔' }],
      baseLocationDescriptions: [{ name: '教室', description: '下午阳光照进来的教室' }],
      promptTemplates: {
        characterPromptTemplate: '{input}',
        locationPromptTemplate: '{input}',
        splitScenesPromptTemplate: '{input}',
        sceneToEventsPromptTemplate: '{scene_content}',
        eventsToStoryboardPromptTemplate: '{scene_events_json}',
        shotImagePromptTemplate: '{scene_storyboard_json}',
        shotVideoPromptTemplate: '{scene_storyboard_json}',
        shotSoundDesignTemplate: '{scene_storyboard_json}',
      },
      runStep: async (_meta, _prompt, action) => {
        switch (action) {
          case 'analyze_characters':
            return { text: JSON.stringify({ characters: [{ name: '小蓝', introduction: '内向的学生' }] }), reasoning: '' }
          case 'analyze_locations':
            return { text: JSON.stringify({ locations: [{ name: '教室' }] }), reasoning: '' }
          case 'split_scenes':
            return {
              text: JSON.stringify({
                scenes: [{
                  scene_id: 'scene_1',
                  scene_number: 1,
                  time: '下午',
                  location: '教室',
                  characters: ['小蓝'],
                  start_text: '开始',
                  end_text: '结束',
                  content: '小蓝在教室里安静地看向窗外。',
                }],
              }),
              reasoning: '',
            }
          case 'scene_to_events':
            return {
              text: JSON.stringify({
                scene_id: 'scene_1',
                events: [{ event_number: 1, description: '小蓝坐在窗边座位上，看向窗外。' }],
                dialogues: [],
              }),
              reasoning: '',
            }
          case 'events_to_storyboard':
            return {
              text: JSON.stringify({
                scene_id: 'scene_1',
                shots: [],
              }),
              reasoning: '',
            }
          case 'shot_image_prompt':
            return {
              text: JSON.stringify({
                shots: [{
                  shot_number: 1,
                  global_position: '小蓝位于画面中部靠窗位置',
                  image_prompt_lt: 'lt',
                  image_prompt_rt: 'rt',
                  image_prompt_lb: 'lb',
                  image_prompt_rb: 'rb',
                }],
              }),
              reasoning: '',
            }
          case 'shot_video_prompt':
            return {
              text: JSON.stringify({
                shots: [{
                  shot_number: 1,
                  shot_caption: '安静地看向窗外',
                  video_prompt: 'slow push in',
                }],
              }),
              reasoning: '',
            }
          case 'shot_sound_design':
            return {
              text: JSON.stringify({
                shots: [{
                  shot_number: 1,
                  sound_effect: '微风和翻书声',
                  voice_speaker: null,
                }],
              }),
              reasoning: '',
            }
          default:
            throw new Error(`Unexpected action: ${action}`)
        }
      },
    })

    const storyboard = result.sceneStoryboardMap.get('scene_1')
    expect(storyboard?.shots).toHaveLength(1)
    expect(storyboard?.shots[0]).toMatchObject({
      shot_number: 1,
      subject: '小蓝',
      description: '小蓝坐在窗边座位上，看向窗外。',
      duration_hint: '3s',
    })
    expect(result.summary.totalShots).toBe(1)
  })
})
