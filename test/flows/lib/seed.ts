import {
  PrismaClient,
  Prisma,
  SeriesStatus,
  ContractStatus,
  SurveyStatus,
  RiskLevel,
  BoardSessionStatus,
  BoardSessionPhase,
  BoardDecisionResult,
  DecisionType,
  UserStatus,
  OtpPurpose,
  RoleCode,
  ContractType,
  PageStatus,
  ManuscriptStatus,
  TaskStatus,
  StudioAssignmentStatus,
  Specialization,
  NameKind,
  NameStatus,
  PaymentConditionStatus,
  ConditionType,
  DeadlineRequestStatus,
  PublicationType,
  RegionType
} from '@prisma/client'
export { Specialization, RegionType }
export type { Specialization as SpecializationType } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import './env.js' // kích hoạt guard flowtest TRƯỚC khi tạo client

export const prisma = new PrismaClient()
export const PW = 'FlowTest!123'
const HASH = bcrypt.hashSync(PW, 10)

let userSeq = 0
let seriesSeq = 0

// ─────────────────────────────────────────────────────────────────────────────
// Wipe — iterate Prisma.dmmf models (không bỏ sót model khi schema phát triển).
//
// ⚠ 'Role' CỐ TÌNH KHÔNG WIPE: RoleService trong server cache roleId in-memory
// (Map, không invalidate). Nếu xoá + tạo lại role → ObjectId mới → server cache
// giữ ID cũ → user đăng ký qua /auth/register nhận roleId stale → login 500
// (đây là root cause FINDING-BE-001/010 — bug harness, không phải bug BE).
// Role là dữ liệu seed bất biến trong production nên giữ ổn định qua các lần wipe.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 GUARD: DB flowtest PHẢI được `prisma db push` (tạo unique index) trước khi chạy suite.
 *
 * Mongo tự tạo collection khi ghi doc đầu tiên — KHÔNG kèm index. Nếu quên `db push`, các
 * unique constraint (User.email, OtpRequest[email,purpose], ReaderVote[period,identityHash])
 * KHÔNG tồn tại → mọi rule dựa trên P2002 (register trùng email → 409, 1-phiếu/kỳ → 409)
 * IM LẶNG không được enforce, và test tưởng "pass". Phải fail-fast thay vì test dối.
 */
export const assertIndexesReady = async () => {
  const res = (await prisma.$runCommandRaw({ listIndexes: 'User' }).catch(() => null)) as {
    cursor?: { firstBatch?: Array<{ name?: string }> }
  } | null
  const names = res?.cursor?.firstBatch?.map((i) => i.name) ?? []
  if (!names.includes('User_email_key')) {
    console.error(
      '[flowtest] DB thiếu unique index (User_email_key). Chạy:\n' +
        '  DATABASE_URL="<url flowtest>" npx prisma db push --skip-generate\n' +
        '(nếu báo E11000 do data cũ: drop collection trước rồi push lại)'
    )
    process.exit(2)
  }
}

export const wipeDb = async () => {
  await assertIndexesReady()
  // 🔴 KHÔNG dùng prisma.<model>.deleteMany: Prisma MongoDB enforce required-relation Ở CLIENT
  // (vd xoá Series khi còn Contract trỏ tới → "violate required relation ContractToSeries").
  // Catch-nuốt-lỗi trước đây làm wipe fail DÂY CHUYỀN im lặng → data rác sống qua các run
  // (25 series tồn 3 run — root cause loạt flake C-05/C-11 + "cold-start flake" của PROGRESS cũ).
  // → Dùng $runCommandRaw delete thẳng collection: Mongo không có FK, xoá là sạch.
  const models = Prisma.dmmf.datamodel.models.filter((m) => m.name !== 'Role') // Role giữ (xem chú thích trên)
  for (const model of models) {
    const collection = model.dbName ?? model.name
    await prisma.$runCommandRaw({ delete: collection, deletes: [{ q: {}, limit: 0 }] })
  }
  // ⚠ KHÔNG flushdb Redis ở đây: flush trong lúc BullMQ worker của server đang blocking-listen
  // phá state worker → mọi job sau đó fail 3 attempt đầu rồi mới retry OK (+14s lag mỗi notif).
  // Job tồn đọng của file trước chỉ ghi row cho id đã chết — vô hại với assert (id mới mỗi run).
  // Cron lock xoá TARGETED qua clearCronLocks() (lib/cron.ts) — DEL key thường, an toàn.
  await clearRateLimitKeys()
}

