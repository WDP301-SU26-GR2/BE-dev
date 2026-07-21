import { Logger } from '@nestjs/common'
import {
  AiJobStatus,
  AiJobType,
  AiSegmentMode,
  BoardDecisionResult,
  BoardSessionPhase,
  BoardSessionStatus,
  ConditionType,
  ContractStatus,
  ContractType,
  DecisionType,
  Demographic,
  Genre,
  ManuscriptStatus,
  NameKind,
  NameStatus,
  PageStatus,
  PaymentConditionStatus,
  PaymentRecordStatus,
  PaymentSource,
  PaymentType,
  PrismaClient,
  ProposalStatus,
  PublicationType,
  ReaderAuthMethod,
  RegionType,
  RiskLevel,
  RoleCode,
  SeriesStatus,
  Specialization,
  StudioAssignmentStatus,
  SurveyStatus,
  TaskStatus,
  TaskVersionReviewStatus,
  VotingAuthMode
} from '@prisma/client'
import { createHash } from 'crypto'
import {
  DEMO_ACCOUNTS,
  DEMO_HISTORY_DAYS,
  DEMO_ITERATIONS,
  DEMO_SPECIALIZATIONS,
  FLOW_ONE_TITLES,
  FLOW_SIX_TITLES,
  TASK_INSTRUCTIONS
} from './demo-data'
import { SeededAccount, SeededMedia } from './demo-db'

const logger = new Logger('DemoSeed')
const DAY = 86_400_000

export interface DemoSeedSummary {
  accounts: number
  media: number
  series: number
  chapters: number
  pages: number
  tasks: number
  aiJobs: number
  surveyPeriods: number
  rankingRecords: number
  boardDecisions: number
  contracts: number
  paymentConditions: number
  paymentRecords: number
}

interface DemoContext {
  prisma: PrismaClient
  accounts: Map<string, SeededAccount>
  media: Map<string, SeededMedia>
  now: Date
}

interface SeriesSeed {
  id: string
  mangakaId: string
  editorId: string
  title: string
}

export const seedDemoBusinessData = async (
  prisma: PrismaClient,
  accounts: Map<string, SeededAccount>,
  media: Map<string, SeededMedia>
): Promise<DemoSeedSummary> => {
  const context: DemoContext = { prisma, accounts, media, now: new Date() }
  await seedConfigs(context)
  await seedProfiles(context)

  const flowOneSeries = await seedFlowOne(context)
  const hero = await seedProductionHero(context)
  const contractSeries = await seedContractRuns(context)
  const rankingRoster = await seedRankingRoster(context)
  const rankingSeries = [hero, ...rankingRoster]

  await seedRankingsAndVoting(context, rankingSeries)
  await seedLifecycleBoard(context, rankingRoster)
  await seedPortfolioMetadata(context, hero, contractSeries)
  await seedNotifications(context, flowOneSeries, hero)

  const summary = await buildSummary(context)
  logger.log(`Demo business data created: ${JSON.stringify(summary)}`)
  return summary
}

const seedConfigs = async ({ prisma, accounts }: DemoContext) => {
  const adminId = requiredAccount(accounts, 'editor.naomi').id
  const appConfig = await prisma.appConfig.findFirst()
  if (appConfig) {
    await prisma.appConfig.update({
      where: { id: appConfig.id },
      data: {
        coOwnerApprovalGraceDays: 7,
        nameMaxReviewRounds: 8,
        reputationRecommendThreshold: 4,
        hiatusTooLongDays: 30,
        lowVoteReliabilityThreshold: 10,
        maxUploadBytes: 15 * 1024 * 1024,
        assignmentGraceDays: 2
      }
    })
  } else {
    await prisma.appConfig.create({ data: { updatedBy: adminId } })
  }

  const voting = await prisma.votingConfig.findFirst()
  const votingData = {
    updatedBy: adminId,
    authMode: VotingAuthMode.OTP,
    maxSeriesPerVote: 3,
    otpExpirySeconds: 300,
    otpMaxAttempts: 3,
    ipRateLimit: 10,
    phoneRateLimit: 3,
    captchaThreshold: 0.3,
    otpCooldownSeconds: 60,
    ipVotesPerPeriod: 10
  }
  if (voting) await prisma.votingConfig.update({ where: { id: voting.id }, data: votingData })
  else await prisma.votingConfig.create({ data: votingData })

  const board = await prisma.boardConfig.findFirst({ where: { isDefault: true } })
  const boardData = { updatedBy: adminId, boardTotalMembers: 5, quorumMin: 3, approveMajorityRatio: 0.5 }
  if (board) await prisma.boardConfig.update({ where: { id: board.id }, data: boardData })
  else await prisma.boardConfig.create({ data: { ...boardData, isDefault: true } })
}

