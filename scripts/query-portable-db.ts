import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.PORTABLE_DB_URL || 'mysql://root:waoowaoo123@127.0.0.1:13306/waoowaoo' } },
})

async function main() {
  const projectId = 'df36022e-ad90-4bed-b89a-54c3a2840b0a'

  const lxtProject = await prisma.lxtProject.findFirst({ where: { projectId } })
  if (!lxtProject) { console.log('LXT Project not found'); return }
  console.log(`LXT Project: ${lxtProject.id}`)

  const episodes = await prisma.lxtEpisode.findMany({
    where: { lxtProjectId: lxtProject.id },
    orderBy: { createdAt: 'asc' },
  })
  for (const ep of episodes) {
    console.log(`\n=== Episode: ${ep.id} ===`)
    console.log(`ScriptContent (first 500): ${ep.scriptContent?.substring(0, 500)}`)
    console.log(`StoryboardContent (first 500): ${ep.storyboardContent?.substring(0, 500)}`)
    console.log(`FinalFilmContent (first 800): ${ep.finalFilmContent?.substring(0, 800)}`)
  }

  const assets = await prisma.lxtProjectAsset.findMany({
    where: { lxtProjectId: lxtProject.id },
    orderBy: { kind: 'asc' },
  })
  console.log(`\n=== Assets (${assets.length}) ===`)
  for (const a of assets) {
    console.log(`  [${a.kind}] ${a.name}`)
    console.log(`    summary: ${a.summary?.substring(0, 200)}`)
    console.log(`    description: ${a.description?.substring(0, 400)}`)
    console.log(`    imageUrl: ${a.imageUrl?.substring(0, 120)}`)
    console.log(`    profileConfirmed: ${a.profileConfirmed}`)
    if (a.profileData) {
      try {
        const pd = JSON.parse(a.profileData)
        console.log(`    profileData keys: ${Object.keys(pd).join(', ')}`)
        console.log(`    body_proportion: ${pd.body_proportion}`)
        console.log(`    species_traits: ${JSON.stringify(pd.species_traits)}`)
      } catch {}
    }
    console.log()
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
