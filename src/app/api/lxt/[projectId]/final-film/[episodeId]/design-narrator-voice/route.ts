import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import {
  createVoiceDesign,
  validatePreviewText,
  validateVoicePrompt,
} from '@/lib/providers/bailian/voice-design'
import { getProviderConfig } from '@/lib/api-config'
import {
  parseFinalFilmContent,
  serializeFinalFilmContent,
} from '@/lib/lxt/final-film'

/**
 * POST /api/lxt/[projectId]/final-film/[episodeId]/design-narrator-voice
 *
 * 为旁白设计 AI 音色，调用百炼 QwenTTS voice design API，
 * 成功后自动将 voiceId 写回 LxtFinalFilmContent.narratorVoiceId。
 *
 * Body: { voicePrompt: string, previewText?: string }
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; episodeId: string }> },
) => {
  const { projectId, episodeId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = (await request.json().catch(() => ({}))) as {
    voicePrompt?: string
    previewText?: string
  }

  const voicePrompt = (body.voicePrompt ?? '').trim()
  if (!voicePrompt) throw new ApiError('INVALID_PARAMS', { message: 'voicePrompt is required' })

  const promptValidation = validateVoicePrompt(voicePrompt)
  if (!promptValidation.valid) {
    throw new ApiError('INVALID_PARAMS', { message: promptValidation.error || 'invalid voicePrompt' })
  }

  const previewText = (body.previewText ?? '').trim() || '你好，很高兴认识你。这是AI为旁白设计的声音。'
  const textValidation = validatePreviewText(previewText)
  if (!textValidation.valid) {
    throw new ApiError('INVALID_PARAMS', { message: textValidation.error || 'invalid previewText' })
  }

  const { apiKey } = await getProviderConfig(authResult.session.user.id, 'bailian')
  const result = await createVoiceDesign({ voicePrompt, previewText, preferredName: 'lxt_narrator', language: 'zh' }, apiKey)

  if (!result.success) {
    throw new ApiError('INTERNAL_ERROR', { message: result.error || '声音设计失败' })
  }

  // Write voiceId back to finalFilmContent
  await prisma.$transaction(async (tx) => {
    const current = await tx.lxtEpisode.findUnique({
      where: { id: episodeId },
      select: { finalFilmContent: true },
    })
    if (!current) throw new ApiError('NOT_FOUND')

    const content = parseFinalFilmContent(current.finalFilmContent)
    content.narratorVoiceId = result.voiceId

    await tx.lxtEpisode.update({
      where: { id: episodeId },
      data: { finalFilmContent: serializeFinalFilmContent(content) },
    })
  })

  return NextResponse.json({
    success: true,
    voiceId: result.voiceId,
    audioBase64: result.audioBase64,
  })
})
