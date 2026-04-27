import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { reportTaskProgress } from '@/lib/workers/shared'
import {
  assertTaskActive,
  getUserModels,
  toSignedUrlIfCos,
  resolveImageSourceFromGeneration,
  resolveVideoSourceFromGeneration,
  uploadImageSourceToCos,
  uploadVideoSourceToCos,
  splitGridImage,
} from '@/lib/workers/utils'
import type { TaskJobData } from '@/lib/task/types'
import {
  applyRowPatch,
  parseFinalFilmContent,
  serializeFinalFilmContent,
  resolveGridPromptPrefix,
  DEFAULT_VIDEO_RATIO,
  DEFAULT_ART_STYLE,
  type LxtFinalFilmRowBindings,
  type LxtFinalFilmImageSet,
} from '@/lib/lxt/final-film'
import { getArtStylePrompt } from '@/lib/constants'
import { normalizeReferenceImagesForGeneration } from '@/lib/media/outbound-image'
import { resolveModelMaxReferenceImages } from '@/lib/model-capabilities/catalog'
import { buildMultiShotVideoPrompt } from '@/lib/lxt/video-prompt'

type Payload = Record<string, unknown>

function readString(payload: Payload, key: string): string {
  const v = payload[key]
  return typeof v === 'string' ? v.trim() : ''
}

function readNumber(payload: Payload, key: string): number | null {
  const v = payload[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

async function mergeFinalFilmRow(
  episodeId: string,
  shotIndex: number,
  patch: Record<string, unknown>,
) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.lxtEpisode.findUnique({
      where: { id: episodeId },
      select: { finalFilmContent: true },
    })
    const content = parseFinalFilmContent(current?.finalFilmContent)
    const next = applyRowPatch(content, shotIndex, patch)
    await tx.lxtEpisode.update({
      where: { id: episodeId },
      data: { finalFilmContent: serializeFinalFilmContent(next) },
    })
  })
}

async function mergeFinalFilmGeneratedImages(
  episodeId: string,
  shotIndex: number,
  generated: {
    gridImageUrl: string | null
    splitImageUrls: (string | null)[]
    videoEndFrameUrl: string | null
  },
) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.lxtEpisode.findUnique({
      where: { id: episodeId },
      select: { finalFilmContent: true },
    })
    const content = parseFinalFilmContent(current?.finalFilmContent)
    const row = content.rows.find((r) => r.shotIndex === shotIndex)

    const nextSet: LxtFinalFilmImageSet = {
      gridImageUrl: generated.gridImageUrl,
      splitImageUrls: generated.splitImageUrls,
      videoEndFrameUrl: generated.videoEndFrameUrl,
      createdAt: new Date().toISOString(),
    }
    const history = Array.isArray(row?.imageSets) ? row.imageSets : []
    const nextHistory = [...history, nextSet].slice(-2)

    const next = applyRowPatch(content, shotIndex, {
      imageUrl: generated.gridImageUrl,
      gridImageUrl: generated.gridImageUrl,
      splitImageUrls: generated.splitImageUrls,
      imageSets: nextHistory,
      videoEndFrameUrl: generated.videoEndFrameUrl,
    })

    await tx.lxtEpisode.update({
      where: { id: episodeId },
      data: { finalFilmContent: serializeFinalFilmContent(next) },
    })
  })
}

/**
 * 从 LXT 资产绑定中收集参考图 URL（用于 AI 模型参考注入）。
 *
 * 按「角色 → 场景 → 道具」优先级排列，并根据 modelKey 的 capability catalog 中
 * maxReferenceImages 字段自动截断，无需在代码里硬编码任何数字。
 * 对没有 catalog 条目或未声明 maxReferenceImages 的模型返回全部参考图（无上限）。
 */
