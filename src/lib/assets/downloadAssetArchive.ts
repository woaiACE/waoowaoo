import JSZip from 'jszip'

export type DownloadAssetEntry = {
  filename: string
  url: string
}

export async function downloadAssetArchive(entries: DownloadAssetEntry[], archiveName: string) {
  const zip = new JSZip()

  await Promise.all(
    entries.map(async ({ filename, url }) => {
      try {
        const response = await fetch(url)
        if (!response.ok) return
        const blob = await response.blob()
        zip.file(filename, blob)
      } catch {
        // 单张资源失败不阻塞其余文件打包。
      }
    }),
  )

  const content = await zip.generateAsync({ type: 'blob' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(content)
  link.download = archiveName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}
