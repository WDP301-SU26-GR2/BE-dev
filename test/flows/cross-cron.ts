/**
 * Cross-cutting Cron Job Tests (spec §17) — chạy cron THẬT trên DB flowtest.
 *
 * Cơ chế:
 * - C-01..16: boot NestApplicationContext (lib/cron.ts withCronContext — KHÔNG listen HTTP,
 *   stop mọi cron tick ngay sau boot) → gọi trực tiếp `.run()` từng cron một cách deterministic.
 *   Xoá Redis lock `cron:*` trước mỗi lần gọi (server flowtest cũng tick nên lock có thể đang bị giữ).
 * - C-17..20: board-scheduler (EVERY_MINUTE) ĐỢI SERVER TICK THẬT — seed session trước,
 *   poll DB tới 120s (pattern smoke-fix2).
 *
 * Idempotency: chạy cron 2 lần (xoá lock giữa 2 lần) → notification KHÔNG double
 * (dedup per-day theo referenceType `X:YYYY-MM-DD` của NotificationService).
 *
 * SKIP có chủ đích: C-04b "asset stale nhưng object TỒN TẠI trên R2 → giữ" — cần upload
 * object thật lên R2 (out-of-scope spec §20).
 */

import {
  PaymentConditionStatus,
  ConditionType,
  ContractStatus,
  SeriesStatus,
  BoardSessionStatus,
  BoardDecisionResult,
  DecisionType,
  CoOwnerApprovalStatus,
  OtpPurpose,
  TaskStatus,
  RoleCode
} from '@prisma/client'
import * as bcrypt from 'bcrypt'
import {
  wipeDb,
  seedRolesAndAdmin,
  makeUser,
  makeSeriesAt,
  makeContractAt,
  makeChapterAt,
  makePageAt,
  makeTaskAt,
  makePaymentCondition,
  makeBoardSession,
  makeBoardDecision,
  setAppConfig,
  prisma
} from './lib/seed.js'
import { ok, section, summary, resetCounters, sleep } from './lib/http.js'
import { withCronContext, clearCronLocks, waitUntil } from './lib/cron.js'

const FLOW = 'cross-cron'
const today = () => new Date().toISOString().slice(0, 10)
const dateOnly = (d: Date) => d.toISOString().slice(0, 10)

const countNotif = (recipientId: string, referenceType: string, referenceId?: string) =>
  prisma.notification.count({ where: { recipientId, referenceType, ...(referenceId ? { referenceId } : {}) } })

