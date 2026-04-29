import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const p = await prisma.project.findUnique({
    where: { id: '878f177e-a21a-48ca-b013-8819dd611440' },
    include: { lxtData: { include: { episodes: true, assets: true } } },
  })
  if (!p?.lxtData) { console.log('No LXT data'); return }

  console.log(`Project: ${p.name}`)
  console.log(`LXT Project: ${p.lxtData.id}`)
  console.log(`Analysis Model: ${p.lxtData.analysisModel}`)

  console.log(`\n=== Episodes (${p.lxtData.episodes.length}) ===`)
  for (const ep of p.lxtData.episodes) {
    console.log(`\n--- Episode ${ep.id} ---`)
    const sc = ep.scriptContent
    console.log(`scriptContent (${sc?.length ?? 0} chars):`)
    console.log(sc?.substring(0, 1500))

    const sbc = ep.storyboardContent
    console.log(`\nstoryboardContent (${sbc?.length ?? 0} chars):`)
    console.log(sbc?.substring(0, 1500))

    const ffc = ep.finalFilmContent
    console.log(`\nfinalFilmContent (${ffc?.length ?? 0} chars):`)
    console.log(ffc?.substring(0, 2000))
  }

  console.log(`\n=== Assets (${p.lxtData.assets.length}) ===`)
  for (const a of p.lxtData.assets) {
    console.log(`\n[${a.kind}] ${a.name} (id: ${a.id})`)
    console.log(`  summary: ${a.summary?.substring(0, 300)}`)
    console.log(`  description (${a.description?.length ?? 0} chars):`)
    console.log(`  ${a.description?.substring(0, 800)}`)
    console.log(`  imageUrl: ${a.imageUrl?.substring(0, 200)}`)
    console.log(`  imageUrls: ${a.imageUrls}`)
    console.log(`  profileConfirmed: ${a.profileConfirmed}`)
    if (a.profileData) {
      try {
        const pd = JSON.parse(a.profileData)
        console.log(`  profileData: gender=${pd.gender}, age_range=${pd.age_range}`)
        console.log(`  body_proportion: ${pd.body_proportion}`)
        console.log(`  species_traits: ${JSON.stringify(pd.species_traits)}`)
        console.log(`  primary_identifier: ${pd.primary_identifier}`)
        console.log(`  era_period: ${pd.era_period}, social_class: ${pd.social_class}`)
        console.log(`  costume_tier: ${pd.costume_tier}`)
        console.log(`  suggested_colors: ${JSON.stringify(pd.suggested_colors)}`)
        console.log(`  visual_keywords: ${JSON.stringify(pd.visual_keywords)}`)
        console.log(`  expected_appearances: ${JSON.stringify(pd.expected_appearances)}`)
      } catch {}
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