async function collectLxtReferenceImages(
  bindings: LxtFinalFilmRowBindings | null,
  modelKey: string,
): Promise<string[]> {
  if (!bindings) return []
  // Priority: characters first, then scene, then props
  const prioritizedIds: string[] = [
    ...bindings.characterAssetIds,
    ...(bindings.sceneAssetId ? [bindings.sceneAssetId] : []),
    ...(bindings.propAssetIds ?? []),
  ]
  if (prioritizedIds.length === 0) return []

  const assets = await prisma.lxtProjectAsset.findMany({
    where: { id: { in: prioritizedIds } },
    select: { id: true, imageUrl: true },
  })

  // Read the per-model limit from the capability catalog (Infinity if unspecified)
  const maxRefs = resolveModelMaxReferenceImages(modelKey)

  // Preserve priority order, stop once the model limit is reached
  const assetMap = new Map(assets.map((a) => [a.id, a]))
  const refs: string[] = []
  for (const id of prioritizedIds) {
    if (refs.length >= maxRefs) break
    const asset = assetMap.get(id)
    if (!asset?.imageUrl) continue
    const signed = toSignedUrlIfCos(asset.imageUrl, 3600)
    if (signed) refs.push(signed)
  }
  return refs
}

/**
 * LXT 成片 — 行级四宫格图片生成
 *
 * Payload: { episodeId, shotIndex, imagePrompt, bindings?, gridPromptPrefix? }
 *
 * 流程：
 * 1. 收集资产参考图（bindings）→ 归一化为 Base64
 * 2. 拼接四宫格指令前缀 + imagePrompt → 调用 AI 生成宫格图
 * 3. 下载宫格图 → 并发：上传原图 + 切割4张分图 → 上传4张
 * 4. 写回 finalFilmContent：gridImageUrl / splitImageUrls / imageUrl / videoEndFrameUrl
 */
export async function handleLxtFinalFilmImageTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Payload
  const userId = job.data.userId

  const episodeId = readString(payload, 'episodeId')
  const shotIndex = readNumber(payload, 'shotIndex')
  const imagePrompt = readString(payload, 'imagePrompt')
  if (!episodeId || shotIndex === null || !imagePrompt) {
    throw new Error('lxt_final_film_image: episodeId, shotIndex and imagePrompt are required')
  }

  await reportTaskProgress(job, 8, {
    stage: 'lxt_final_film_image_start',
    stageLabel: '开始生成分镜图像',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_final_film_image_start')

  const userModels = await getUserModels(userId)
  const modelId = userModels.storyboardModel ?? userModels.characterModel ?? null
  if (!modelId) throw new Error('Image model not configured for final-film generation')

  // ── 1. 收集并归一化资产参考图 ────────────────────────────────────
  await reportTaskProgress(job, 15, {
    stage: 'lxt_final_film_image_refs',
    stageLabel: '收集资产参考图',
    displayMode: 'detail',
  })
  const bindings = (payload.bindings as LxtFinalFilmRowBindings | null) ?? null
  const rawRefs = await collectLxtReferenceImages(bindings, modelId)
  const normalizedRefs = await normalizeReferenceImagesForGeneration(rawRefs)

  // ── 2. 组装四宫格提示词 ──────────────────────────────────────────
  // 画风风格 prompt（来自用户在阶段一的选择，fallback 到默认 realistic）
  const artStyle =
    typeof payload.artStyle === 'string' && payload.artStyle.trim()
      ? payload.artStyle.trim()
      : DEFAULT_ART_STYLE
  const artStyleText = getArtStylePrompt(artStyle, 'en')

  const gridPrefix =
    typeof payload.gridPromptPrefix === 'string' && payload.gridPromptPrefix.trim()
      ? payload.gridPromptPrefix.trim()
      : resolveGridPromptPrefix(artStyle)

  const fullPrompt = artStyleText
    ? `${gridPrefix}${imagePrompt}, ${artStyleText}`
    : `${gridPrefix}${imagePrompt}`

  await reportTaskProgress(job, 22, {
    stage: 'lxt_final_film_image_generate',
    stageLabel: '生成四宫格图像中…',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_final_film_image_generate')

  // ── 3. 调用 AI 模型生成四宫格图 ──────────────────────────────────
  // 使用用户在阶段一选择的比例（payload.videoRatio），fallback 到默认值 9:16
  const videoRatio =
    typeof payload.videoRatio === 'string' && payload.videoRatio.trim()
      ? payload.videoRatio.trim()
      : DEFAULT_VIDEO_RATIO

  const source = await resolveImageSourceFromGeneration(job, {
    userId,
    modelId,
    prompt: fullPrompt,
    options: {
      aspectRatio: videoRatio,
      referenceImages: normalizedRefs.length > 0 ? normalizedRefs : undefined,
    },
    pollProgress: { start: 22, end: 75 },
  })

  // ── 4. 下载宫格图到内存 ──────────────────────────────────────────
  let gridBuffer: Buffer
  if (source.startsWith('data:')) {
    const base64 = source.split(',')[1] ?? ''
    gridBuffer = Buffer.from(base64, 'base64')
  } else {
    const resp = await fetch(source)
    if (!resp.ok) throw new Error(`Failed to download generated image: ${resp.status}`)
    gridBuffer = Buffer.from(await resp.arrayBuffer())
  }

  await reportTaskProgress(job, 78, {
    stage: 'lxt_final_film_image_split',
    stageLabel: '切割分镜图像',
    displayMode: 'detail',
  })

  // ── 5. 并发：上传宫格原图 + 切割4张分图 ──────────────────────────
  const targetId = `${episodeId}:${shotIndex}`
  const [gridCosKey, splitBuffers] = await Promise.all([
    uploadImageSourceToCos(gridBuffer, 'lxt/final-film-grid', targetId),
    splitGridImage(gridBuffer),
  ])

  // ── 6. 串行上传4张分图 ───────────────────────────────────────────
  const splitCosKeys = await Promise.all(
    splitBuffers.map((buf, i) =>
      uploadImageSourceToCos(buf, 'lxt/final-film-splits', `${targetId}:${i}`),
    ),
  )

  await reportTaskProgress(job, 92, {
    stage: 'lxt_final_film_image_persist',
    stageLabel: '保存图像',
    displayMode: 'detail',
  })

  // ── 7. 生成签名 URL（72h TTL） ────────────────────────────────────
  const gridSignedUrl = toSignedUrlIfCos(gridCosKey, 72 * 3600)
  const splitSignedUrls = splitCosKeys.map((key) => toSignedUrlIfCos(key, 72 * 3600))

  // ── 8. 写回数据库 ─────────────────────────────────────────────────
  await mergeFinalFilmGeneratedImages(episodeId, shotIndex, {
    gridImageUrl: gridSignedUrl,
    splitImageUrls: splitSignedUrls,
    videoEndFrameUrl: splitSignedUrls[3] ?? gridSignedUrl,
  })

  return {
    success: true,
    episodeId,
    shotIndex,
    gridImageUrl: gridSignedUrl,
    splitImageUrls: splitSignedUrls,
  }
}

/**
 * LXT 成片 — 行级视频生成
 *
 * 使用 Seedance 2.0 多分镜提示词 + 首尾帧模式，复用通用模式的视频生成基础设施。
 *
 * Payload: { episodeId, shotIndex, videoPrompt, videoModel, firstFrameUrl,
 *            lastFrameUrl?, generationMode, bindings?, videoRatio?, artStyle? }
 */
export async function handleLxtFinalFilmVideoTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Payload
  const userId = job.data.userId

  const episodeId = readString(payload, 'episodeId')
  const shotIndex = readNumber(payload, 'shotIndex')
  const videoPrompt = readString(payload, 'videoPrompt')
  const videoModel = readString(payload, 'videoModel')
  const firstFrameUrl = readString(payload, 'firstFrameUrl')
  const lastFrameUrl = readString(payload, 'lastFrameUrl')
  const generationModeRaw = readString(payload, 'generationMode') || 'normal'
  const videoRatio = readString(payload, 'videoRatio')

  if (!episodeId || shotIndex === null || !videoPrompt || !videoModel || !firstFrameUrl) {
    throw new Error('lxt_final_film_video: missing required payload fields')
  }

  const generationMode = (
    generationModeRaw === 'firstlastframe' ? 'firstlastframe' : 'normal'
  ) as 'normal' | 'firstlastframe'

  await reportTaskProgress(job, 10, {
    stage: 'lxt_final_film_video_start',
    stageLabel: '提交视频生成',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_final_film_video_start')

  // 1. 加载 episode 获取全部分镜行作为多分镜上下文
  await reportTaskProgress(job, 18, {
    stage: 'lxt_final_film_video_context',
    stageLabel: '构建多分镜提示词',
    displayMode: 'detail',
  })

  const episode = await prisma.lxtEpisode.findUnique({
    where: { id: episodeId },
    select: { finalFilmContent: true },
  })
  const content = parseFinalFilmContent(episode?.finalFilmContent)
  const allRows = content.rows
  const currentRow = allRows.find((r) => r.shotIndex === shotIndex)
  if (!currentRow) throw new Error(`Shot index ${shotIndex} not found in episode ${episodeId}`)

  // 2. 构建多分镜提示词（前后各 1 镜上下文）
  if (!currentRow.videoPrompt?.trim()) {
    throw new Error(`Shot ${shotIndex}: videoPrompt is empty, cannot generate video`)
  }
  const multiShotPrompt = buildMultiShotVideoPrompt(currentRow, allRows)

  // 3. COS 签名首帧 / 尾帧 URL（24h TTL，适配异步视频生成可能的长等待）
  const signedFirstFrame = toSignedUrlIfCos(firstFrameUrl, 24 * 3600)
  if (!signedFirstFrame) throw new Error('Cannot resolve first frame URL')

  let signedLastFrame: string | undefined
  if (generationMode === 'firstlastframe' && lastFrameUrl) {
    signedLastFrame = toSignedUrlIfCos(lastFrameUrl, 24 * 3600) ?? undefined
  }

  // 4. 收集资产参考图（角色/场景/道具），用于保持视频中角色外观一致性
  const bindings = (payload.bindings as LxtFinalFilmRowBindings | null) ?? null
  const rawRefs = await collectLxtReferenceImages(bindings, videoModel)
  const normalizedRefs = rawRefs.length > 0
    ? await normalizeReferenceImagesForGeneration(rawRefs)
    : []

  await reportTaskProgress(job, 30, {
    stage: 'lxt_final_film_video_generate',
    stageLabel: '生成视频中…',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_final_film_video_generate')

  // 5. 调用通用视频生成基础设施（生成 + 轮询）
  const generated = await resolveVideoSourceFromGeneration(job, {
    userId,
    modelId: videoModel,
    imageUrl: signedFirstFrame,
    referenceImages: normalizedRefs.length > 0 ? normalizedRefs : undefined,
    options: {
      prompt: multiShotPrompt,
      resolution: '720p',
      duration: 8,
      ...(videoRatio ? { aspectRatio: videoRatio } : {}),
      generationMode,
      ...(signedLastFrame ? { lastFrameImageUrl: signedLastFrame } : {}),
    },
    pollProgress: { start: 30, end: 85 },
  })

  const videoUrl = generated.url
  if (!videoUrl) throw new Error('Video generation returned no URL')

  await reportTaskProgress(job, 88, {
    stage: 'lxt_final_film_video_upload',
    stageLabel: '上传视频',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_final_film_video_upload')

  // 6. 上传视频到 COS
  const targetId = `${episodeId}:${shotIndex}`
  const cosKey = await uploadVideoSourceToCos(
    videoUrl,
    'lxt/final-film-video',
    targetId,
    generated.downloadHeaders,
  )

  const signedVideoUrl = toSignedUrlIfCos(cosKey, 72 * 3600)

  await reportTaskProgress(job, 95, {
    stage: 'lxt_final_film_video_persist',
    stageLabel: '保存结果',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'lxt_final_film_video_persist')

  // 7. 回写 videoUrl 到行数据
  await mergeFinalFilmRow(episodeId, shotIndex, {
    videoUrl: signedVideoUrl,
  })

  // 8. 返回 actualVideoTokens 用于计费结算
  return {
    success: true,
    episodeId,
    shotIndex,
    videoUrl: signedVideoUrl,
    ...(typeof generated.actualVideoTokens === 'number'
      ? { actualVideoTokens: generated.actualVideoTokens }
      : {}),
  }
}
