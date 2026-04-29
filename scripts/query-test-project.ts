import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const projects = await prisma.project.findMany({
    where: { name: { contains: '测试' } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { lxtProject: true },
  })
  console.log('=== Projects with 测试 ===')
  for (const p of projects) {
    console.log(`Project: ${p.name} (id: ${p.id}), LXT: ${p.lxtProject?.id ?? 'none'}`)
  }

  if (projects.length === 0) {
    console.log('\nNo 测试 projects. Recent projects:')
    const all = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { lxtProject: true },
    })
    for (const p of all) {
      console.log(`  ${p.name} (${p.id}) LXT: ${p.lxtProject?.id ?? 'none'}`)
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