const main = async () => {
  resetCounters()
  console.log(`\n##### ${FLOW} #####`)
  await wipeDb()
  await seedRolesAndAdmin()

  const m1 = await makeUser(RoleCode.MANGAKA)
  const e1 = await makeUser(RoleCode.EDITOR)
  const a1 = await makeUser(RoleCode.ASSISTANT)
  const b1 = await makeUser(RoleCode.BOARD_MEMBER)

  // ── Seed board sessions TRƯỚC (C-17..20) để server tick xử lý song song trong lúc chạy C-01..16 ──
  const seriesPitched = await makeSeriesAt(SeriesStatus.PITCHED, { mangakaId: m1.id, editorId: e1.id })
  const sessA = await makeBoardSession({
    creatorId: e1.id,
    allowedEditorIds: [e1.id],
    status: BoardSessionStatus.UPCOMING,
    startTime: new Date(Date.now() - 5_000)
  })
  const sessB = await makeBoardSession({
    creatorId: e1.id,
    allowedEditorIds: [e1.id],
    status: BoardSessionStatus.ACTIVE,
    startTime: new Date(Date.now() - 120_000),
    endTime: new Date(Date.now() - 5_000)
  })
  const decB = await makeBoardDecision({
    sessionId: sessB.id,
    decisionType: DecisionType.SERIALIZATION,
    targetSeriesId: seriesPitched.id,
    result: BoardDecisionResult.PENDING
  })

  await withCronContext(async (ctx) => {
    // ═══ C-01/02 OtpCleanupCron ═══
    section('C-01/02 OtpCleanupCron')
    const otpHash = bcrypt.hashSync('123456', 10)
    await prisma.otpRequest.create({
      data: {
        email: 'otp-expired@ft.local',
        purpose: OtpPurpose.REGISTER,
        otpCodeHash: otpHash,
        expiresAt: new Date(Date.now() - 3_600_000)
      }
    })
    await prisma.otpRequest.create({
      data: {
        email: 'otp-valid@ft.local',
        purpose: OtpPurpose.REGISTER,
        otpCodeHash: otpHash,
        expiresAt: new Date(Date.now() + 3_600_000)
      }
    })
    await clearCronLocks()
    await ctx.getByName('OtpCleanupCron').run()
    ok('C-01 OTP hết hạn bị xoá', (await prisma.otpRequest.count({ where: { email: 'otp-expired@ft.local' } })) === 0)
    ok('C-02 OTP còn hạn giữ nguyên', (await prisma.otpRequest.count({ where: { email: 'otp-valid@ft.local' } })) === 1)

    // ═══ C-03/04 OrphanAssetCron ═══
    section('C-03/04 OrphanAssetCron')
    const staleAsset = await prisma.asset.create({
      data: {
        name: 'stale-orphan',
        filePath: `flowtest/bogus-${Date.now()}.png`,
        uploadedAt: new Date(Date.now() - 25 * 3_600_000) // > ORPHAN_ASSET_TTL_HOURS=24
      }
    })
    const freshAsset = await prisma.asset.create({
      data: { name: 'fresh-orphan', filePath: `flowtest/fresh-${Date.now()}.png` }
    })
    await clearCronLocks()
    await ctx.getByName('OrphanAssetCron').run()
    ok(
      'C-03 asset stale + object không tồn tại trên R2 → bị xoá',
      (await prisma.asset.count({ where: { id: staleAsset.id } })) === 0
    )
    ok(
      'C-04 asset chưa stale (trong TTL) → giữ nguyên',
      (await prisma.asset.count({ where: { id: freshAsset.id } })) === 1
    )
    ok('C-04b asset stale + object TỒN TẠI → giữ — SKIP (cần object R2 thật, spec §20)', true, 'SKIP')

    // ═══ C-05..07 DeadlineWarningCron ═══
    section('C-05..07 DeadlineWarningCron')
    const seriesProd = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m1.id, editorId: e1.id })
    const chNear = await makeChapterAt({ seriesId: seriesProd.id, chapterNumber: 1 })
    await prisma.schedule.updateMany({
      where: { chapterId: chNear.id },
      data: { currentDeadline: new Date(Date.now() + 2 * 3_600_000) } // trong ngưỡng 48h
    })
    const chFar = await makeChapterAt({ seriesId: seriesProd.id, chapterNumber: 2 }) // deadline +7d > 48h
    const pageNear = await makePageAt({ chapterId: chNear.id, pageNumber: 1 })
    const taskNear = await makeTaskAt({
      pageId: pageNear.id,
      assistantId: a1.id,
      status: TaskStatus.ASSIGNED,
      deadline: new Date(Date.now() + 3_600_000)
    })
    await clearCronLocks()
    await ctx.getByName('DeadlineWarningCron').run()
    const refChapter = `DEADLINE_WARNING:${today()}`
    const refTask = `TASK_DEADLINE_WARNING:${today()}`
    // Notification đi qua BullMQ async → poll thay vì sleep cứng (worker có thể trễ vài giây).
    ok(
      'C-05 chapter gần deadline → notify Mangaka + Editor',
      await waitUntil(
        async () =>
          (await countNotif(m1.id, refChapter, chNear.id)) === 1 &&
          (await countNotif(e1.id, refChapter, chNear.id)) === 1,
        15_000,
        1_000
      )
    )
    ok('C-05b chapter deadline xa → KHÔNG notify', (await countNotif(m1.id, refChapter, chFar.id)) === 0)
    ok(
      'C-06 task gần deadline → notify Assistant + Mangaka',
      await waitUntil(
        async () =>
          (await countNotif(a1.id, refTask, taskNear.id)) === 1 &&
          (await countNotif(m1.id, refTask, taskNear.id)) === 1,
        15_000,
        1_000
      )
    )
    await clearCronLocks()
    await ctx.getByName('DeadlineWarningCron').run()
    await sleep(2_000)
    ok(
      'C-07 chạy lần 2 cùng ngày → KHÔNG double notify (idempotent per-day)',
      (await countNotif(m1.id, refChapter, chNear.id)) === 1 && (await countNotif(a1.id, refTask, taskNear.id)) === 1
    )

    // ═══ C-08..10 CoOwnerEscalationCron ═══
    section('C-08..10 CoOwnerEscalationCron')
    const chEsc = await makeChapterAt({ seriesId: seriesProd.id, chapterNumber: 3 })
    const chNotDue = await makeChapterAt({ seriesId: seriesProd.id, chapterNumber: 4 })
    const chAlready = await makeChapterAt({ seriesId: seriesProd.id, chapterNumber: 5 })
    const apOverdue = await prisma.chapterCoOwnerApproval.create({
      data: { chapterId: chEsc.id, status: CoOwnerApprovalStatus.PENDING, deadline: new Date(Date.now() - 3_600_000) }
    })
    const apNotDue = await prisma.chapterCoOwnerApproval.create({
      data: {
        chapterId: chNotDue.id,
        status: CoOwnerApprovalStatus.PENDING,
        deadline: new Date(Date.now() + 86_400_000)
      }
    })
    const seededEscalatedAt = new Date(Date.now() - 86_400_000)
    const apAlready = await prisma.chapterCoOwnerApproval.create({
      data: {
        chapterId: chAlready.id,
        status: CoOwnerApprovalStatus.ESCALATED,
        deadline: new Date(Date.now() - 7_200_000),
        escalatedAt: seededEscalatedAt
      }
    })
    await clearCronLocks()
    await ctx.getByName('CoOwnerEscalationCron').run()
    const escalated = await waitUntil(
      async () => {
        const ap = await prisma.chapterCoOwnerApproval.findUnique({ where: { id: apOverdue.id } })
        return (
          ap?.status === CoOwnerApprovalStatus.ESCALATED &&
          ap?.escalatedAt != null &&
          (await countNotif(b1.id, 'COOWNER_APPROVAL_ESCALATED', chEsc.id)) === 1
        )
      },
      15_000,
      1_000
    )
    ok('C-08 approval quá deadline → ESCALATED + escalatedAt + notify Board', escalated)
    ok(
      'C-09 approval chưa quá hạn → giữ PENDING',
      (await prisma.chapterCoOwnerApproval.findUnique({ where: { id: apNotDue.id } }))?.status ===
        CoOwnerApprovalStatus.PENDING
    )
    const apAlreadyAfter = await prisma.chapterCoOwnerApproval.findUnique({ where: { id: apAlready.id } })
    ok(
      'C-10 approval đã ESCALATED → không lặp (escalatedAt giữ nguyên, không notify thêm)',
      apAlreadyAfter?.escalatedAt?.getTime() === seededEscalatedAt.getTime() &&
        (await countNotif(b1.id, 'COOWNER_APPROVAL_ESCALATED', chAlready.id)) === 0
    )

    // ═══ C-11..13 HiatusTooLongCron ═══
    section('C-11..13 HiatusTooLongCron')
    await setAppConfig({ hiatusTooLongDays: 1 })
    const hiatusOld = await makeSeriesAt(SeriesStatus.HIATUS, { mangakaId: m1.id, editorId: e1.id })
    await prisma.series.update({
      where: { id: hiatusOld.id },
      data: { hiatusStartedAt: new Date(Date.now() - 3 * 86_400_000) }
    })
    const hiatusNew = await makeSeriesAt(SeriesStatus.HIATUS, { mangakaId: m1.id, editorId: e1.id }) // hiatusStartedAt = now
    const refHiatus = `SERIES_HIATUS_TOO_LONG:${today()}`
    await clearCronLocks()
    await ctx.getByName('HiatusTooLongCron').run()
    ok(
      'C-11 hiatus quá ngưỡng → notify Board + Editor',
      await waitUntil(
        async () =>
          (await countNotif(b1.id, refHiatus, hiatusOld.id)) === 1 &&
          (await countNotif(e1.id, refHiatus, hiatusOld.id)) === 1,
        15_000,
        1_000
      )
    )
    ok('C-12 hiatus mới (chưa quá ngưỡng) → KHÔNG notify', (await countNotif(b1.id, refHiatus, hiatusNew.id)) === 0)
    await clearCronLocks()
    await ctx.getByName('HiatusTooLongCron').run()
    await sleep(2_000)
    ok(
      'C-13 chạy lần 2 cùng ngày → không double (idempotent per-day)',
      (await countNotif(b1.id, refHiatus, hiatusOld.id)) === 1
    )

    // ═══ C-14..16 PaymentEngine markMissedTimeBoundConditions ═══
    section('C-14..16 TIME_BOUND missed cron')
    const seriesPay = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m1.id, editorId: e1.id })
    const contract = await makeContractAt(ContractStatus.FULLY_EXECUTED, {
      seriesId: seriesPay.id,
      mangakaId: m1.id,
      editorId: e1.id
    })
    const condOverdue = await makePaymentCondition({
      contractId: contract.id,
      conditionType: ConditionType.TIME_BOUND,
      payoutAmount: 100,
      thresholdConfig: {
        deadline: dateOnly(new Date(Date.now() - 2 * 86_400_000)),
        chapterTarget: 5,
        payoutAmount: 100
      }
    })
    const condFuture = await makePaymentCondition({
      contractId: contract.id,
      conditionType: ConditionType.TIME_BOUND,
      payoutAmount: 100,
      thresholdConfig: {
        deadline: dateOnly(new Date(Date.now() + 30 * 86_400_000)),
        chapterTarget: 5,
        payoutAmount: 100
      }
    })
    const condDisabled = await makePaymentCondition({
      contractId: contract.id,
      conditionType: ConditionType.TIME_BOUND,
      payoutAmount: 100,
      status: PaymentConditionStatus.DISABLED,
      thresholdConfig: {
        deadline: dateOnly(new Date(Date.now() - 2 * 86_400_000)),
        chapterTarget: 5,
        payoutAmount: 100
      }
    })
    await clearCronLocks()
    await ctx.getByName('PaymentEngineService').markMissedTimeBoundConditions()
    ok(
      'C-14 TIME_BOUND quá hạn → MISSED',
      (await prisma.paymentCondition.findUnique({ where: { id: condOverdue.id } }))?.status ===
        PaymentConditionStatus.MISSED
    )
    ok(
      'C-15 TIME_BOUND chưa tới hạn → giữ PENDING',
      (await prisma.paymentCondition.findUnique({ where: { id: condFuture.id } }))?.status ===
        PaymentConditionStatus.PENDING
    )
    ok(
      'C-16 TIME_BOUND DISABLED (hiatus pause) → không đụng',
      (await prisma.paymentCondition.findUnique({ where: { id: condDisabled.id } }))?.status ===
        PaymentConditionStatus.DISABLED
    )
  })

  // ═══ C-17..20 board-scheduler EVERY_MINUTE — đợi server flowtest tick THẬT ═══
  section('C-17..20 board-scheduler (đợi server tick ≤120s)')
  const sessAStarted = await waitUntil(
    async () =>
      (await prisma.boardSession.findUnique({ where: { id: sessA.id } }))?.status === BoardSessionStatus.ACTIVE,
    120_000,
    5_000
  )
  ok('C-17 session UPCOMING quá startTime → auto ACTIVE (≤120s)', sessAStarted)
  const sessBConcluded = await waitUntil(
    async () =>
      (await prisma.boardSession.findUnique({ where: { id: sessB.id } }))?.status === BoardSessionStatus.CONCLUDED,
    120_000,
    5_000
  )
  ok('C-18 session ACTIVE quá endTime → auto CONCLUDED (≤120s)', sessBConcluded)
  const decAfter = await prisma.boardDecision.findUnique({ where: { id: decB.id } })
  ok('C-19 decision treo PENDING trong session concluded → EXPIRED', decAfter?.result === BoardDecisionResult.EXPIRED)
  ok(
    'C-20 decision EXPIRED KHÔNG emit finalize → series giữ PITCHED',
    (await prisma.series.findUnique({ where: { id: seriesPitched.id } }))?.status === SeriesStatus.PITCHED
  )

  await prisma.$disconnect()
  const fail = summary(FLOW)
  await sleep(300) // teardown settle (tránh libuv assert khi exit trên Windows)
  process.exit(fail > 0 ? 1 : 0)
}

void main().catch(async (e) => {
  console.error('FATAL', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
