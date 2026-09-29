import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const DAY = 24 * 60 * 60 * 1000

/** 每个班级内按 mark 排序，第 i 个实验的公开时间相对今天偏移（天） */
const PUBLISH_OFFSETS = [-30, -18, -6, 6]

async function main() {
  const classes = await prisma.class.findMany({ include: { experiments: true } })
  let updated = 0
  for (const klass of classes) {
    const experiments = [...klass.experiments].sort((a, b) =>
      a.mark.localeCompare(b.mark, 'zh-CN', { numeric: true }),
    )
    for (let i = 0; i < experiments.length; i++) {
      const experiment = experiments[i]
      if (experiment.publishTime || experiment.checkoffDeadline || experiment.reportDeadline) continue

      const publish = new Date(Date.now() + PUBLISH_OFFSETS[i % PUBLISH_OFFSETS.length] * DAY)
      publish.setHours(8, 0, 0, 0)
      const checkoff = new Date(publish.getTime() + 7 * DAY)
      checkoff.setHours(23, 59, 0, 0)
      const report = new Date(publish.getTime() + 14 * DAY)
      report.setHours(23, 59, 0, 0)

      await prisma.experiment.update({
        where: { id: experiment.id },
        data: { publishTime: publish, checkoffDeadline: checkoff, reportDeadline: report },
      })
      updated += 1
    }
  }
  console.log(`✓ 已为 ${updated} 个实验补充时间线`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