const seedProfiles = async ({ prisma, accounts, media, now }: DemoContext) => {
  const mangakas = DEMO_ACCOUNTS.filter((account) => account.role === RoleCode.MANGAKA)
  const assistants = DEMO_ACCOUNTS.filter((account) => account.role === RoleCode.ASSISTANT)
  const staff = DEMO_ACCOUNTS.filter(
    (account) => account.role === RoleCode.EDITOR || account.role === RoleCode.BOARD_MEMBER
  )
  const rough = requiredMedia(media, 'rough-drafting').key
  const line = requiredMedia(media, 'finished-line-art').key
  const hokusai = requiredMedia(media, 'hokusai-sketchbook').key
  const liveDrawing = requiredMedia(media, 'mangaka-live-drawing').key

  for (const [index, input] of mangakas.entries()) {
    const user = requiredAccount(accounts, input.alias)
    await prisma.mangakaProfile.create({
      data: {
        userId: user.id,
        penName: ['Aki Mori', 'R.T. Hoshi', 'Sora N.'][index],
        genres: index === 0 ? [Genre.ACTION, Genre.FANTASY] : [Genre.DRAMA, Genre.MYSTERY],
        experienceLevel: index === 0 ? 'SENIOR' : 'MID',
        bio: 'Demo persona cho quy trình sáng tác manga. Portfolio dùng tác phẩm có license mở trong manifest.',
        portfolioFiles: [rough, line, hokusai, liveDrawing],
        reputationScore: 4.4 - index * 0.1,
        ratingAvg: 4.6 - index * 0.1,
        ratingCount: 8 - index,
        isRecommended: true
      }
    })
  }

  for (const [index, input] of assistants.entries()) {
    const user = requiredAccount(accounts, input.alias)
    await prisma.assistantProfile.create({
      data: {
        userId: user.id,
        specializations: [...DEMO_SPECIALIZATIONS[index]],
        experienceLevel: index < 2 ? 'SENIOR' : index < 5 ? 'MID' : 'JUNIOR',
        portfolioFiles: [line, requiredMedia(media, 'three-production-versions').key],
        availabilityStatus: index === 5 ? 'BUSY' : 'AVAILABLE',
        availabilityFrom: new Date(now.getTime() - 7 * DAY),
        availabilityTo: new Date(now.getTime() + 45 * DAY),
        reputationScore: 4.55 - index * 0.08,
        ratingAvg: 4.7 - index * 0.08,
        ratingCount: 12 - index,
        isRecommended: index < 5
      }
    })
  }

  for (const [index, input] of staff.entries()) {
    const user = requiredAccount(accounts, input.alias)
    await prisma.staffProfile.create({
      data: {
        userId: user.id,
        specialtyGenres: index % 2 === 0 ? [Genre.ACTION, Genre.FANTASY] : [Genre.DRAMA, Genre.MYSTERY],
        demographics: index < 4 ? [Demographic.SHONEN, Demographic.SEINEN] : [Demographic.SHOJO],
        bio: input.role === RoleCode.EDITOR ? 'Tantou Editor phụ trách demo production.' : 'Editorial Board demo.',
        yearsOfExperience: 5 + index * 2
      }
    })
  }
}

const seedFlowOne = async (context: DemoContext) => {
  const { accounts } = context
  const mangakas = ['mangaka.akari', 'mangaka.ren', 'mangaka.sora'].map((alias) => requiredAccount(accounts, alias))
  const editor = requiredAccount(accounts, 'editor.naomi')
  const result: SeriesSeed[] = []

  for (let index = 0; index < DEMO_ITERATIONS; index += 1) {
    const mangaka = mangakas[index % mangakas.length]
    result.push(
      await createSeriesWithProposal(context, {
        title: `[DEMO F1-${pad(index + 1)}] ${FLOW_ONE_TITLES[index]}`,
        mangakaId: mangaka.id,
        editorId: editor.id,
        seriesStatus: SeriesStatus.DRAFT,
        proposalStatus: ProposalStatus.DRAFT,
        nameStatus: NameStatus.DRAFT,
        nameVersion: 1,
        synopsis: `${FLOW_ONE_TITLES[index]} theo chân một nhóm nhân vật trẻ đối mặt với lựa chọn giữa truyền thống và công nghệ. Hồ sơ số ${index + 1} dành cho demo Flow 1 trọn vẹn.`
      })
    )
  }

  const showcaseStates: Array<{
    suffix: string
    seriesStatus: SeriesStatus
    proposalStatus: ProposalStatus
    nameStatus: NameStatus
    assigned: boolean
  }> = [
    {
      suffix: 'Queue — chờ Editor claim',
      seriesStatus: SeriesStatus.IN_REVIEW,
      proposalStatus: ProposalStatus.PROPOSAL_REVIEW,
      nameStatus: NameStatus.SUBMITTED,
      assigned: false
    },
    {
      suffix: 'Proposal cần sửa',
      seriesStatus: SeriesStatus.IN_REVIEW,
      proposalStatus: ProposalStatus.PROPOSAL_REVISION,
      nameStatus: NameStatus.IN_REVIEW,
      assigned: true
    },
    {
      suffix: 'Name cần sửa vòng 3',
      seriesStatus: SeriesStatus.IN_REVIEW,
      proposalStatus: ProposalStatus.PROPOSAL_APPROVED,
      nameStatus: NameStatus.REVISION,
      assigned: true
    },
    {
      suffix: 'Sẵn sàng pitch',
      seriesStatus: SeriesStatus.READY_TO_PITCH,
      proposalStatus: ProposalStatus.PROPOSAL_APPROVED,
      nameStatus: NameStatus.APPROVED,
      assigned: true
    }
  ]
  for (const [index, state] of showcaseStates.entries()) {
    await createSeriesWithProposal(context, {
      title: `[DEMO F1-SHOWCASE-${index + 1}] ${state.suffix}`,
      mangakaId: mangakas[index % mangakas.length].id,
      editorId: state.assigned ? editor.id : undefined,
      seriesStatus: state.seriesStatus,
      proposalStatus: state.proposalStatus,
      nameStatus: state.nameStatus,
      nameVersion: index + 1,
      synopsis: `Bản showcase trạng thái: ${state.suffix}.`
    })
  }
  return result
}

