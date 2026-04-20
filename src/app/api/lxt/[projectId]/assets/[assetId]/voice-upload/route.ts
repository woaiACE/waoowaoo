import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadObject, generateUniqueKey, getSignedUrl } from '@/lib/storage'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/lxt/[projectId]/assets/[assetId]/voice-upload
 *
 * FormData { file }          → 上传自定义音色音频，写回 customVoiceUrl + voiceType='uploaded'
 * JSON { voiceDesign: { voiceId, audioBase64 } } → 保存 AI 设计音色，写回 voiceId + customVoiceUrl
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; assetId: string }> },
) => {
  const { projectId, assetId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  // 验证资产属于该项目
  const asset = await prisma.lxtProjectAsset.findFirst({
    where: { id: assetId, lxtProject: { projectId } },
    select: { id: true, kind: true },
  })
  if (!asset) throw new ApiError('NOT_FOUND')
  if (asset.kind !== 'character') throw new ApiError('INVALID_PARAMS', { message: '只有角色资产支持音色上传' })

  const contentType = request.headers.get('content-type') || ''

  // ── JSON: AI 声音设计保存 ─────────────────────────────────────────────
  if (contentType.includes('application/json')) {
    const body = await request.json() as { voiceDesign?: { voiceId?: string; audioBase64?: string } }
    const { voiceId, audioBase64 } = body.voiceDesign ?? {}
    if (!voiceId || !audioBase64) throw new ApiError('INVALID_PARAMS')

    const audioBuffer = Buffer.from(audioBase64, 'base64')
    const key = generateUniqueKey(`voice/lxt/${projectId}/${assetId}`, 'wav')
    const cosUrl = await uploadObject(audioBuffer, key)

    await prisma.lxtProjectAsset.update({
      where: { id: assetId },
      data: { voiceType: 'bailian', voiceId, customVoiceUrl: cosUrl },
    })

    const signedUrl = getSignedUrl(cosUrl, 7200)
    return NextResponse.json({ success: true, audioUrl: signedUrl })
  }

  // ── FormData: 文件上传 ────────────────────────────────────────────────
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) throw new ApiError('INVALID_PARAMS')

  const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/x-m4a']
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|m4a)$/i)) {
    throw new ApiError('INVALID_PARAMS', { message: '不支持的音频格式' })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3'
  const key = generateUniqueKey(`voice/lxt/${projectId}/${assetId}`, ext)
  const cosUrl = await uploadObject(buffer, key)

  await prisma.lxtProjectAsset.update({
    where: { id: assetId },
    data: { voiceType: 'uploaded', voiceId: null, customVoiceUrl: cosUrl },
  })

  const signedUrl = getSignedUrl(cosUrl, 7200)
  return NextResponse.json({ success: true, audioUrl: signedUrl })
})
