import { prisma } from '@/lib/prisma'
import { composeModelKey, parseModelKeyStrict } from '@/lib/model-config-contract'

type ResolveAnalysisModelInput = {
  userId: string
  inputModel?: unknown
  projectAnalysisModel?: unknown
}

function normalizeModelKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = parseModelKeyStrict(trimmed)
  if (!parsed) return null
  return composeModelKey(parsed.provider, parsed.modelId)
}

export async function resolveAnalysisModel(input: ResolveAnalysisModelInput): Promise<string> {
  const modelFromInput = normalizeModelKey(input.inputModel)
  if (modelFromInput) return modelFromInput

  // 用户全局偏好优先于项目级快照：当用户在设置中心更换模型后，
  // 新选择应立即生效，而不是继续使用项目建立时留存的旧模型。
  // 项目级 analysisModel 仅作为无全局偏好时的兜底（历史兼容）。
  const userPreference = await prisma.userPreference.findUnique({
    where: { userId: input.userId },
    select: { analysisModel: true },
  })
  const modelFromUserPreference = normalizeModelKey(userPreference?.analysisModel)
  if (modelFromUserPreference) return modelFromUserPreference

  const modelFromProject = normalizeModelKey(input.projectAnalysisModel)
  if (modelFromProject) return modelFromProject

  throw new Error('ANALYSIS_MODEL_NOT_CONFIGURED: 请先在设置页面配置分析模型')
}