/**
 * Xoá key rate-limit OTP (`rl:q:*` quota, `rl:cd:*` cooldown) của DB flowtest.
 * Window là 1 GIỜ → nếu không xoá, quota theo IP (mọi request harness dùng chung 1 x-forwarded-for)
 * cạn dần qua các lần chạy → run thứ 2-3 trong cùng giờ ăn 429 hàng loạt (test "đỏ" giả).
 * Chỉ DEL đúng prefix `rl:` — KHÔNG đụng `bull:*` (xem lý do không flushdb ở trên).
 */
const clearRateLimitKeys = async () => {
  const url = process.env.REDIS_URL ?? ''
  const dbIndex = /\/(\d+)\s*$/.exec(url)?.[1]
  if (!dbIndex || dbIndex === '0') return // db0 = dev server dùng chung → tuyệt đối không đụng
  const { Redis } = await import('ioredis')
  const redis = new Redis(url, { maxRetriesPerRequest: 2 })
  try {
    const keys = await redis.keys('rl:*')
    if (keys.length) await redis.del(...keys)
  } finally {
    redis.disconnect()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Roles + admin — tái tạo logic src/initialScript/index.ts (KHÔNG import nó vì nó
// throw khi roles tồn tại).
// ─────────────────────────────────────────────────────────────────────────────
export const seedRolesAndAdmin = async () => {
  // Idempotent: role KHÔNG bị wipe (xem WIPE_ORDER) → chỉ tạo khi thiếu, giữ ObjectId
  // ổn định cho RoleService cache trong server đang chạy.
  const ROLE_SEED: Array<{ code: RoleCode; description: string; isSystem?: boolean }> = [
    { code: RoleCode.SUPER_ADMIN, description: 'System-wide admin', isSystem: true },
    { code: RoleCode.MANGAKA, description: 'Series author' },
    { code: RoleCode.ASSISTANT, description: 'Studio assistant' },
    { code: RoleCode.EDITOR, description: 'Series editor' },
    { code: RoleCode.BOARD_MEMBER, description: 'Board decision member' }
  ]
  const existing = await prisma.role.findMany({ select: { code: true } })
  const existingCodes = new Set(existing.map((r) => r.code))
  const missing = ROLE_SEED.filter((r) => !existingCodes.has(r.code))
  if (missing.length) await prisma.role.createMany({ data: missing })
  await makeUser(RoleCode.SUPER_ADMIN, { email: process.env.ADMIN_EMAIL ?? 'admin@flowtest.local' })
}

// ─────────────────────────────────────────────────────────────────────────────
// makeUser — tạo user với role, ACTIVE + verified + bcrypt.
// Token mustChangePassword=false (trừ khi test policy guard).
// ─────────────────────────────────────────────────────────────────────────────
export const makeUser = async (
  roleCode: RoleCode,
  over: {
    email?: string
    mustChangePassword?: boolean
    name?: string
    phoneNumber?: string
    banned?: boolean
    status?: UserStatus
  } = {}
) => {
  const role = await prisma.role.findFirst({ where: { code: roleCode } })
  if (!role) throw new Error(`role ${roleCode} chưa seed — gọi seedRolesAndAdmin() trước`)
  const email = over.email ?? `${String(roleCode).toLowerCase()}-${++userSeq}@flowtest.local`
  const phoneNumber = over.phoneNumber ?? `+849${String(++userSeq).padStart(8, '0').slice(-8)}`
  const user = await prisma.user.create({
    data: {
      email,
      name: over.name ?? `${roleCode} #${userSeq}`,
      displayName: over.name ?? `${roleCode}-${userSeq}`,
      password: HASH,
      phoneNumber,
      roleId: role.id,
      status: over.status ?? (over.banned ? UserStatus.BANNED : UserStatus.ACTIVE),
      emailVerified: true,
      registrationType:
        roleCode === RoleCode.MANGAKA || roleCode === RoleCode.ASSISTANT ? 'SELF_REGISTERED' : 'ADMIN_CREATED',
      mustChangePassword: over.mustChangePassword ?? false
    }
  })
  return { id: user.id, email, password: PW }
}

// ─────────────────────────────────────────────────────────────────────────────
// makeSeriesAt — tạo Series ở status bất kỳ (SERIALIZED/HIATUS/CANCELLING/...).
// Với SERIALIZED + child states: set publicationType/magazine/startIssueNumber.
// Với CANCELLING: set endingChapterAllowance + chapterCountAtCancelling.
// ─────────────────────────────────────────────────────────────────────────────
type MakeSeriesInput = {
  mangakaId: string
  editorId?: string
  coOwnerId?: string
  title?: string
  parentSeriesId?: string
  relationshipType?: string
  magazine?: string
  publicationType?: PublicationType
  startIssueNumber?: number
  proposalStatus?: string
  franchiseConsentStatus?: string | null
  proposalSynopsis?: string
  completionProposal?: unknown
  // Embedded statusHistory được build tự động với 1 entry.
}

export const makeSeriesAt = async (status: SeriesStatus, o: MakeSeriesInput = { mangakaId: '' }) => {
  if (!o.mangakaId) throw new Error('makeSeriesAt: mangakaId required')
  const title = o.title ?? `FT Series ${++seriesSeq}-${Date.now()}`
  const data: Prisma.SeriesUncheckedCreateInput = {
    title,
    mangakaId: o.mangakaId,
    status,
    genres: ['ACTION'],
    demographic: 'SHONEN',
    statusHistory: [{ fromStatus: 'INITIAL', toStatus: status, changedBy: o.mangakaId, at: new Date() }] as never,
    proposal: {
      nameId: null,
      synopsis: o.proposalSynopsis ?? 'ft synopsis',
      characterDesigns: [],
      estimatedLength: null,
      status: o.proposalStatus ?? (status === 'DRAFT' ? 'DRAFT' : 'PROPOSAL_APPROVED'),
      createdAt: new Date()
    } as never
  }
  if (o.editorId) {
    data.editorId = o.editorId
    data.reviewStartedAt = new Date()
  }
  if (o.coOwnerId) data.coOwnerId = o.coOwnerId
  if (o.parentSeriesId) {
    data.parentSeriesId = o.parentSeriesId
    if (o.relationshipType) data.relationshipType = o.relationshipType as never
  }
  if (
    status === SeriesStatus.SERIALIZED ||
    status === SeriesStatus.HIATUS ||
    status === SeriesStatus.CANCELLING ||
    status === SeriesStatus.COMPLETING
  ) {
    data.publicationType = o.publicationType ?? PublicationType.WEEKLY
    data.magazine = o.magazine ?? 'FT Jump'
    data.startIssueNumber = o.startIssueNumber ?? 1
  }
  if (status === SeriesStatus.HIATUS) data.hiatusStartedAt = new Date()
  if (status === SeriesStatus.CANCELLING) {
    data.endingChapterAllowance = 2
    data.chapterCountAtCancelling = 0
  }
  if (o.franchiseConsentStatus !== undefined) data.franchiseConsentStatus = o.franchiseConsentStatus as never
  if (o.completionProposal) data.completionProposal = o.completionProposal
  return prisma.series.create({ data })
}

// ─────────────────────────────────────────────────────────────────────────────
// makeContractAt — contract ở status bất kỳ. FULLY_EXECUTED tự set mangakaSignedAt + boardSignedAt.
// REVENUE_SHARE mặc định 70/30; FULL_BUYOUT 100/0.
// ─────────────────────────────────────────────────────────────────────────────
export const makeContractAt = async (
  status: ContractStatus,
  o: {
    seriesId: string
    mangakaId: string
    editorId?: string
    contractType?: ContractType
    publisherPct?: number
    boardDecisionId?: string
  }
) => {
  const type = o.contractType ?? ContractType.REVENUE_SHARE
  const pubPct = o.publisherPct ?? (type === ContractType.FULL_BUYOUT ? 100 : 70)
  return prisma.contract.create({
    data: {
      seriesId: o.seriesId,
      mangakaId: o.mangakaId,
      editorId: o.editorId ?? null,
      contractType: type,
      status,
      valuationAmount: 1000,
      publisherOwnershipPct: pubPct,
      mangakaOwnershipPct: 100 - pubPct,
      terminationClause: 'compensation:100',
      ...(o.boardDecisionId ? { boardDecisionId: o.boardDecisionId } : {}),
      ...(status === ContractStatus.FULLY_EXECUTED ? { mangakaSignedAt: new Date(), boardSignedAt: new Date() } : {})
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// makeChapterAt — tạo Chapter + Manuscript + Schedule (bắt buộc, không cascade).
// chapterNumber unique trong series; nameId optional; publishedAt khi PUBLISHED.
// ─────────────────────────────────────────────────────────────────────────────
export const makeChapterAt = async (o: {
  seriesId: string
  chapterNumber: number
  title?: string
  nameId?: string
  manuscriptStatus?: ManuscriptStatus
  publishedAt?: Date | null
  holdComposite?: boolean
  /** BẮT BUỘC khi holdComposite=true — ChapterHold.heldBy là @db.ObjectId NON-NULL trong schema. */
  heldBy?: string
}) => {
  const chapter = await prisma.chapter.create({
    data: {
      seriesId: o.seriesId,
      chapterNumber: o.chapterNumber,
      title: o.title ?? `Ch${o.chapterNumber}`,
      ...(o.nameId ? { nameId: o.nameId } : {}),
      ...(o.publishedAt ? { publishedAt: o.publishedAt } : {})
    }
  })
  await prisma.manuscript.create({
    data: {
      chapterId: chapter.id,
      status: o.manuscriptStatus ?? ManuscriptStatus.DRAFT,
      statusHistory: [
        {
          from: null,
          to: o.manuscriptStatus ?? ManuscriptStatus.DRAFT,
          changedBy: null,
          reason: null,
          changedAt: new Date()
        }
      ] as never
    }
  })
  await prisma.schedule.create({
    data: {
      chapterId: chapter.id,
      originalDeadline: new Date(Date.now() + 7 * 86_400_000),
      currentDeadline: new Date(Date.now() + 7 * 86_400_000)
    }
  })
  if (o.holdComposite) {
    if (!o.heldBy) throw new Error('makeChapterAt: holdComposite=true cần heldBy (ChapterHold.heldBy NON-NULL)')
    await prisma.chapter.update({
      where: { id: chapter.id },
      data: {
        hold: {
          reason: 'test hold',
          heldBy: o.heldBy,
          heldAt: new Date()
        } as never,
        holdHistory: [
          { action: 'HOLD', by: o.heldBy, reason: 'test', expectedReturnDate: null, at: new Date() }
        ] as never
      }
    })
  }
  return chapter
}

// ─────────────────────────────────────────────────────────────────────────────
// makeNameAt — Name kind PROPOSAL|CHAPTER. PROPOSAL gắn seriesId; CHAPTER gắn chapterId.
// ─────────────────────────────────────────────────────────────────────────────
export const makeNameAt = async (o: {
  seriesId: string
  chapterId?: string
  chapterNumber?: number
  kind?: NameKind
  status?: NameStatus
  version?: number
}) => {
  return prisma.name.create({
    data: {
      seriesId: o.seriesId,
      chapterId: o.chapterId ?? null,
      chapterNumber: o.chapterNumber ?? null,
      kind: o.kind ?? NameKind.PROPOSAL,
      status: o.status ?? NameStatus.SUBMITTED,
      version: o.version ?? 1,
      submittedAt: new Date(),
      pages: [] as never
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// makePageAt — tạo Page với status. originalFile là key (R2 chưa cần thật).
// ─────────────────────────────────────────────────────────────────────────────
export const makePageAt = async (o: {
  chapterId: string
  pageNumber: number
  status?: PageStatus
  originalFile?: string
}) => {
  return prisma.page.create({
    data: {
      chapterId: o.chapterId,
      pageNumber: o.pageNumber,
      status: o.status ?? PageStatus.DRAFT,
      originalFile: o.originalFile ?? null,
      compositeFile: null
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// makeTaskAt — tạo Task với status bất kỳ. assignment ACTIVE required cho ASSIGNED.
// ─────────────────────────────────────────────────────────────────────────────
export const makeTaskAt = async (o: {
  pageId: string
  regionId?: string | null
  assistantId: string
  status?: TaskStatus
  priority?: number
  deadline?: Date | null
}) => {
  return prisma.task.create({
    data: {
      pageId: o.pageId,
      regionIds: o.regionId ? [o.regionId] : [],
      assistantId: o.assistantId,
      status: o.status ?? TaskStatus.ASSIGNED,
      priority: o.priority ?? 0,
      deadline: o.deadline ?? null,
      assetIds: [] as never
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// makeStudioAssignment — assignment ACTIVE cho cặp mangaka-assistant.
// ─────────────────────────────────────────────────────────────────────────────
export const makeStudioAssignment = async (o: {
  mangakaId: string
  assistantId: string
  seriesId?: string
  status?: StudioAssignmentStatus
  hireStart?: Date
  hireEnd?: Date | null
  terminatedReason?: string
}) => {
  return prisma.studioAssignment.create({
    data: {
      mangakaId: o.mangakaId,
      assistantId: o.assistantId,
      seriesId: o.seriesId ?? null,
      status: o.status ?? StudioAssignmentStatus.ACTIVE,
      hireStart: o.hireStart ?? new Date(Date.now() - 7 * 86_400_000),
      hireEnd: o.hireEnd ?? new Date(Date.now() + 30 * 86_400_000),
      assignedTaskTypes: [Specialization.INKING],
      terminatedReason: o.terminatedReason ?? null
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// makeBoardSession — session với roster 3+ editor (odd enforce theo spec F01-037).
// ─────────────────────────────────────────────────────────────────────────────
export const makeBoardSession = async (o: {
  creatorId: string
  allowedEditorIds: string[]
  status?: BoardSessionStatus
  phase?: BoardSessionPhase
  startTime?: Date
  endTime?: Date | null
  title?: string
}) => {
  return prisma.boardSession.create({
    data: {
      creatorId: o.creatorId,
      status: o.status ?? BoardSessionStatus.UPCOMING,
      phase: o.phase ?? BoardSessionPhase.PRESENTING,
      allowedEditorIds: o.allowedEditorIds,
      title: o.title ?? `FT Session ${++seriesSeq}`,
      startTime: o.startTime ?? new Date(Date.now() + 60_000),
      endTime: o.endTime ?? null
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// makeBoardDecision — decision với result PENDING (chờ vote).
// ─────────────────────────────────────────────────────────────────────────────
export const makeBoardDecision = async (o: {
  sessionId: string
  targetSeriesId?: string
  decisionType: DecisionType
  result?: BoardDecisionResult
  allowedEditorIds?: string[]
  endingChapterAllowance?: number
  details?: unknown
}) => {
  return prisma.boardDecision.create({
    data: {
      boardSessionId: o.sessionId,
      targetSeriesId: o.targetSeriesId ?? null,
      decisionType: o.decisionType,
      result: o.result ?? BoardDecisionResult.PENDING,
      allowedEditorIds: o.allowedEditorIds ?? [],
      endingChapterAllowance: o.endingChapterAllowance ?? null,
      details: (o.details ?? null) as never,
      totalVotes: 0,
      approveCount: 0,
      rejectCount: 0,
      quorumMet: false
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// makeSurveyPeriod — period với status OPEN/CLOSED/REFLECTED/DRAFT.
// ─────────────────────────────────────────────────────────────────────────────
export const makeSurveyPeriod = async (o: {
  createdBy?: string
  issueNumber?: number
  reflectedIssueNumber?: number | null
  status?: SurveyStatus
  startDate?: Date
  endDate?: Date
}) => {
  return prisma.surveyPeriod.create({
    data: {
      createdBy: o.createdBy ?? null,
      issueNumber: o.issueNumber ?? 1,
      reflectedIssueNumber: o.reflectedIssueNumber ?? null,
      status: o.status ?? SurveyStatus.DRAFT,
      startDate: o.startDate ?? null,
      endDate: o.endDate ?? null
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// makeRankingRecords — bulk tạo RankingRecord cho period.
// ─────────────────────────────────────────────────────────────────────────────
export const makeRankingRecords = async (
  periodId: string,
  rows: Array<{
    seriesId: string
    rankPosition: number
    voteCount: number
    previousRank?: number | null
    rankChange?: number | null
    isAtRisk?: boolean
    riskLevel?: RiskLevel
    consecutiveAtRiskCount?: number
    isReliable?: boolean
  }>
) => {
  return prisma.rankingRecord.createMany({
    data: rows.map((r) => ({
      surveyPeriodId: periodId,
      seriesId: r.seriesId,
      rankPosition: r.rankPosition,
      voteCount: r.voteCount,
      previousRank: r.previousRank ?? null,
      rankChange: r.rankChange ?? null,
      isAtRisk: r.isAtRisk ?? false,
      riskLevel: r.riskLevel ?? RiskLevel.NONE,
      consecutiveAtRiskCount: r.consecutiveAtRiskCount ?? 0,
      isReliable: r.isReliable ?? true
    }))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// makePaymentCondition — condition cho contract.
// ─────────────────────────────────────────────────────────────────────────────
export const makePaymentCondition = async (o: {
  contractId: string
  conditionType: ConditionType
  payoutAmount?: number | null
  payoutPct?: number | null
  isRecurring?: boolean
  thresholdConfig?: unknown
  status?: PaymentConditionStatus
}) => {
  return prisma.paymentCondition.create({
    data: {
      contractId: o.contractId,
      conditionType: o.conditionType,
      payoutAmount: o.payoutAmount ?? null,
      payoutPct: o.payoutPct ?? null,
      isRecurring: o.isRecurring ?? false,
      thresholdConfig: (o.thresholdConfig ?? null) as never,
      status: o.status ?? PaymentConditionStatus.PENDING
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// makeDeadlineRequest — request với status tùy ý.
// ─────────────────────────────────────────────────────────────────────────────
export const makeDeadlineRequest = async (o: {
  scheduleId: string
  chapterId?: string | null
  seriesId?: string | null
  requestedBy: string
  currentDeadline?: Date | null
  requestedDeadline?: Date | null
  reason?: string
  affectsSlot?: boolean
  status?: DeadlineRequestStatus
  statusHistoryBy?: string
}) => {
  return prisma.deadlineRequest.create({
    data: {
      scheduleId: o.scheduleId,
      chapterId: o.chapterId ?? null,
      seriesId: o.seriesId ?? null,
      requestedBy: o.requestedBy,
      currentDeadline: o.currentDeadline ?? new Date(),
      requestedDeadline: o.requestedDeadline ?? new Date(Date.now() + 14 * 86_400_000),
      reason: o.reason ?? 'test',
      affectsSlot: o.affectsSlot ?? false,
      status: o.status ?? DeadlineRequestStatus.PROPOSED,
      statusHistory: [
        { from: null, to: o.status ?? DeadlineRequestStatus.PROPOSED, by: o.statusHistoryBy ?? null, at: new Date() }
      ] as never
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// seedOtp — pattern smoke-fix2: upsert OtpRequest với bcrypt('123456').
// Purpose là OtpPurpose enum: REGISTER | FORGOT_PASSWORD | SIGNING_CONTRACT | VOTE
// ─────────────────────────────────────────────────────────────────────────────
export const seedOtp = (email: string, purpose: OtpPurpose) =>
  prisma.otpRequest.upsert({
    where: { email_purpose: { email, purpose } },
    update: {
      otpCodeHash: bcrypt.hashSync('123456', 10),
      expiresAt: new Date(Date.now() + 300_000),
      attempts: 0,
      isUsed: false
    },
    create: {
      email,
      purpose,
      otpCodeHash: bcrypt.hashSync('123456', 10),
      expiresAt: new Date(Date.now() + 300_000)
    }
  })

// ─────────────────────────────────────────────────────────────────────────────
// setAppConfig — bypass cache 30s của AppConfigService (ghi thẳng DB).
// ─────────────────────────────────────────────────────────────────────────────
export const setAppConfig = async (
  patch: Partial<{
    nameMaxReviewRounds: number
    maxUploadBytes: number
    reputationRecommendThreshold: number
    hiatusTooLongDays: number
    lowVoteReliabilityThreshold: number
    coOwnerApprovalGraceDays: number
    assignmentGraceDays: number
  }>
) => {
  const existing = await prisma.appConfig.findFirst()
  if (existing) {
    return prisma.appConfig.update({ where: { id: existing.id }, data: patch })
  }
  return prisma.appConfig.create({ data: patch as never })
}

export const setVotingConfig = async (
  patch: Partial<{
    authMode: string
    maxSeriesPerVote: number
    otpExpirySeconds: number
    otpMaxAttempts: number
    ipRateLimit: number
    phoneRateLimit: number
    captchaThreshold: number
    otpCooldownSeconds: number
    ipVotesPerPeriod: number
  }>
) => {
  const existing = await prisma.votingConfig.findFirst()
  if (existing) return prisma.votingConfig.update({ where: { id: existing.id }, data: patch as never })
  return prisma.votingConfig.create({ data: patch as never })
}

export const setBoardConfig = async (
  patch: Partial<{
    boardTotalMembers: number
    quorumMin: number
    approveMajorityRatio: number
    isDefault: boolean
  }>
) => {
  const existing = await prisma.boardConfig.findFirst({ where: { isDefault: true } })
  if (existing) return prisma.boardConfig.update({ where: { id: existing.id }, data: patch as never })
  return prisma.boardConfig.create({ data: { isDefault: true, ...patch } as never })
}
