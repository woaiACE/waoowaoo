import { describe, expect, it } from 'vitest'
import { buildLxtAssetPromptContext, extractLxtAssetsFromShotList } from '@/lib/lxt/project-assets'

describe('LXT asset extraction', () => {
  it('extracts characters, locations and props from storyboard text', () => {
    const shotListContent = [
      '分镜1',
      '场景：森林小院',
      '出场角色：猪妈妈、猪哥哥、猪弟弟',
      '道具：木门、竹篮',
      '',
      '分镜2',
      '场景：厨房',
      '角色：猪妈妈，小猪弟弟',
      '关键道具：围裙',
    ].join('\n')

    const assets = extractLxtAssetsFromShotList(shotListContent)

    expect(assets.characters.map((item) => item.name)).toEqual(['猪妈妈', '猪哥哥', '猪弟弟', '小猪弟弟'])
    expect(assets.locations.map((item) => item.name)).toEqual(['森林小院', '厨房'])
    expect(assets.props.map((item) => item.name)).toEqual(['木门', '竹篮', '围裙'])
  })

  it('builds a compact prompt context for final-script injection', () => {
    const context = buildLxtAssetPromptContext([
      { kind: 'character', name: '猪妈妈', summary: '稳重，围裙造型', voiceType: 'library', voiceId: 'voice_mother' },
      { kind: 'location', name: '森林小院', summary: '木栅栏与青石板' },
      { kind: 'prop', name: '竹篮', summary: '装满胡萝卜' },
    ])

    expect(context).toContain('角色资产')
    expect(context).toContain('猪妈妈')
    expect(context).toContain('voice_mother')
    expect(context).toContain('森林小院')
    expect(context).toContain('竹篮')
  })
})