const seedProductionHero = async (context: DemoContext): Promise<SeriesSeed> => {
  const mangaka = requiredAccount(context.accounts, 'mangaka.akari')
  const editor = requiredAccount(context.accounts, 'editor.naomi')
  const hero = await createSeriesWithProposal(context, {
    title: '[DEMO F2-F3] Neon Ronin: Echoes of Edo',
    mangakaId: mangaka.id,
    editorId: editor.id,
    seriesStatus: SeriesStatus.SERIALIZED,
    proposalStatus: ProposalStatus.APPROVED,
    nameStatus: NameStatus.APPROVED,
    nameVersion: 5,
    synopsis:
      'Một kiếm sĩ bảo vệ ký ức của Edo trong Tokyo tương lai. Series chính để demo Name → Page → Region → Task → Manuscript.'
  })
  await context.prisma.series.update({
    where: { id: hero.id },
    data: { publicationType: PublicationType.WEEKLY, magazine: 'Manga Nexus Weekly', startIssueNumber: 101 }
  })

  await createExecutedContract(context, hero)
  for (let chapterNumber = 1; chapterNumber <= 8; chapterNumber += 1) {
    await createChapterBundle(context, hero, {
      chapterNumber,
      title: `Arc mở đầu — Chương ${chapterNumber}`,
      nameStatus: NameStatus.APPROVED,
      manuscriptStatus: ManuscriptStatus.PUBLISHED,
      pageStatus: PageStatus.COMPLETED,
      pageCount: 4,
      publishedAt: new Date(context.now.getTime() - (30 - chapterNumber) * DAY)
    })
  }

  for (let index = 0; index < DEMO_ITERATIONS; index += 1) {
    await createChapterBundle(context, hero, {
      chapterNumber: 101 + index,
      title: `[DEMO F2-${pad(index + 1)}] Name review run`,
      nameStatus: NameStatus.SUBMITTED,
      manuscriptStatus: ManuscriptStatus.DRAFT,
      pageCount: 0
    })
  }

  const workshop = await createChapterBundle(context, hero, {
    chapterNumber: 50,
    title: '[DEMO F3] Workshop — 10 trang phân việc song song',
    nameStatus: NameStatus.APPROVED,
    manuscriptStatus: ManuscriptStatus.IN_PRODUCTION,
    pageStatus: PageStatus.DRAFT,
    pageCount: DEMO_ITERATIONS
  })
  await seedStudioAndTasks(context, hero, workshop.pageIds)

  await createChapterBundle(context, hero, {
    chapterNumber: 51,
    title: '[DEMO F2] Bản thảo đang chờ Editor',
    nameStatus: NameStatus.APPROVED,
    manuscriptStatus: ManuscriptStatus.EDITOR_REVIEW,
    pageStatus: PageStatus.COMPLETED,
    pageCount: 4
  })
  const revision = await createChapterBundle(context, hero, {
    chapterNumber: 52,
    title: '[DEMO F2] Editor trả sửa bản thảo',
    nameStatus: NameStatus.APPROVED,
    manuscriptStatus: ManuscriptStatus.EDITOR_REVISION,
    pageStatus: PageStatus.REVISING,
    pageCount: 4
  })
  await context.prisma.revisionRequest.create({
    data: {
      targetType: 'MANUSCRIPT',
      targetId: revision.chapter.id,
      seriesId: hero.id,
      round: 2,
      reason: 'Trang 2 cần rút gọn thoại và tăng khoảng lặng trước cliffhanger.',
      requestedBy: editor.id,
      recipientId: mangaka.id
    }
  })
  await context.prisma.annotation.create({
    data: {
      authorId: editor.id,
      targetType: 'PAGE',
      targetId: revision.pageIds[1],
      coordinates: { x: 720, y: 130, width: 390, height: 240 },
      reviewStage: 'EDITOR',
      authorRole: 'EDITOR',
      annotationType: 'HIGHLIGHT',
      content: 'Rút gọn bubble này còn một câu, giữ nhịp chuyển cảnh.'
    }
  })
  await createChapterBundle(context, hero, {
    chapterNumber: 53,
    title: '[DEMO F2] Sẵn sàng xuất bản',
    nameStatus: NameStatus.APPROVED,
    manuscriptStatus: ManuscriptStatus.READY_FOR_PRINT,
    pageStatus: PageStatus.COMPLETED,
    pageCount: 4
  })
  return hero
}

const seedContractRuns = async (context: DemoContext) => {
  const mangakas = ['mangaka.ren', 'mangaka.sora'].map((alias) => requiredAccount(context.accounts, alias))
  const editor = requiredAccount(context.accounts, 'editor.duc')
  const result: SeriesSeed[] = []

  for (let index = 0; index < DEMO_ITERATIONS; index += 1) {
    const mangaka = mangakas[index % mangakas.length]
    const series = await createSeriesWithProposal(context, {
      title: `[DEMO F6-${pad(index + 1)}] ${FLOW_SIX_TITLES[index]}`,
      mangakaId: mangaka.id,
      editorId: editor.id,
      seriesStatus: SeriesStatus.SERIALIZED,
      proposalStatus: ProposalStatus.APPROVED,
      nameStatus: NameStatus.APPROVED,
      nameVersion: 4,
      synopsis: `${FLOW_SIX_TITLES[index]} đã được Board thông qua, sẵn sàng demo soạn và thương lượng hợp đồng lần ${index + 1}.`
    })
    await context.prisma.series.update({
      where: { id: series.id },
      data: {
        publicationType: index % 3 === 0 ? PublicationType.MONTHLY : PublicationType.WEEKLY,
        magazine: index % 3 === 0 ? 'Manga Nexus Monthly' : 'Manga Nexus Weekly',
        startIssueNumber: 120 + index
      }
    })
    await context.prisma.contract.create({
      data: {
        seriesId: series.id,
        mangakaId: mangaka.id,
        editorId: editor.id,
        contractType: index % 4 === 0 ? ContractType.FULL_BUYOUT : ContractType.REVENUE_SHARE,
        valuationAmount: 180_000_000 + index * 15_000_000,
        publisherOwnershipPct: index % 4 === 0 ? 100 : 70,
        mangakaOwnershipPct: index % 4 === 0 ? 0 : 30,
        terminationClause: 'Các mốc đã đạt vẫn được thanh toán; compensation theo phụ lục demo.',
        contractStart: new Date(context.now.getTime() + 7 * DAY),
        contractEnd: new Date(context.now.getTime() + 730 * DAY),
        status: ContractStatus.DRAFT
      }
    })
    result.push(series)
  }
  return result
}

