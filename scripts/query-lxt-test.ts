import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'

const prisma = new PrismaClient()
const OUT = 'scripts/query-lxt-test-output.txt'

function log(s: string) {
  fs.appendFileSync(OUT, s + '\n')
  console.log(s)
}

async function main() {
  fs.writeFileSync(OUT, '')

  const lp = await prisma.lxtProject.findFirst({
    where: { project: { name: 'LXT测试' } },
    include: {
      project: true,
      episodes: { orderBy: { episodeNumber: 'asc' } },
      assets: { orderBy: [{ kind: 'asc' }, { name: 'asc' }] },
    },
  })

  if (!lp) { log('NOT FOUND'); return }

  log('Project: ' + lp.project.name + ' | Episodes: ' + lp.episodes.length + ' | Assets: ' + lp.assets.length)
  const ep = lp.episodes[0]
  if (!ep) { log('No episodes'); return }

  log('\n========== STAGE 1: srtContent ==========')
  log(ep.srtContent || '(EMPTY)')

  log('\n========== STAGE 2: shotListContent ==========')
  log(ep.shotListContent || '(EMPTY)')

  log('\n========== STAGE 3: Assets ==========')
  for (const a of lp.assets) {
    log(`\n--- [${a.kind}] ${a.name} ---`)
    log('  confirmed: ' + a.profileConfirmed)
    log('  imageUrl: ' + (a.imageUrl?.substring(0, 80) || 'EMPTY'))
    log('  description: ' + (a.description?.substring(0, 500) || 'EMPTY'))
    if (a.profileData) {
      try {
        const pd = JSON.parse(a.profileData as string)
        log('  profileData keys: ' + Object.keys(pd).join(', '))
        log('  role_level: ' + pd.role_level + ' | archetype: ' + pd.archetype + ' | gender: ' + pd.gender + ' | age_range: ' + pd.age_range)
        if (pd.personality_tags) log('  personality_tags: ' + JSON.stringify(pd.personality_tags))
        if (pd.visual_keywords) log('  visual_keywords: ' + JSON.stringify(pd.visual_keywords))
      } catch { log('  profileData: (parse error)') }
    }
  }

  log('\n========== STAGE 4: scriptContent (1st shot + full preview) ==========')
  const sc = ep.scriptContent || '(EMPTY)'
  log('scriptContent length: ' + sc.length + ' chars')
  // First 6000 chars for analysis
  log(sc.substring(0, 6000))
  if (sc.length > 6000) log('\n... (' + (sc.length - 6000) + ' more chars)')

  log('\n========== STAGE 5: finalFilmContent ==========')
  const ffc = ep.finalFilmContent || '(EMPTY)'
  log('finalFilmContent length: ' + ffc.length + ' chars')
  try {
    const parsed = JSON.parse(ffc)
    log('  version: ' + parsed.version)
    log('  videoRatio: ' + parsed.videoRatio)
    log('  artStyle: ' + parsed.artStyle)
    log('  gridPromptPrefix: ' + (parsed.gridPromptPrefix || 'DEFAULT'))
    log('  videoSeed: ' + parsed.videoSeed)
    log('  rows count: ' + (parsed.rows?.length || 0))

    for (const row of (parsed.rows || [])) {
      log('\n--- Shot ' + row.shotIndex + ' ---')
      log('  label: ' + (row.label || '?'))
      log('  shotType: ' + (row.shotType || '?'))
      log('  copyText: ' + (row.copyText?.substring(0, 100) || 'EMPTY'))
      log('  imagePrompt: ' + (row.imagePrompt?.substring(0, 200) || 'EMPTY'))
      log('  videoPrompt: ' + (row.videoPrompt?.substring(0, 200) || 'EMPTY'))
      log('  imageUrl: ' + (row.imageUrl?.substring(0, 80) || 'EMPTY'))
      log('  gridImageUrl: ' + (row.gridImageUrl?.substring(0, 80) || 'EMPTY'))
      log('  videoUrl: ' + (row.videoUrl?.substring(0, 80) || 'EMPTY'))
      log('  videoEndFrameUrl: ' + (row.videoEndFrameUrl?.substring(0, 80) || 'EMPTY'))
      if (row.splitImageUrls) log('  splitImageUrls: ' + row.splitImageUrls.filter(Boolean).length + ' non-null')
      if (row.bindings) {
        log('  bindings: chars=' + (row.bindings.characterAssetIds?.length || 0) +
          ' | scenes=' + (row.bindings.sceneAssetId ? 1 : 0) +
          ' | props=' + (row.bindings.propAssetIds?.length || 0))
      }
      if (row.reviewResult) {
        log('  reviewResult: status=' + row.reviewResult.status +
          ' | retry=' + row.reviewResult.retryCount +
          ' | overall=' + (row.reviewResult.scores?.overall || 'N/A'))
        if (row.reviewResult.scores) {
          log('  scores: format=' + row.reviewResult.scores.format +
            ' narrative=' + row.reviewResult.scores.narrative +
            ' character=' + row.reviewResult.scores.character +
            ' emotion=' + row.reviewResult.scores.emotion +
            ' logic=' + row.reviewResult.scores.logic +
            ' conflict=' + row.reviewResult.scores.conflict)
        }
      }
    }

    // Shot 1 full detail
    const shot1 = (parsed.rows || []).find((r: Record<string, unknown>) => r.shotIndex === 0 || r.shotIndex === 1)
    if (shot1) {
      log('\n========== SHOT 1 FULL DETAIL ==========')
      log(JSON.stringify(shot1, null, 2))
    }
  } catch {
    log('  (parse error)')
    log(ffc.substring(0, 2000))
  }

  await prisma.$disconnect()
  log('\nDone.')
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect()
})
