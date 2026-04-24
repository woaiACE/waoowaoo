import { describe, expect, it } from 'vitest'
import { parseLxtScript } from '@/lib/lxt/parse-script'

describe('parseLxtScript — multi-line field capture', () => {
  it('captures multi-paragraph 视频提示词 spanning blank lines (regression for final-film auto-fill bug)', () => {
    const scriptContent = [
      '分镜1',
      '镜头文案:旁白-平静:画外音(旁白)：在一片茂密的森林旁边。',
      '图片提示词:全局物理空间位置: 森林旁的家, 摄影机在院前正对森林。',
      '视频提示词:第一个镜头，中景固定在屋前空地，风声轻拂。',
      '',
      '第二个镜头，镜头轻微向左平移一点并缓慢推近，衣料摩擦声可闻。',
      '',
      '第三个镜头，镜头从偏左缓慢回到居中，林间鸟鸣隐约传来。',
      '',
      '最后一个镜头，镜头轻微后撤回到更稳定的中景，风声持续。',
      '景别:中景',
      '语音分镜:旁白',
      '音效:风穿林间、衣料摩擦、鸟鸣。',
      '资产绑定:{"characters":["猪妈妈"],"scenes":["森林旁的家"],"props":[]}',
    ].join('\n')

    const shots = parseLxtScript(scriptContent)
    expect(shots).toHaveLength(1)
    const shot = shots[0]

    expect(shot.videoPrompt).toContain('第一个镜头')
    expect(shot.videoPrompt).toContain('第二个镜头')
    expect(shot.videoPrompt).toContain('第三个镜头')
    expect(shot.videoPrompt).toContain('最后一个镜头')
    expect(shot.videoPrompt).toContain('风声持续')

    expect(shot.copyText).toBe('旁白-平静:画外音(旁白)：在一片茂密的森林旁边。')
    expect(shot.imagePrompt).toContain('森林旁的家')
    expect(shot.shotType).toBe('中景')
    expect(shot.assetBindings?.characters).toEqual(['猪妈妈'])
    expect(shot.assetBindings?.scenes).toEqual(['森林旁的家'])
  })

  it('captures multi-line 图片提示词 when LLM breaks lines between 4-grid layouts', () => {
    const scriptContent = [
      '分镜1',
      '镜头文案:旁白-平静:A sample narration.',
      '图片提示词:全局物理空间位置: 书房, 摄影机正对书桌。',
      '分镜图片布局：',
      '左上图片:中景，书房建立帧。',
      '右上图片:中景，机位稍向左平移。',
      '左下图片:中景，机位回到居中并略微下压。',
      '右下图片:中景，机位轻微后撤收束。',
      '视频提示词:第一个镜头，中景定场。第二个镜头，镜头稍左推近。第三个镜头，回到居中下压。最后一个镜头，后撤收束。',
      '景别:中景',
      '语音分镜:旁白',
      '音效:翻书、钢笔轻敲。',
    ].join('\n')

    const shots = parseLxtScript(scriptContent)
    expect(shots).toHaveLength(1)
    const shot = shots[0]

    expect(shot.imagePrompt).toContain('左上图片')
    expect(shot.imagePrompt).toContain('右上图片')
    expect(shot.imagePrompt).toContain('左下图片')
    expect(shot.imagePrompt).toContain('右下图片')
    expect(shot.videoPrompt).toContain('最后一个镜头')
  })

  it('handles multi-shot scripts and does not leak content between shots', () => {
    const scriptContent = [
      '分镜1',
      '镜头文案:旁白-平静:第 1 分镜文案。',
      '视频提示词:第一个镜头，A。',
      '第二个镜头，B。',
      '最后一个镜头，C。',
      '景别:中景',
      '',
      '分镜2',
      '镜头文案:猪哥哥-兴奋:第 2 分镜文案。',
      '视频提示词:第一个镜头，D。',
      '第二个镜头，E。',
      '最后一个镜头，F。',
      '景别:近景',
    ].join('\n')

    const shots = parseLxtScript(scriptContent)
    expect(shots).toHaveLength(2)
    expect(shots[0].videoPrompt).toContain('C。')
    expect(shots[0].videoPrompt).not.toContain('D。')
    expect(shots[1].videoPrompt).toContain('D。')
    expect(shots[1].videoPrompt).toContain('F。')
    expect(shots[1].shotType).toBe('近景')
  })
})