const seedRankingRoster = async (context: DemoContext) => {
  const mangakas = ['mangaka.akari', 'mangaka.ren', 'mangaka.sora'].map((alias) =>
    requiredAccount(context.accounts, alias)
  )
  const editors = ['editor.naomi', 'editor.duc'].map((alias) => requiredAccount(context.accounts, alias))
  const result: SeriesSeed[] = []

  for (let index = 0; index < DEMO_ITERATIONS; index += 1) {
    const mangaka = mangakas[index % mangakas.length]
    const editor = editors[index % editors.length]
    const series = await createSeriesWithProposal(context, {
      title: `[DEMO RANK-${pad(index + 1)}] Biên niên sử ${pad(index + 1)}`,
      mangakaId: mangaka.id,
      editorId: editor.id,
      seriesStatus: SeriesStatus.SERIALIZED,
      proposalStatus: ProposalStatus.APPROVED,
      nameStatus: NameStatus.APPROVED,
      nameVersion: 5,
      synopsis: `Series đã ký hợp đồng và xuất bản đủ 8 chương, dùng cho ranking 14 kỳ và Board lifecycle lần ${index + 1}.`
    })
    await context.prisma.series.update({
      where: { id: series.id },
      data: {
        publicationType: index % 3 === 0 ? PublicationType.MONTHLY : PublicationType.WEEKLY,
        magazine: index % 3 === 0 ? 'Manga Nexus Monthly' : 'Manga Nexus Weekly',
        startIssueNumber: 80 + index
      }
    })
    await createExecutedContract(context, series)
    for (let chapterNumber = 1; chapterNumber <= 8; chapterNumber += 1) {
      await createChapterBundle(context, series, {
        chapterNumber,
        title: `Biên niên sử ${pad(index + 1)} — Chương ${chapterNumber}`,
        nameStatus: NameStatus.APPROVED,
        manuscriptStatus: ManuscriptStatus.PUBLISHED,
        pageStatus: PageStatus.COMPLETED,
        pageCount: 1,
        publishedAt: new Date(context.now.getTime() - (80 - chapterNumber - index) * DAY)
      })
    }
    result.push(series)
  }
  return result
}

