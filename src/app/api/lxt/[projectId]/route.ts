import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { parseModelKeyStrict } from '@/lib/model-config-contract'

/**
 * PATCH /api/lxt/[projectId]
 * 更新 LXT 项目级模型配置
 *
 * 支持字段：
 *   - analysisModel: string | null  （文本分析模型，格式 provider::modelId）
 *
 * 与 PATCH /api/novel-promotion/[projectId] 模式对称，
 * 确保用户在 workspace 中切换模型后能持久化到项目级别，
 * 后续推理（generate-script / generate-storyboard / lxt-storyboard-to-script）
 * 读取 lxtProject.analysisModel 时能获取最新值，而非仅依赖 userPreference 兜底。
 */
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as Record<string, unknown>

  const allowedFields = ['analysisModel'] as const
  const updateData: Record<string, string | null> = {}

  for (const field of allowedFields) {
    if (body[field] === undefined) continue

    const value = body[field]
    if (value === null) {
      updateData[field] = null
      continue
    }

    if (typeof value !== 'string' || !value.trim()) {
      throw new ApiError('INVALID_PARAMS', { code: 'MODEL_KEY_INVALID', field })
    }

    if (!parseModelKeyStrict(value.trim())) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MODEL_KEY_INVALID',
        field,
        message: 'model key must be in provider::modelId format',
      })
    }

    updateData[field] = value.trim()
  }

  if (Object.keys(updateData).length === 0) {
    throw new ApiError('INVALID_PARAMS', { code: 'NO_FIELDS_TO_UPDATE' })
  }

  const lxtProject = await prisma.lxtProject.findUnique({
    where: { projectId },
    select: { id: true },
  })
  if (!lxtProject) {
    throw new ApiError('NOT_FOUND')
  }

  const updated = await prisma.lxtProject.update({
    where: { projectId },
    data: updateData,
    select: { analysisModel: true },
  })

  return NextResponse.json({ analysisModel: updated.analysisModel })
})
