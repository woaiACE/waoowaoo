/**
 * download-style-covers.ts
 *
 * 将每种画风的封面占位图从 picsum.photos 下载到
 * public/images/styles/<category-id>/<style-id>.jpg
 *
 * 种子与 StyleSelectorModal onError 兜底逻辑完全一致，
 * 方便日后用真实封面替换（直接覆盖同路径文件即可）。
 *
 * 用法:
 *   npx tsx scripts/download-style-covers.ts
 *
 * 替换真实图片:
 *   将最终表现图 .jpg 放到对应路径覆盖即可，尺寸建议 800×600 以上。
 */

import { STYLE_CATEGORIES } from '../src/lib/style-categories'
import https from 'node:https'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_ROOT = path.join(__dirname, '..', 'public')

/** 封面尺寸（与 StyleSelectorModal 兜底尺寸一致） */
const WIDTH = 400
const HEIGHT = 300

function download(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath)
    fs.mkdirSync(dir, { recursive: true })

    const client = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(destPath)

    const request = client.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close()
        fs.unlinkSync(destPath)
        download(res.headers.location as string, destPath).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => file.close(resolve as () => void))
    })

    request.on('error', (err) => {
      try { fs.unlinkSync(destPath) } catch { /* ignore */ }
      reject(err)
    })
  })
}

async function main() {
  const allStyles = STYLE_CATEGORIES.flatMap((cat) => cat.styles)
  const total = allStyles.length
  let done = 0

  console.log(`准备下载 ${total} 张封面图到 public/images/styles/...\n`)

  for (const style of allStyles) {
    done++
    const destPath = path.join(PUBLIC_ROOT, style.coverUrl)

    if (fs.existsSync(destPath)) {
      console.log(`  ✓ [${done}/${total}] 跳过（已存在）  ${style.coverUrl}`)
      continue
    }

    const seed = encodeURIComponent(style.id)
    const picsumUrl = `https://picsum.photos/seed/${seed}/${WIDTH}/${HEIGHT}`
    process.stdout.write(`  ↓ [${done}/${total}] ${style.name.padEnd(14)} → ${style.coverUrl} `)

    try {
      await download(picsumUrl, destPath)
      process.stdout.write('✓\n')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stdout.write(`✗ (${msg})\n`)
    }
  }

  console.log('\n完成！')
  console.log('  • 替换真实封面：将对应风格的代表图 .jpg 覆盖到同路径即可')
  console.log('  • 目录结构：public/images/styles/<分类ID>/<风格ID>.jpg')
}

main()