const seedStudioAndTasks = async (context: DemoContext, hero: SeriesSeed, pageIds: string[]) => {
  const mangaka = requiredAccount(context.accounts, 'mangaka.akari')
  const assistants = DEMO_ACCOUNTS.filter((account) => account.role === RoleCode.ASSISTANT).map((account) =>
    requiredAccount(context.accounts, account.alias)
  )
  const referenceAssetIds = [
    requiredMedia(context.media, 'hokusai-sketchbook').id,
    requiredMedia(context.media, 'hokusai-sketchbook').id,
    requiredMedia(context.media, 'three-production-versions').id
  ]

  for (const [index, assistant] of assistants.entries()) {
    await context.prisma.collaborationInvite.create({
      data: {
        mangakaId: mangaka.id,
        assistantId: assistant.id,
        seriesId: hero.id,
        hireStart: new Date(context.now.getTime() - 14 * DAY),
        hireEnd: new Date(context.now.getTime() + 45 * DAY),
        taskTypes: [...DEMO_SPECIALIZATIONS[index]],
        status: 'ACCEPTED'
      }
    })
    await context.prisma.studioAssignment.create({
      data: {
        mangakaId: mangaka.id,
        assistantId: assistant.id,
        seriesId: hero.id,
        hireStart: new Date(context.now.getTime() - 14 * DAY),
        hireEnd: new Date(context.now.getTime() + 45 * DAY),
        assignedTaskTypes: [...DEMO_SPECIALIZATIONS[index]],
        status: StudioAssignmentStatus.ACTIVE
      }
    })
  }

  const specializations = Object.values(Specialization)
  for (const [index, pageId] of pageIds.entries()) {
    const primaryType = specializations[index % specializations.length]
    const secondaryType = specializations[(index + 2) % specializations.length]
    const assistant = assistants[index % assistants.length]
    const secondAssistant = assistants[(index + 1) % assistants.length]
    const manualRegion = await context.prisma.region.create({
      data: {
        pageId,
        coordinates: { x: 52, y: 112, width: 650, height: 590 },
        regionType: index % 2 === 0 ? RegionType.BACKGROUND : RegionType.PANEL,
        createdBy: 'MANUAL',
        confirmedByMangaka: true
      }
    })
    const aiRegion = await context.prisma.region.create({
      data: {
        pageId,
        coordinates: { x: 725, y: 140, width: 425, height: 395 },
        regionType: index % 3 === 0 ? RegionType.SPEECH_BUBBLE : RegionType.CHARACTER,
        detectedSubtype: index % 3 === 0 ? 'speech-bubble' : 'character',
        createdBy: 'AI',
        confirmedByMangaka: index % 2 === 0,
        confidenceScore: 0.86 + (index % 5) * 0.02,
        aiModelVersion: 'demo-manga109-yolo-v1'
      }
    })
    await context.prisma.aiJob.create({
      data: {
        type: AiJobType.SEGMENT,
        mode: index % 2 === 0 ? AiSegmentMode.MODEL : AiSegmentMode.HEURISTIC,
        pageId,
        requestedBy: mangaka.id,
        status: AiJobStatus.SUCCEEDED,
        modelVersion: index % 2 === 0 ? 'demo-manga109-yolo-v1' : 'opencv-heuristic-v1',
        proposedRegions: [
          {
            regionType: 'BACKGROUND',
            detectedSubtype: 'background',
            coordinates: { x: 52, y: 112, width: 650, height: 590 },
            confidenceScore: 0.93
          },
          {
            regionType: 'CHARACTER',
            detectedSubtype: 'character',
            coordinates: { x: 725, y: 140, width: 425, height: 395 },
            confidenceScore: 0.88
          }
        ],
        regionCount: 2,
        appliedAt: new Date(context.now.getTime() - index * 3_600_000),
        startedAt: new Date(context.now.getTime() - index * 3_600_000 - 2_200),
        finishedAt: new Date(context.now.getTime() - index * 3_600_000),
        durationMs: 2200
      }
    })

    await context.prisma.task.create({
      data: {
        pageId,
        regionIds: [manualRegion.id],
        assistantId: assistant.id,
        taskType: primaryType,
        status: TaskStatus.ASSIGNED,
        priority: 10 - index,
        deadline: new Date(context.now.getTime() + (2 + index) * DAY),
        assetIds: referenceAssetIds,
        statusReason: TASK_INSTRUCTIONS[primaryType],
        groupId: `demo-assigned-${pad(index + 1)}`,
        groupTitle: `[DEMO F3-${pad(index + 1)}] Task sẵn sàng bắt đầu`,
        versions: []
      }
    })
    const submitted = await context.prisma.task.create({
      data: {
        pageId,
        regionIds: [aiRegion.id],
        assistantId: secondAssistant.id,
        taskType: secondaryType,
        status: TaskStatus.SUBMITTED,
        priority: 5,
        deadline: new Date(context.now.getTime() + (3 + index) * DAY),
        assetIds: referenceAssetIds,
        statusReason: TASK_INSTRUCTIONS[secondaryType],
        groupId: `demo-review-${pad(index + 1)}`,
        groupTitle: `[DEMO F3-${pad(index + 1)}] Task chờ Mangaka review`,
        versions: [
          {
            submittedBy: secondAssistant.id,
            versionNumber: 1,
            file: requiredMedia(context.media, 'cleaned-lettering-page').key,
            reviewStatus: TaskVersionReviewStatus.PENDING,
            submittedAt: new Date(context.now.getTime() - 4 * 3_600_000)
          }
        ]
      }
    })
    const revision = await context.prisma.task.create({
      data: {
        pageId,
        regionIds: [manualRegion.id, aiRegion.id],
        assistantId: assistant.id,
        taskType: Specialization.LETTERING,
        status: TaskStatus.REVISION_REQUESTED,
        priority: 8,
        deadline: new Date(context.now.getTime() + (1 + index) * DAY),
        assetIds: referenceAssetIds,
        statusReason: 'Giảm kích thước font SFX, giữ thứ tự đọc RTL và chừa safe margin.',
        groupId: `demo-revision-${pad(index + 1)}`,
        groupTitle: `[DEMO F3-${pad(index + 1)}] Task cần sửa version 2`,
        versions: [
          {
            submittedBy: assistant.id,
            versionNumber: 1,
            file: requiredMedia(context.media, 'cleaned-lettering-page').key,
            reviewStatus: TaskVersionReviewStatus.REVISION_REQUESTED,
            reviewerNote: 'Bubble cuối che nét mặt nhân vật; dời lên 24 px.',
            submittedAt: new Date(context.now.getTime() - 2 * DAY)
          },
          {
            submittedBy: assistant.id,
            versionNumber: 2,
            file: requiredMedia(context.media, 'scanlated-page').key,
            reviewStatus: TaskVersionReviewStatus.REVISION_REQUESTED,
            reviewerNote: 'Đúng vị trí, cần giảm cỡ SFX thêm 10%.',
            submittedAt: new Date(context.now.getTime() - DAY)
          }
        ]
      }
    })
    await context.prisma.annotation.create({
      data: {
        taskId: submitted.id,
        authorId: mangaka.id,
        targetType: 'TASK',
        targetId: submitted.id,
        coordinates: { x: 775, y: 252, width: 300, height: 225 },
        reviewStage: 'MANGAKA',
        authorRole: 'MANGAKA',
        annotationType: 'HIGHLIGHT',
        content: 'Kiểm tra vùng này: nền cần tối hơn để tách silhouette.'
      }
    })
    await context.prisma.revisionRequest.create({
      data: {
        targetType: 'TASK',
        targetId: revision.id,
        round: 2,
        reason: 'Giảm cỡ SFX thêm 10% và giữ safe margin.',
        requestedBy: mangaka.id,
        recipientId: assistant.id
      }
    })
  }
}

