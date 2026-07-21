import { AiJobStatus, ContractStatus, SurveyStatus, TaskStatus } from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { DEMO_ACCOUNTS, DEMO_EMAIL_DOMAIN, DEMO_HISTORY_DAYS, DEMO_ITERATIONS } from './demo-data'
import { DEMO_MEDIA } from './demo-media'

export interface DemoVerificationResult {
  checks: Record<string, number>
  failures: string[]
}

export const verifyDemoData = async (prisma: PrismaClient): Promise<DemoVerificationResult> => {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } },
    select: { id: true, email: true, status: true, emailVerified: true }
  })
  const userIds = users.map((row) => row.id)
  const series = await prisma.series.findMany({
    where: { mangakaId: { in: userIds } },
    select: { id: true, title: true }
  })
  const seriesIds = series.map((row) => row.id)
  const flowSixSeriesIds = series.filter((row) => row.title.startsWith('[DEMO F6-')).map((row) => row.id)
  const chapters = await prisma.chapter.findMany({
    where: { seriesId: { in: seriesIds } },
    select: { id: true, seriesId: true }
  })
  const chapterIds = chapters.map((row) => row.id)
  const pages = await prisma.page.findMany({ where: { chapterId: { in: chapterIds } }, select: { id: true } })
  const pageIds = pages.map((row) => row.id)

  const [
    assets,
    tasks,
    assignedTasks,
    submittedTasks,
    revisionTasks,
    aiJobs,
    successfulAiJobs,
    reflectedPeriods,
    closedPeriods,
    openPeriods,
    rankingRecords,
    pendingBoardDecisions,
    draftContracts,
    fullyExecutedContracts,
    paymentConditions,
    paymentRecords
  ] = await Promise.all([
    prisma.asset.count({ where: { uploadedBy: { in: userIds } } }),
    prisma.task.count({ where: { pageId: { in: pageIds } } }),
    prisma.task.count({ where: { pageId: { in: pageIds }, status: TaskStatus.ASSIGNED } }),
    prisma.task.count({ where: { pageId: { in: pageIds }, status: TaskStatus.SUBMITTED } }),
    prisma.task.count({ where: { pageId: { in: pageIds }, status: TaskStatus.REVISION_REQUESTED } }),
    prisma.aiJob.count({ where: { pageId: { in: pageIds } } }),
    prisma.aiJob.count({ where: { pageId: { in: pageIds }, status: AiJobStatus.SUCCEEDED } }),
    prisma.surveyPeriod.count({ where: { createdBy: { in: userIds }, status: SurveyStatus.REFLECTED } }),
    prisma.surveyPeriod.count({ where: { createdBy: { in: userIds }, status: SurveyStatus.CLOSED } }),
    prisma.surveyPeriod.count({ where: { createdBy: { in: userIds }, status: SurveyStatus.OPEN } }),
    prisma.rankingRecord.count({ where: { seriesId: { in: seriesIds } } }),
    prisma.boardDecision.count({ where: { targetSeriesId: { in: seriesIds }, result: 'PENDING' } }),
    prisma.contract.count({
      where: { seriesId: { in: flowSixSeriesIds }, status: ContractStatus.DRAFT }
    }),
    prisma.contract.count({ where: { seriesId: { in: seriesIds }, status: ContractStatus.FULLY_EXECUTED } }),
    prisma.paymentCondition.count({ where: { contract: { seriesId: { in: seriesIds } } } }),
    prisma.paymentRecord.count({ where: { seriesId: { in: seriesIds } } })
  ])

  const checks = {
    accounts: users.length,
    activeVerifiedAccounts: users.filter((row) => row.status === 'ACTIVE' && row.emailVerified).length,
    series: series.length,
    chapters: chapters.length,
    pages: pages.length,
    mediaAssets: assets,
    tasks,
    assignedTasks,
    submittedTasks,
    revisionTasks,
    aiJobs,
    successfulAiJobs,
    reflectedPeriods,
    closedPeriods,
    openPeriods,
    rankingRecords,
    pendingBoardDecisions,
    draftContracts,
    fullyExecutedContracts,
    paymentConditions,
    paymentRecords
  }
  const failures: string[] = []
  expectAtLeast(failures, 'accounts', checks.accounts, DEMO_ACCOUNTS.length)
  expectAtLeast(failures, 'activeVerifiedAccounts', checks.activeVerifiedAccounts, DEMO_ACCOUNTS.length)
  expectAtLeast(failures, 'mediaAssets', checks.mediaAssets, DEMO_MEDIA.length)
  expectAtLeast(failures, 'tasks', checks.tasks, DEMO_ITERATIONS * 3)
  expectAtLeast(failures, 'assignedTasks', checks.assignedTasks, DEMO_ITERATIONS)
  expectAtLeast(failures, 'submittedTasks', checks.submittedTasks, DEMO_ITERATIONS)
  expectAtLeast(failures, 'revisionTasks', checks.revisionTasks, DEMO_ITERATIONS)
  expectAtLeast(failures, 'successfulAiJobs', checks.successfulAiJobs, DEMO_ITERATIONS)
  expectAtLeast(failures, 'reflectedPeriods', checks.reflectedPeriods, DEMO_HISTORY_DAYS)
  expectAtLeast(failures, 'closedPeriods', checks.closedPeriods, DEMO_ITERATIONS)
  expectAtLeast(failures, 'openPeriods', checks.openPeriods, 1)
  expectAtLeast(failures, 'rankingRecords', checks.rankingRecords, DEMO_HISTORY_DAYS * (DEMO_ITERATIONS + 1))
  expectAtLeast(failures, 'pendingBoardDecisions', checks.pendingBoardDecisions, DEMO_ITERATIONS)
  expectAtLeast(failures, 'draftContracts', checks.draftContracts, DEMO_ITERATIONS)
  expectAtLeast(failures, 'fullyExecutedContracts', checks.fullyExecutedContracts, DEMO_ITERATIONS + 1)
  expectAtLeast(failures, 'paymentConditions', checks.paymentConditions, (DEMO_ITERATIONS + 1) * 2)
  expectAtLeast(failures, 'paymentRecords', checks.paymentRecords, (DEMO_ITERATIONS + 1) * 2)

  return { checks, failures }
}

const expectAtLeast = (failures: string[], name: string, actual: number, minimum: number) => {
  if (actual < minimum) failures.push(`${name}: expected >= ${minimum}, received ${actual}`)
}
