import { describe, expect, it } from 'vitest'
import { buildDirectorViewModel } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/director-mode/buildDirectorViewModel'

describe('buildDirectorViewModel', () => {
  it('maps director artifacts into scene and shot view data', () => {
    const viewModel = buildDirectorViewModel({
      runId: 'run-1',
      status: 'completed',
      scenes: [
        {
          scene_id: 'scene_2',
          scene_number: 2,
          time: '夜晚',
          location: '操场',
          characters: ['小蓝'],
          start_text: '开始',
          end_text: '结束',
          content: '第二场内容',
        },
        {
          scene_id: 'scene_1',
          scene_number: 1,
          time: '白天',
          location: '教室',
          characters: ['小蓝', '小仪'],
          start_text: '从前',
          end_text: '放学',
          content: '第一场内容',
        },
      ],
      storyboards: [
        {
          scene_id: 'scene_1',
          shots: [
            {
              shot_number: 2,
              shot_type: '近景',
              camera_angle: '平视',
              camera_movement: '推进',
              subject: '小仪',
              description: '小仪回答老师',
              from_events: [2],
              voice_line: '老师，我会了。',
              voice_speaker: '小仪',
              duration_hint: '8秒',
            },
            {
              shot_number: 1,
              shot_type: '中景',
              camera_angle: '平视',
              camera_movement: '固定',
              subject: '老师与学生',
              description: '老师点名，小蓝举手',
              from_events: [1],
              voice_line: null,
              voice_speaker: null,
              duration_hint: '6秒',
            },
          ],
        },
      ],
      shotDetails: [
        {
          scene_id: 'scene_1',
          shots: [
            {
              shot_number: 1,
              global_position: '小蓝位于画面左侧，老师位于画面中央。',
              shot_caption: '旁白-平静:老师开始点名。',
              image_prompt_lt: '左上提示词',
              image_prompt_rt: '右上提示词',
              image_prompt_lb: '左下提示词',
              image_prompt_rb: '右下提示词',
              video_prompt: '视频提示词 1',
              sound_effect: '翻书声',
              voice_speaker: null,
            },
            {
              shot_number: 2,
              global_position: '小仪位于画面右侧，老师位于讲台后。',
              shot_caption: '小仪-自信:老师，我会了。',
              image_prompt_lt: '左上提示词 2',
              image_prompt_rt: '右上提示词 2',
              image_prompt_lb: '左下提示词 2',
              image_prompt_rb: '右下提示词 2',
              video_prompt: '视频提示词 2',
              sound_effect: '脚步声',
              voice_speaker: '小仪',
            },
          ],
        },
      ],
    })

    expect(viewModel).not.toBeNull()
    expect(viewModel?.summary.sceneCount).toBe(2)
    expect(viewModel?.summary.shotCount).toBe(2)
    expect(viewModel?.summary.totalDurationSeconds).toBe(14)
    expect(viewModel?.scenes[0]?.sceneId).toBe('scene_1')
    expect(viewModel?.scenes[0]?.shots[0]?.imagePrompts.lt).toBe('左上提示词')
    expect(viewModel?.scenes[0]?.shots[0]?.globalPosition).toContain('小蓝位于画面左侧')
    expect(viewModel?.scenes[0]?.shots[1]?.shotCaption).toContain('小仪-自信')
    expect(viewModel?.scenes[0]?.shots[1]?.soundEffect).toBe('脚步声')
  })
})