const seedRankingsAndVoting = async (context: DemoContext, series: SeriesSeed[]) => {
  const creator = requiredAccount(context.accounts, 'editor.duc')
  const atRiskIds = new Set(series.slice(-3).map((row) => row.id))
  let previous = new Map<string, number>()

  for (let periodIndex = 0; periodIndex < DEMO_HISTORY_DAYS; periodIndex += 1) {
    const period = await context.prisma.surveyPeriod.create({
      data: {
        createdBy: creator.id,
        issueNumber: 200 + periodIndex,
        reflectedIssueNumber: 192 + periodIndex,
        startDate: new Date(context.now.getTime() - (DEMO_HISTORY_DAYS - periodIndex + 1) * DAY),
        endDate: new Date(context.now.getTime() - (DEMO_HISTORY_DAYS - periodIndex) * DAY),
        status: SurveyStatus.REFLECTED
      }
    })
    const healthy = series.filter((row) => !atRiskIds.has(row.id))
    const risky = series.filter((row) => atRiskIds.has(row.id))
    const ordered = [
      ...healthy.slice(periodIndex % healthy.length),
      ...healthy.slice(0, periodIndex % healthy.length),
      ...risky
    ]
    const current = new Map<string, number>()
    await context.prisma.rankingRecord.createMany({
      data: ordered.map((row, index) => {
        const rank = index + 1
        current.set(row.id, rank)
        const old = previous.get(row.id)
        const consecutive = atRiskIds.has(row.id) ? periodIndex + 1 : 0
        return {
          surveyPeriodId: period.id,
          seriesId: row.id,
          rankPosition: rank,
          voteCount: 2450 - index * 165 + periodIndex * 12,
          previousRank: old ?? null,
          rankChange: old ? old - rank : null,
          isAtRisk: atRiskIds.has(row.id),
          riskLevel: !atRiskIds.has(row.id)
            ? RiskLevel.NONE
            : consecutive >= 5
              ? RiskLevel.SEVERE
              : consecutive >= 3
                ? RiskLevel.MEDIUM
                : RiskLevel.LOW,
          consecutiveAtRiskCount: consecutive,
          isReliable: true,
          recordedAt: new Date(context.now.getTime() - (DEMO_HISTORY_DAYS - periodIndex) * DAY)
        }
      })
    })
    previous = current
  }

  for (let index = 0; index < DEMO_ITERATIONS; index += 1) {
    const period = await context.prisma.surveyPeriod.create({
      data: {
        createdBy: creator.id,
        issueNumber: 300 + index,
        reflectedIssueNumber: 292 + index,
        startDate: new Date(context.now.getTime() - (index + 2) * DAY),
        endDate: new Date(context.now.getTime() - (index + 1) * DAY),
        status: SurveyStatus.CLOSED
      }
    })
    await context.prisma.surveyData.create({
      data: {
        surveyPeriodId: period.id,
        importedBy: creator.id,
        surveyDate: new Date(context.now.getTime() - DAY),
        entries: series.map((row, seriesIndex) => ({ seriesId: row.id, voteCount: 80 + index * 7 + seriesIndex * 11 }))
      }
    })
    for (let voteIndex = 0; voteIndex < 5; voteIndex += 1) {
      await context.prisma.readerVote.create({
        data: {
          surveyPeriodId: period.id,
          seriesIds: [
            series[(voteIndex + index) % series.length].id,
            series[(voteIndex + index + 1) % series.length].id
          ],
          identityHash: hash(`demo-voter-${index}-${voteIndex}`),
          publicationType: PublicationType.WEEKLY,
          authMethod: ReaderAuthMethod.EMAIL_OTP,
          ipHash: hash(`203.0.113.${20 + voteIndex}`),
          captchaScore: voteIndex === 4 ? 0.55 : 0.91,
          voteWeight: voteIndex === 4 ? 0.5 : 1,
          isFlagged: voteIndex === 4
        }
      })
    }
  }

  await context.prisma.surveyPeriod.create({
    data: {
      createdBy: creator.id,
      issueNumber: 400,
      reflectedIssueNumber: 400,
      startDate: new Date(context.now.getTime() - DAY),
      endDate: new Date(context.now.getTime() + 6 * DAY),
      status: SurveyStatus.OPEN
    }
  })
}

const seedLifecycleBoard = async (context: DemoContext, targets: SeriesSeed[]) => {
  const editor = requiredAccount(context.accounts, 'editor.naomi')
  const boardIds = DEMO_ACCOUNTS.filter((account) => account.role === RoleCode.BOARD_MEMBER).map(
    (account) => requiredAccount(context.accounts, account.alias).id
  )
  const session = await context.prisma.boardSession.create({
    data: {
      title: '[DEMO F5] Hội đồng xử lý 10 series nguy cơ',
      description: 'Phiên ACTIVE/VOTING để demo quyết định CONTINUE, CHANGE_FORMAT, CANCEL hoặc COMPLETE.',
      creatorId: editor.id,
      status: BoardSessionStatus.ACTIVE,
      phase: BoardSessionPhase.VOTING,
      allowedEditorIds: boardIds,
      startTime: new Date(context.now.getTime() - 2 * 3_600_000),
      endTime: new Date(context.now.getTime() + 5 * DAY)
    }
  })

  for (const [index, target] of targets.entries()) {
    const decision = await context.prisma.boardDecision.create({
      data: {
        targetSeriesId: target.id,
        boardSessionId: session.id,
        decisionType: index % 2 === 0 ? DecisionType.CANCELLATION : DecisionType.FORMAT_CHANGE,
        result: BoardDecisionResult.PENDING,
        totalVotes: 0,
        approveCount: 0,
        rejectCount: 0,
        quorumMet: false,
        endingChapterAllowance: index % 2 === 0 ? 3 : null,
        details: {
          demoRun: index + 1,
          reason: 'Bottom 1/3 liên tục; xem ranking 14 kỳ và kế hoạch cải thiện.',
          proposedPublicationType: index % 2 === 0 ? null : 'MONTHLY'
        },
        allowedEditorIds: boardIds,
        votes: []
      }
    })
    await context.prisma.seriesReport.create({
      data: {
        seriesId: target.id,
        boardDecisionId: decision.id,
        preparedBy: target.editorId,
        reportType: 'DEFENSE',
        content:
          'Ranking giảm do arc chuyển tiếp. Kế hoạch: rút gọn arc hiện tại trong 3 chương, mở arc mới và tăng hoạt động digital.',
        attachments: [requiredMedia(context.media, 'three-production-versions').key]
      }
    })
  }
}

