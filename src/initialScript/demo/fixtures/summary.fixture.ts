import { DemoContext, DemoSeedSummary } from './demo-seed.types'

export const buildSummary = async ({ prisma }: DemoContext): Promise<DemoSeedSummary> => {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@demo.mangaka.local' } },
    select: { id: true }
  })
  const userIds = users.map((row) => row.id)
  const series = await prisma.series.findMany({ where: { mangakaId: { in: userIds } }, select: { id: true } })
  const seriesIds = series.map((row) => row.id)
  const chapters = await prisma.chapter.findMany({ where: { seriesId: { in: seriesIds } }, select: { id: true } })
  const chapterIds = chapters.map((row) => row.id)
  const pages = await prisma.page.findMany({ where: { chapterId: { in: chapterIds } }, select: { id: true } })
  const pageIds = pages.map((row) => row.id)
  const contracts = await prisma.contract.findMany({ where: { seriesId: { in: seriesIds } }, select: { id: true } })
  const contractIds = contracts.map((row) => row.id)
  const periods = await prisma.surveyPeriod.findMany({ where: { createdBy: { in: userIds } }, select: { id: true } })
  const periodIds = periods.map((row) => row.id)
  const sessions = await prisma.boardSession.findMany({ where: { creatorId: { in: userIds } }, select: { id: true } })
  return {
    accounts: users.length,
    media: await prisma.asset.count({ where: { uploadedBy: { in: userIds } } }),
    series: series.length,
    chapters: chapters.length,
    pages: pages.length,
    tasks: await prisma.task.count({ where: { pageId: { in: pageIds } } }),
    aiJobs: await prisma.aiJob.count({ where: { pageId: { in: pageIds } } }),
    surveyPeriods: periods.length,
    rankingRecords: await prisma.rankingRecord.count({ where: { surveyPeriodId: { in: periodIds } } }),
    boardDecisions: await prisma.boardDecision.count({
      where: { boardSessionId: { in: sessions.map((row) => row.id) } }
    }),
    contracts: contracts.length,
    paymentConditions: await prisma.paymentCondition.count({ where: { contractId: { in: contractIds } } }),
    paymentRecords: await prisma.paymentRecord.count({ where: { contractId: { in: contractIds } } })
  }
}
