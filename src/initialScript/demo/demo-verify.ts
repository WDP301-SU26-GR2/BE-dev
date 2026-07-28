import { AiJobStatus, ContractStatus, ProductionStageStatus, SurveyStatus, TaskStatus } from '@prisma/client'
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
    select: { id: true, title: true, status: true, editorId: true }
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
    paymentRecords,
    productionStages,
    productionStagePages,
    scopedPeriods,
    contractVersions,
    linkedContracts
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
    prisma.paymentRecord.count({ where: { seriesId: { in: seriesIds } } }),
    prisma.productionStage.findMany({ where: { chapterId: { in: chapterIds } } }),
    prisma.productionStagePage.findMany({ where: { pageId: { in: pageIds } } }),
    prisma.surveyPeriod.findMany({ where: { createdBy: { in: userIds } } }),
    prisma.contractVersion.count({ where: { contract: { seriesId: { in: seriesIds } } } }),
    prisma.contract.count({
      where: { seriesId: { in: seriesIds }, boardDecisionId: { isSet: true } }
    })
  ])

  const taskRows = await prisma.task.findMany({
    where: { pageId: { in: pageIds } },
    select: { id: true, pageId: true, stageId: true, taskType: true, description: true }
  })
  const stageById = new Map(productionStages.map((stage) => [stage.id, stage]))
  const stageBoundTasks = taskRows.filter((task) => task.stageId)
  const validStageTasks = stageBoundTasks.filter((task) => {
    const stage = task.stageId ? stageById.get(task.stageId) : null
    return Boolean(stage && task.taskType && stage.taskTypes.includes(task.taskType) && task.description?.trim())
  })
  const aiRows = await prisma.aiJob.findMany({
    where: { pageId: { in: pageIds }, status: AiJobStatus.SUCCEEDED },
    select: {
      sourceStageId: true,
      sourceFileKey: true,
      sourceRevision: true,
      sourceWidth: true,
      sourceHeight: true,
      appliedAt: true
    }
  })
  const f1Drafts = series.filter((row) => row.title.startsWith('[DEMO F1-') && row.status === 'DRAFT')

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
    paymentRecords,
    productionStages: productionStages.length,
    activeInkingStages: productionStages.filter(
      (stage) => stage.name === 'INKING' && stage.status === ProductionStageStatus.ACTIVE
    ).length,
    productionStagePages: productionStagePages.length,
    stageBoundTasks: stageBoundTasks.length,
    validStageTasks: validStageTasks.length,
    stageBoundAiJobs: aiRows.filter(
      (job) =>
        job.sourceStageId &&
        job.sourceFileKey &&
        job.sourceRevision === 1 &&
        job.sourceWidth === 1080 &&
        job.sourceHeight === 1440
    ).length,
    unappliedSuccessfulAiJobs: aiRows.filter((job) => !job.appliedAt).length,
    scopedSurveyPeriods: scopedPeriods.filter(
      (period) => period.magazine && period.publicationType && period.eligibleSeriesIds.length > 0
    ).length,
    unassignedFlowOneDrafts: f1Drafts.filter((series) => !series.editorId).length,
    contractVersions,
    linkedContracts
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
  expectAtLeast(failures, 'unappliedSuccessfulAiJobs', checks.unappliedSuccessfulAiJobs, DEMO_ITERATIONS)
  expectAtLeast(failures, 'stageBoundAiJobs', checks.stageBoundAiJobs, DEMO_ITERATIONS)
  expectAtLeast(failures, 'activeInkingStages', checks.activeInkingStages, DEMO_ITERATIONS)
  expectAtLeast(failures, 'productionStagePages', checks.productionStagePages, DEMO_ITERATIONS * 3)
  expectAtLeast(failures, 'stageBoundTasks', checks.stageBoundTasks, DEMO_ITERATIONS * 3)
  expectAtLeast(failures, 'validStageTasks', checks.validStageTasks, checks.stageBoundTasks)
  expectAtLeast(failures, 'reflectedPeriods', checks.reflectedPeriods, DEMO_HISTORY_DAYS)
  expectAtLeast(failures, 'closedPeriods', checks.closedPeriods, DEMO_ITERATIONS)
  expectAtLeast(failures, 'openPeriods', checks.openPeriods, 1)
  expectAtLeast(
    failures,
    'scopedSurveyPeriods',
    checks.scopedSurveyPeriods,
    checks.reflectedPeriods + checks.closedPeriods + checks.openPeriods
  )
  expectAtLeast(failures, 'rankingRecords', checks.rankingRecords, DEMO_HISTORY_DAYS * (DEMO_ITERATIONS + 1))
  expectAtLeast(failures, 'pendingBoardDecisions', checks.pendingBoardDecisions, DEMO_ITERATIONS)
  expectAtLeast(failures, 'draftContracts', checks.draftContracts, DEMO_ITERATIONS)
  expectAtLeast(failures, 'fullyExecutedContracts', checks.fullyExecutedContracts, DEMO_ITERATIONS + 1)
  expectAtLeast(failures, 'paymentConditions', checks.paymentConditions, (DEMO_ITERATIONS + 1) * 2)
  expectAtLeast(failures, 'paymentRecords', checks.paymentRecords, (DEMO_ITERATIONS + 1) * 2)
  expectAtLeast(failures, 'unassignedFlowOneDrafts', checks.unassignedFlowOneDrafts, DEMO_ITERATIONS)
  expectAtLeast(
    failures,
    'contractVersions',
    checks.contractVersions,
    checks.fullyExecutedContracts + checks.draftContracts
  )
  expectAtLeast(
    failures,
    'linkedContracts',
    checks.linkedContracts,
    checks.fullyExecutedContracts + checks.draftContracts
  )

  return { checks, failures }
}

const expectAtLeast = (failures: string[], name: string, actual: number, minimum: number) => {
  if (actual < minimum) failures.push(`${name}: expected >= ${minimum}, received ${actual}`)
}