const seedPortfolioMetadata = async (context: DemoContext, hero: SeriesSeed, contractSeries: SeriesSeed[]) => {
  const editor = requiredAccount(context.accounts, 'editor.duc')
  await context.prisma.publicationVersion.createMany({
    data: [
      {
        seriesId: hero.id,
        language: 'JA',
        readingDirection: 'RTL',
        versionType: 'ORIGINAL',
        notes: 'Bản gốc Nhật, đọc phải sang trái.'
      },
      {
        seriesId: hero.id,
        language: 'VI',
        readingDirection: 'LTR',
        versionType: 'DIGITAL',
        notes: 'Bản demo tiếng Việt.'
      }
    ]
  })
  for (const [index, series] of contractSeries.slice(-3).entries()) {
    for (let volume = 1; volume <= 4; volume += 1) {
      await context.prisma.tankobonSales.create({
        data: {
          seriesId: series.id,
          volumeNumber: volume,
          unitsSold: 12_000 + index * 4_500 + volume * 2_300,
          period: `2026-Q${Math.min(4, volume)}`,
          recordedBy: editor.id
        }
      })
    }
  }
}

const seedNotifications = async (context: DemoContext, flowOne: SeriesSeed[], hero: SeriesSeed) => {
  const editor = requiredAccount(context.accounts, 'editor.naomi')
  const mangaka = requiredAccount(context.accounts, 'mangaka.akari')
  const rows = [
    ...flowOne.map((series, index) => ({
      recipientId: editor.id,
      type: 'REVIEW' as const,
      referenceId: series.id,
      referenceType: 'SERIES_SUBMITTED',
      content: `[DEMO ${index + 1}] Proposal mới sẵn sàng nộp và review.`
    })),
    {
      recipientId: mangaka.id,
      type: 'DEADLINE' as const,
      referenceId: hero.id,
      referenceType: 'SERIES_PRODUCTION_OVERVIEW',
      content: 'Neon Ronin có 10 trang production với task ở nhiều trạng thái để demo.'
    }
  ]
  await context.prisma.notification.createMany({
    data: rows.map((row) => ({ ...row, dedupeKey: hash(`${row.recipientId}|${row.referenceId}|${row.referenceType}`) }))
  })
}

const createSeriesWithProposal = async (
  context: DemoContext,
  input: {
    title: string
    mangakaId: string
    editorId?: string
    seriesStatus: SeriesStatus
    proposalStatus: ProposalStatus
    nameStatus: NameStatus
    nameVersion: number
    synopsis: string
  }
): Promise<SeriesSeed> => {
  const cover = requiredMedia(context.media, 'manga-page-1').key
  const rough = requiredMedia(context.media, 'rough-drafting').key
  const line = requiredMedia(context.media, 'finished-line-art').key
  const series = await context.prisma.series.create({
    data: {
      mangakaId: input.mangakaId,
      ...(input.editorId ? { editorId: input.editorId, reviewStartedAt: context.now } : {}),
      title: input.title,
      coverImage: cover,
      genres: [Genre.ACTION, Genre.FANTASY, Genre.MYSTERY],
      demographic: Demographic.SHONEN,
      status: input.seriesStatus,
      statusReason: 'Demo seed — dữ liệu có thể reset theo hướng dẫn.',
      statusHistory: [
        {
          fromStatus: 'INITIAL',
          toStatus: input.seriesStatus,
          changedBy: input.mangakaId,
          reason: 'Demo seed',
          at: context.now
        }
      ],
      proposal: {
        nameId: null,
        synopsis: input.synopsis,
        characterDesigns: [rough, line],
        estimatedLength: 60,
        status: input.proposalStatus,
        createdAt: context.now
      }
    }
  })
  const name = await context.prisma.name.create({
    data: {
      seriesId: series.id,
      chapterNumber: null,
      status: input.nameStatus,
      kind: NameKind.PROPOSAL,
      version: input.nameVersion,
      submittedAt: input.nameStatus === NameStatus.DRAFT ? null : context.now,
      pages: [
        { pageNumber: 1, fileUrl: rough },
        { pageNumber: 2, fileUrl: line },
        { pageNumber: 3, fileUrl: requiredMedia(context.media, 'hokusai-sketchbook').key }
      ]
    }
  })
  await context.prisma.series.update({
    where: { id: series.id },
    data: {
      proposal: {
        set: {
          nameId: name.id,
          synopsis: input.synopsis,
          characterDesigns: [rough, line],
          estimatedLength: 60,
          status: input.proposalStatus,
          createdAt: context.now
        }
      }
    }
  })
  return {
    id: series.id,
    mangakaId: input.mangakaId,
    editorId: input.editorId ?? requiredAccount(context.accounts, 'editor.naomi').id,
    title: input.title
  }
}

