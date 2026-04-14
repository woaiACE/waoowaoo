import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { LmStudioNativeModel } from './native'

const execFileAsync = promisify(execFile)

export interface LmStudioRuntimeStats {
  loadedModelCount: number
  loadedModelSizeBytes?: number
  gpuMemoryUsedMb?: number
  telemetrySource: 'nvidia-smi' | 'estimate' | 'unavailable'
}

async function tryReadLmStudioGpuMemoryMb(): Promise<number | undefined> {
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      ['--query-compute-apps=process_name,used_gpu_memory', '--format=csv,noheader,nounits'],
      {
        timeout: 5000,
        windowsHide: true,
      },
    )

    const rows = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    if (rows.length === 0) return undefined

    let total = 0
    for (const row of rows) {
      const segments = row.split(',').map((part) => part.trim())
      if (segments.length === 0) continue

      const name = (segments[0] || '').toLowerCase()
      const memoryRaw = segments[segments.length - 1] || ''
      const memoryMb = Number.parseFloat(memoryRaw)
      if (!Number.isFinite(memoryMb)) continue

      if (!name || name.includes('lm studio') || name.includes('lmstudio')) {
        total += memoryMb
      }
    }

    return total > 0 ? Math.round(total) : undefined
  } catch {
    return undefined
  }
}

export async function getLmStudioRuntimeStats(models: LmStudioNativeModel[]): Promise<LmStudioRuntimeStats> {
  const loadedModels = models.filter((model) => model.isLoaded)
  const loadedModelCount = loadedModels.length
  const loadedModelSizeBytes = loadedModels.reduce((sum, model) => {
    return sum + (typeof model.sizeBytes === 'number' ? model.sizeBytes : 0)
  }, 0)

  const gpuMemoryUsedMb = await tryReadLmStudioGpuMemoryMb()
  if (typeof gpuMemoryUsedMb === 'number') {
    return {
      loadedModelCount,
      ...(loadedModelSizeBytes > 0 ? { loadedModelSizeBytes } : {}),
      gpuMemoryUsedMb,
      telemetrySource: 'nvidia-smi',
    }
  }

  if (loadedModelSizeBytes > 0) {
    return {
      loadedModelCount,
      loadedModelSizeBytes,
      gpuMemoryUsedMb: Math.max(1, Math.round(loadedModelSizeBytes / (1024 * 1024))),
      telemetrySource: 'estimate',
    }
  }

  return {
    loadedModelCount,
    telemetrySource: 'unavailable',
  }
}