const createExecutedContract = async (context: DemoContext, series: SeriesSeed) => {
  const contract = await context.prisma.contract.create({
    data: {
      seriesId: series.id,
      mangakaId: series.mangakaId,
      editorId: series.editorId,
      contractType: ContractType.REVENUE_SHARE,
      valuationAmount: 350_000_000,
      publisherOwnershipPct: 70,
      mangakaOwnershipPct: 30,
      terminationClause: 'Mốc đã đạt vẫn trả; compensation 10% phần định giá còn lại nếu hủy không do breach.',
      contractStart: new Date(context.now.getTime() - 60 * DAY),
      contractEnd: new Date(context.now.getTime() + 720 * DAY),
      status: ContractStatus.FULLY_EXECUTED,
      mangakaSignedAt: new Date(context.now.getTime() - 58 * DAY),
      boardSignedAt: new Date(context.now.getTime() - 57 * DAY)
    }
  })
  const recurring = await context.prisma.paymentCondition.create({
    data: {
      contractId: contract.id,
      conditionType: ConditionType.RECURRING_CHAPTER,
      thresholdConfig: { everyNChapters: 4, payoutAmount: 25_000_000 },
      payoutAmount: 25_000_000,
      isRecurring: true,
      status: PaymentConditionStatus.PENDING,
      lastTriggeredValue: 8
    }
  })
  await context.prisma.paymentCondition.create({
    data: {
      contractId: contract.id,
      conditionType: ConditionType.RANKING_MILESTONE,
      thresholdConfig: { rankThreshold: 3, consecutivePeriods: 4, payoutAmount: 40_000_000 },
      payoutAmount: 40_000_000,
      status: PaymentConditionStatus.PENDING
    }
  })
  const receiver = series.mangakaId
  for (let milestone = 4; milestone <= 8; milestone += 4) {
    await context.prisma.paymentRecord.create({
      data: {
        contractId: contract.id,
        conditionId: recurring.id,
        receiverId: receiver,
        seriesId: series.id,
        description: `Thanh toán recurring khi đạt ${milestone} chương`,
        paymentType: PaymentType.RECURRING_CHAPTER,
        paymentSource: PaymentSource.CONTRACT,
        amount: 25_000_000,
        period: `chapter:${milestone}`,
        status: milestone === 4 ? PaymentRecordStatus.PAID : PaymentRecordStatus.APPROVED,
        approvedBy: requiredAccount(context.accounts, 'board.aya').id,
        approvedAt: new Date(context.now.getTime() - (12 - milestone) * DAY),
        paidAt: milestone === 4 ? new Date(context.now.getTime() - 7 * DAY) : null,
        paymentMethod: milestone === 4 ? 'BANK_TRANSFER' : null,
        transactionReference: milestone === 4 ? 'DEMO-NEON-RONIN-CH4' : null,
        createdBy: series.editorId
      }
    })
  }
  return contract
}

const createChapterBundle = async (
  context: DemoContext,
  series: SeriesSeed,
  input: {
    chapterNumber: number
    title: string
    nameStatus: NameStatus
    manuscriptStatus: ManuscriptStatus
    pageStatus?: PageStatus
    pageCount: number
    publishedAt?: Date
  }
) => {
  const chapter = await context.prisma.chapter.create({
    data: {
      seriesId: series.id,
      chapterNumber: input.chapterNumber,
      title: input.title,
      totalPages: input.pageCount,
      status:
        input.manuscriptStatus === ManuscriptStatus.PUBLISHED
          ? 'PUBLISHED'
          : input.manuscriptStatus === ManuscriptStatus.DRAFT
            ? 'DRAFT'
            : 'IN_PRODUCTION',
      publishedAt: input.publishedAt ?? null
    }
  })
  const name = await context.prisma.name.create({
    data: {
      seriesId: series.id,
      chapterId: chapter.id,
      chapterNumber: input.chapterNumber,
      status: input.nameStatus,
      kind: NameKind.CHAPTER,
      version: input.nameStatus === NameStatus.APPROVED ? 3 : 1,
      submittedAt: context.now,
      pages: [
        { pageNumber: 1, fileUrl: requiredMedia(context.media, 'rough-drafting').key },
        { pageNumber: 2, fileUrl: requiredMedia(context.media, 'finished-line-art').key }
      ]
    }
  })
  await context.prisma.chapter.update({ where: { id: chapter.id }, data: { nameId: name.id } })
  await context.prisma.manuscript.create({
    data: {
      chapterId: chapter.id,
      status: input.manuscriptStatus,
      finalFile:
        input.manuscriptStatus === ManuscriptStatus.PUBLISHED
          ? requiredMedia(context.media, 'scanlated-page').key
          : null,
      submittedToEditorAt:
        input.manuscriptStatus === ManuscriptStatus.EDITOR_REVIEW ||
        input.manuscriptStatus === ManuscriptStatus.EDITOR_REVISION ||
        input.manuscriptStatus === ManuscriptStatus.READY_FOR_PRINT ||
        input.manuscriptStatus === ManuscriptStatus.PUBLISHED
          ? new Date(context.now.getTime() - DAY)
          : null,
      approvedAt:
        input.manuscriptStatus === ManuscriptStatus.READY_FOR_PRINT ||
        input.manuscriptStatus === ManuscriptStatus.PUBLISHED
          ? context.now
          : null,
      statusHistory: [
        {
          from: null,
          to: input.manuscriptStatus,
          changedBy: series.mangakaId,
          reason: 'Demo seed',
          changedAt: context.now
        }
      ]
    }
  })
  await context.prisma.schedule.create({
    data: {
      chapterId: chapter.id,
      originalDeadline: new Date(context.now.getTime() + 7 * DAY),
      currentDeadline: new Date(context.now.getTime() + 7 * DAY),
      extended: false,
      extensions: []
    }
  })
  const pageIds: string[] = []
  for (let pageNumber = 1; pageNumber <= input.pageCount; pageNumber += 1) {
    const source = requiredMedia(context.media, `manga-page-${((pageNumber - 1) % 4) + 1}`)
    const page = await context.prisma.page.create({
      data: {
        chapterId: chapter.id,
        pageNumber,
        originalFile: source.key,
        compositeFile:
          input.pageStatus === PageStatus.COMPLETED || input.pageStatus === PageStatus.REVISING
            ? requiredMedia(context.media, 'scanlated-page').key
            : null,
        status: input.pageStatus ?? PageStatus.DRAFT
      }
    })
    pageIds.push(page.id)
  }
  return { chapter, name, pageIds }
}

const buildSummary = async ({ prisma }: DemoContext): Promise<DemoSeedSummary> => {
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

const requiredAccount = (accounts: Map<string, SeededAccount>, alias: string) => {
  const account = accounts.get(alias)
  if (!account) throw new Error(`Missing demo account ${alias}`)
  return account
}

const requiredMedia = (media: Map<string, SeededMedia>, slug: string) => {
  const item = media.get(slug)
  if (!item) throw new Error(`Missing demo media ${slug}`)
  return item
}

const pad = (value: number) => String(value).padStart(2, '0')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
