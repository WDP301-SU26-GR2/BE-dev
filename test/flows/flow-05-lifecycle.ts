/**
 * FLOW 5 — Series Lifecycle (Requiment Flow 5 + 1.10 Hiatus + 1.11 Completion/Cancellation)
 * Spec §10 — 36 case. Bao phủ Spec 2 (lifecycle) + Spec 9 Part 1 (PB-06).
 *
 * Nhóm case:
 *   LC1 Hiatus (8)          — enter/resume + TIME_BOUND pause/shift (B-CON-10) + cron hiatus-too-long
 *   LC2 Board decisions (16)— CONTINUE/CHANGE_FORMAT/COMPLETE/CANCEL apply lên Series qua event chain
 *   LC3 Ending + misc (12)  — finalize-ending, force-cancel, propose-completion, terminal guards, audit
 *
 * Chain THẬT (không fastForward status Series ở nhánh board): Board vote qua API →
 * BoardDecisionFinalized → series listener transition. Side-effect verify bằng Prisma.
 */

import {
  SeriesStatus,
  ContractStatus,
  ConditionType,
  PaymentConditionStatus,
  DecisionType,
  PublicationType,
  RoleCode,
  AuditEntityType
} from '@prisma/client'
import {
  wipeDb,
  seedRolesAndAdmin,
  prisma,
  makeUser,
  makeSeriesAt,
  makeContractAt,
  makeChapterAt,
  makePaymentCondition,
  setAppConfig,
  setBoardConfig
} from './lib/seed.js'
import { req, ok, section, summary, resetCounters, expectError, sleep } from './lib/http.js'
import { login } from './lib/auth.js'
import { withCronContext, clearCronLocks, waitUntil } from './lib/cron.js'

const FLOW = 'flow-05-lifecycle'
const FAKE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const dateOnly = (d: Date) => d.toISOString().slice(0, 10)

const main = async () => {
  resetCounters()
  console.log(`\n##### ${FLOW} #####`)
  await wipeDb()
  await seedRolesAndAdmin()

  const m1 = await makeUser(RoleCode.MANGAKA)
  const m2 = await makeUser(RoleCode.MANGAKA) // ngoài cuộc
  const e1 = await makeUser(RoleCode.EDITOR)
  const b1 = await makeUser(RoleCode.BOARD_MEMBER)
  const b2 = await makeUser(RoleCode.BOARD_MEMBER)
  const b3 = await makeUser(RoleCode.BOARD_MEMBER)
  const m1Tok = await login(m1.email)
  const m2Tok = await login(m2.email)
  const e1Tok = await login(e1.email)
  const b1Tok = await login(b1.email)
  const b2Tok = await login(b2.email)
  const b3Tok = await login(b3.email)
  const boardToks = [b1Tok, b2Tok, b3Tok]

  // BoardConfig seed ở flow này chỉ để cố định roster-default/majorityRatio.
  // Quorum thực tế luôn là ceil(2/3 roster): roster 3 cần 2 phiếu; đa số tính trên toàn roster.
  await setBoardConfig({ boardTotalMembers: 3, quorumMin: 3, approveMajorityRatio: 0.5 })

  // Board session + decision qua API THẬT (roster lẻ = 3).
  const boardDecide = async (
    decisionType: DecisionType,
    targetSeriesId: string,
    details: Record<string, unknown> = {},
    endingChapterAllowance?: number,
    voters: string[] = boardToks
  ) => {
    const rs = await req('POST', '/board/sessions', {
      token: e1Tok,
      body: {
        title: `FT LC ${Date.now()}`,
        startTime: new Date(Date.now() + 60_000).toISOString(),
        allowedEditorIds: [b1.id, b2.id, b3.id]
      }
    })
    if (rs.status !== 201) throw new Error(`createSession ${rs.status} ${rs.raw.slice(0, 200)}`)
    const sessionId = rs.json.data.id as string
    await prisma.boardSession.update({ where: { id: sessionId }, data: { startTime: new Date(Date.now() - 5_000) } })
    await req('PATCH', `/board/sessions/${sessionId}/start`, { token: e1Tok })
    await req('PATCH', `/board/sessions/${sessionId}/phase`, { token: e1Tok, body: { phase: 'VOTING' } })
    const rd = await req('POST', '/board/decisions', {
      token: e1Tok,
      body: {
        boardSessionId: sessionId,
        decisionType,
        targetSeriesId,
        allowedEditorIds: [b1.id, b2.id, b3.id],
        ...(endingChapterAllowance !== undefined ? { endingChapterAllowance } : {}),
        details
      }
    })
    if (rd.status !== 201) throw new Error(`createDecision ${rd.status} ${rd.raw.slice(0, 200)}`)
    const decisionId = rd.json.data.id as string
    for (const t of voters) {
      await req('POST', `/board/decisions/${decisionId}/vote`, { token: t, body: { voteValue: 'APPROVE' } })
    }
    await sleep(800) // listener transition + notify async
    return { sessionId, decisionId }
  }

  // ══════════════════════ LC1 — HIATUS ══════════════════════
  section('LC1 Hiatus enter/resume + TIME_BOUND pause (B-CON-10) + cron')

  const sHia = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m1.id, editorId: e1.id })
  const cHia = await makeContractAt(ContractStatus.FULLY_EXECUTED, {
    seriesId: sHia.id,
    mangakaId: m1.id,
    editorId: e1.id
  })
  const deadlineBefore = dateOnly(new Date(Date.now() + 30 * 86_400_000))
  const condTB = await makePaymentCondition({
    contractId: cHia.id,
    conditionType: ConditionType.TIME_BOUND,
    payoutAmount: 500,
    thresholdConfig: { deadline: deadlineBefore, chapterTarget: 10, payoutAmount: 500 }
  })

  const rHia = await req('POST', `/series/${sHia.id}/hiatus`, { token: e1Tok, body: { reason: 'mangaka bị ốm' } })
  const sHiaAfter = await prisma.series.findUnique({ where: { id: sHia.id } })
  ok(
    'F05-001 E hiatus → HIATUS + hiatusStartedAt',
    rHia.status === 201 && sHiaAfter?.status === SeriesStatus.HIATUS && sHiaAfter?.hiatusStartedAt != null,
    `got ${rHia.status} ${rHia.raw.slice(0, 150)}`
  )

  // editorId PHẢI set: guard NotAssignedEditor chạy TRƯỚC state-machine check (đúng thứ tự BE) —
  // không có editor thì nhận 403 chứ không tới được 409.
  const sDraft = await makeSeriesAt(SeriesStatus.DRAFT, { mangakaId: m1.id, editorId: e1.id })
  const rHiaDraft = await req('POST', `/series/${sDraft.id}/hiatus`, { token: e1Tok, body: { reason: 'x' } })
  expectError(rHiaDraft, 409, 'Error.InvalidSeriesTransition', 'F05-002 hiatus khi DRAFT → 409 InvalidSeriesTransition')

  const sDraftNoEd = await makeSeriesAt(SeriesStatus.DRAFT, { mangakaId: m1.id })
  const rHiaNoEd = await req('POST', `/series/${sDraftNoEd.id}/hiatus`, { token: e1Tok, body: { reason: 'x' } })
  expectError(
    rHiaNoEd,
    403,
    'Error.NotAssignedEditor',
    'F05-002b hiatus bởi editor KHÔNG phụ trách → 403 NotAssignedEditor'
  )

  const rHiaM = await req('POST', `/series/${sHia.id}/hiatus`, { token: m1Tok, body: { reason: 'x' } })
  ok('F05-003 hiatus bởi MANGAKA → 403 (route EDITOR only)', rHiaM.status === 403, `got ${rHiaM.status}`)

  ok(
    'F05-004 hiatus → TIME_BOUND condition DISABLED (đồng hồ dừng)',
    await waitUntil(
      async () =>
        (await prisma.paymentCondition.findUnique({ where: { id: condTB.id } }))?.status ===
        PaymentConditionStatus.DISABLED,
      10_000,
      500
    )
  )

  await sleep(1500) // để pausedMs > 0 đo được
  const rResume = await req('POST', `/series/${sHia.id}/resume`, { token: e1Tok, body: {} })
  const sResumed = await prisma.series.findUnique({ where: { id: sHia.id } })
  ok(
    'F05-005a resume → SERIALIZED',
    rResume.status === 201 && sResumed?.status === SeriesStatus.SERIALIZED,
    `got ${rResume.status} ${rResume.raw.slice(0, 150)}`
  )
  const condBackToPending = await waitUntil(
    async () =>
      (await prisma.paymentCondition.findUnique({ where: { id: condTB.id } }))?.status ===
      PaymentConditionStatus.PENDING,
    10_000,
    500
  )
  const condFinal = await prisma.paymentCondition.findUnique({ where: { id: condTB.id } })
  const deadlineAfter = (condFinal?.thresholdConfig as Record<string, unknown> | null)?.deadline as string | undefined
  ok(
    'F05-005b resume → condition PENDING + deadline shift theo pausedMs (B-CON-10)',
    condBackToPending && typeof deadlineAfter === 'string' && deadlineAfter >= deadlineBefore,
    `before=${deadlineBefore} after=${String(deadlineAfter)}`
  )

  const rResume2 = await req('POST', `/series/${sHia.id}/resume`, { token: e1Tok, body: {} })
  expectError(rResume2, 409, 'Error.InvalidSeriesTransition', 'F05-006 resume khi không HIATUS → 409')

  // Cron hiatus-too-long (PB-06) — isolate trên series riêng
  await setAppConfig({ hiatusTooLongDays: 1 })
  const sHiaLong = await makeSeriesAt(SeriesStatus.HIATUS, { mangakaId: m1.id, editorId: e1.id })
  await prisma.series.update({
    where: { id: sHiaLong.id },
    data: { hiatusStartedAt: new Date(Date.now() - 5 * 86_400_000) }
  })
  const refHiatus = `SERIES_HIATUS_TOO_LONG:${new Date().toISOString().slice(0, 10)}`
  const countHiatusNotif = () =>
    prisma.notification.count({ where: { recipientId: b1.id, referenceType: refHiatus, referenceId: sHiaLong.id } })
  await withCronContext(async (ctx) => {
    await clearCronLocks()
    await ctx.getByName<{ run: () => Promise<void> }>('HiatusTooLongCron').run()
    ok(
      'F05-007 cron hiatus-too-long → notify Board + Editor',
      await waitUntil(async () => (await countHiatusNotif()) === 1, 15_000, 1_000)
    )
    await clearCronLocks()
    await ctx.getByName<{ run: () => Promise<void> }>('HiatusTooLongCron').run()
    await sleep(3_000)
    ok('F05-008 cron chạy 2 lần cùng ngày → không double notify (idempotent per-day)', (await countHiatusNotif()) === 1)
  })

  // ══════════════════════ LC2 — BOARD DECISIONS ══════════════════════
  section('LC2 Board decisions apply lên Series (CONTINUE/CHANGE_FORMAT/COMPLETE/CANCEL)')

  const sCont = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m1.id, editorId: e1.id })
  const { decisionId: decCont } = await boardDecide(DecisionType.CONTINUE, sCont.id)
  const contDec = await prisma.boardDecision.findUnique({ where: { id: decCont } })
  ok(
    'F05-009 CONTINUE approve → series GIỮ SERIALIZED + decision APPROVED',
    (await prisma.series.findUnique({ where: { id: sCont.id } }))?.status === SeriesStatus.SERIALIZED &&
      contDec?.result === 'APPROVED',
    `decision=${String(contDec?.result)}`
  )

  const sFmt = await makeSeriesAt(SeriesStatus.SERIALIZED, {
    mangakaId: m1.id,
    editorId: e1.id,
    publicationType: PublicationType.WEEKLY
  })
  const cFmt = await makeContractAt(ContractStatus.FULLY_EXECUTED, {
    seriesId: sFmt.id,
    mangakaId: m1.id,
    editorId: e1.id
  })
  const chFmt = await makeChapterAt({ seriesId: sFmt.id, chapterNumber: 1 })
  const schedBefore = await prisma.schedule.findFirst({ where: { chapterId: chFmt.id } })
  await boardDecide(DecisionType.FORMAT_CHANGE, sFmt.id, { publicationType: 'MONTHLY' })
  const sFmtAfter = await prisma.series.findUnique({ where: { id: sFmt.id } })
  ok(
    'F05-010a CHANGE_FORMAT → publicationType = MONTHLY',
    sFmtAfter?.publicationType === PublicationType.MONTHLY,
    `got ${String(sFmtAfter?.publicationType)}`
  )
  const schedAfter = await prisma.schedule.findFirst({ where: { chapterId: chFmt.id } })
  ok(
    'F05-010b CHANGE_FORMAT KHÔNG hồi tố deadline chapter đang mở (G-6)',
    schedAfter?.currentDeadline?.getTime() === schedBefore?.currentDeadline?.getTime()
  )
  ok(
    'F05-010c CHANGE_FORMAT → notify content nhắc đặt deadline',
    (await prisma.notification.count({
      where: { recipientId: { in: [m1.id, e1.id] }, referenceId: sFmt.id, content: { contains: 'deadline' } }
    })) > 0
  )
  ok(
    'F05-010d CHANGE_FORMAT → ContractAmendmentRequested → amendment DRAFT stub',
    await waitUntil(
      async () => (await prisma.contractAmendment.count({ where: { contractId: cFmt.id, status: 'DRAFT' } })) === 1,
      10_000,
      500
    )
  )

  const sFmt2 = await makeSeriesAt(SeriesStatus.SERIALIZED, {
    mangakaId: m1.id,
    editorId: e1.id,
    publicationType: PublicationType.WEEKLY
  })
  await boardDecide(DecisionType.FORMAT_CHANGE, sFmt2.id, {})
  ok(
    'F05-011 CHANGE_FORMAT thiếu publicationType → skip an toàn (giữ WEEKLY, không crash)',
    (await prisma.series.findUnique({ where: { id: sFmt2.id } }))?.publicationType === PublicationType.WEEKLY
  )

  const sComp = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m1.id, editorId: e1.id })
  await boardDecide(DecisionType.COMPLETION, sComp.id)
  ok(
    'F05-012 COMPLETE approve → COMPLETING',
    (await prisma.series.findUnique({ where: { id: sComp.id } }))?.status === SeriesStatus.COMPLETING
  )
  const rFinComp = await req('POST', `/series/${sComp.id}/finalize-ending`, { token: e1Tok, body: {} })
  ok(
    'F05-013 finalize-ending (COMPLETING) → COMPLETED',
    rFinComp.status === 201 &&
      (await prisma.series.findUnique({ where: { id: sComp.id } }))?.status === SeriesStatus.COMPLETED,
    `got ${rFinComp.status} ${rFinComp.raw.slice(0, 150)}`
  )

  const sCan = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m1.id, editorId: e1.id })
  const cCan = await makeContractAt(ContractStatus.FULLY_EXECUTED, {
    seriesId: sCan.id,
    mangakaId: m1.id,
    editorId: e1.id
  })
  await makeChapterAt({ seriesId: sCan.id, chapterNumber: 1, publishedAt: new Date() })
  await makeChapterAt({ seriesId: sCan.id, chapterNumber: 2, publishedAt: new Date() })
  const condAchieved = await makePaymentCondition({
    contractId: cCan.id,
    conditionType: ConditionType.CHAPTER_MILESTONE,
    payoutAmount: 100,
    status: PaymentConditionStatus.ACHIEVED,
    thresholdConfig: { chapterCount: 1, payoutAmount: 100 }
  })
  const condPending = await makePaymentCondition({
    contractId: cCan.id,
    conditionType: ConditionType.CHAPTER_MILESTONE,
    payoutAmount: 900,
    thresholdConfig: { chapterCount: 50, payoutAmount: 900 }
  })
  await boardDecide(DecisionType.CANCELLATION, sCan.id, { endingChapterAllowance: 2 }, 2)
  const sCanAfter = await prisma.series.findUnique({ where: { id: sCan.id } })
  ok(
    'F05-014a CANCEL → CANCELLING + endingChapterAllowance + snapshot chapterCountAtCancelling=2',
    sCanAfter?.status === SeriesStatus.CANCELLING &&
      sCanAfter?.endingChapterAllowance === 2 &&
      sCanAfter?.chapterCountAtCancelling === 2,
    `status=${String(sCanAfter?.status)} allowance=${String(sCanAfter?.endingChapterAllowance)} snapshot=${String(sCanAfter?.chapterCountAtCancelling)}`
  )
  ok(
    'F05-014b series.cancelling → Contract TERMINATED (B-CON-09)',
    await waitUntil(
      async () => (await prisma.contract.findUnique({ where: { id: cCan.id } }))?.status === ContractStatus.TERMINATED,
      10_000,
      500
    )
  )
  ok(
    'F05-014c condition chưa đạt → MISSED',
    await waitUntil(
      async () =>
        (await prisma.paymentCondition.findUnique({ where: { id: condPending.id } }))?.status ===
        PaymentConditionStatus.MISSED,
      10_000,
      500
    )
  )
  ok(
    'F05-015 mốc ĐÃ ACHIEVED trước cancel vẫn giữ ACHIEVED (BR-CONTRACT-04)',
    (await prisma.paymentCondition.findUnique({ where: { id: condAchieved.id } }))?.status ===
      PaymentConditionStatus.ACHIEVED
  )
  const rFinCan = await req('POST', `/series/${sCan.id}/finalize-ending`, { token: e1Tok, body: {} })
  ok(
    'F05-016 finalize-ending (CANCELLING) → CANCELLED',
    rFinCan.status === 201 &&
      (await prisma.series.findUnique({ where: { id: sCan.id } }))?.status === SeriesStatus.CANCELLED,
    `got ${rFinCan.status}`
  )

  const sSer = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m1.id, editorId: e1.id })
  const rFinBad = await req('POST', `/series/${sSer.id}/finalize-ending`, { token: e1Tok, body: {} })
  ok('F05-017 finalize-ending khi SERIALIZED → 409', rFinBad.status === 409, `got ${rFinBad.status}`)

  const sForce = await makeSeriesAt(SeriesStatus.CANCELLING, { mangakaId: m1.id, editorId: e1.id })
  const rForce = await req('POST', `/series/${sForce.id}/force-cancel`, { token: e1Tok, body: {} })
  const sForceAfter = await prisma.series.findUnique({ where: { id: sForce.id } })
  ok(
    'F05-018 force-cancel (CANCELLING) → CANCELLED + statusReason "no ending"',
    (rForce.status === 200 || rForce.status === 201) &&
      sForceAfter?.status === SeriesStatus.CANCELLED &&
      (sForceAfter?.statusReason ?? '').length > 0,
    `got ${rForce.status} reason=${String(sForceAfter?.statusReason)}`
  )
  const rForceBad = await req('POST', `/series/${sSer.id}/force-cancel`, { token: e1Tok, body: {} })
  ok('F05-019 force-cancel khi SERIALIZED → 409', rForceBad.status === 409, `got ${rForceBad.status}`)

  const sProp = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m1.id, editorId: e1.id })
  const rProp = await req('POST', `/series/${sProp.id}/propose-completion`, {
    token: m1Tok,
    body: { reason: 'hết truyện rồi' }
  })
  ok(
    'F05-020a propose-completion bởi MANGAKA (participant) → 2xx',
    rProp.status === 200 || rProp.status === 201,
    `got ${rProp.status} ${rProp.raw.slice(0, 150)}`
  )
  ok(
    'F05-020b propose-completion → notify Editor',
    await waitUntil(
      async () =>
        (await prisma.notification.count({
          where: { recipientId: e1.id, referenceType: 'SERIES_COMPLETION_PROPOSED', referenceId: sProp.id }
        })) === 1,
      10_000,
      500
    )
  )
  const rPropOut = await req('POST', `/series/${sProp.id}/propose-completion`, {
    token: m2Tok,
    body: { reason: 'không phải của tôi' }
  })
  ok('F05-021 propose-completion bởi mangaka NGOÀI cuộc → 403', rPropOut.status === 403, `got ${rPropOut.status}`)

  const sPropDraft = await makeSeriesAt(SeriesStatus.DRAFT, { mangakaId: m1.id })
  const rPropDraft = await req('POST', `/series/${sPropDraft.id}/propose-completion`, {
    token: m1Tok,
    body: { reason: 'x' }
  })
  ok(
    'F05-022 propose-completion khi series chưa SERIALIZED → 409',
    rPropDraft.status === 409,
    `got ${rPropDraft.status}`
  )

  await req('POST', `/series/${sProp.id}/propose-completion`, { token: e1Tok, body: { reason: 'đề xuất lần 2' } })
  const sPropAfter = await prisma.series.findUnique({ where: { id: sProp.id } })
  const compProp = sPropAfter?.completionProposal as { reason?: string } | null
  ok(
    'F05-023 completionProposal composite UPSERT (2 lần đề xuất → giữ bản mới nhất)',
    compProp != null && String(compProp.reason).includes('lần 2'),
    `proposal=${JSON.stringify(compProp)}`
  )
  const auditRows = await prisma.auditLog.findMany({
    where: { entityType: AuditEntityType.SERIES, entityId: sProp.id }
  })
  ok(
    'F05-024 audit SERIES có COMPLETION_PROPOSED',
    auditRows.some((a) => a.action === 'COMPLETION_PROPOSED'),
    `actions=${auditRows.map((a) => a.action).join(',')}`
  )

  // ══════════════════════ LC3 — ENDING + MISC ══════════════════════
  section('LC3 Ending chapters (Flow 5→2) + terminal guards + RBAC')

  const sEnd = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m1.id, editorId: e1.id })
  await makeContractAt(ContractStatus.FULLY_EXECUTED, { seriesId: sEnd.id, mangakaId: m1.id, editorId: e1.id })
  await makeChapterAt({ seriesId: sEnd.id, chapterNumber: 1, publishedAt: new Date() })
  await boardDecide(DecisionType.CANCELLATION, sEnd.id, { endingChapterAllowance: 2 }, 2)
  const sEndAfter = await prisma.series.findUnique({ where: { id: sEnd.id } })
  ok(
    'F05-025 CANCELLING + snapshot=1 (1 chapter đã có)',
    sEndAfter?.status === SeriesStatus.CANCELLING && sEndAfter?.chapterCountAtCancelling === 1,
    `snapshot=${String(sEndAfter?.chapterCountAtCancelling)}`
  )
  const rCh2 = await req('POST', '/chapters', { token: m1Tok, body: { seriesId: sEnd.id, chapterNumber: 2 } })
  ok(
    'F05-026 ending chapter #1 (trong allowance) → 201',
    rCh2.status === 201,
    `got ${rCh2.status} ${rCh2.raw.slice(0, 150)}`
  )
  const rCh3 = await req('POST', '/chapters', { token: m1Tok, body: { seriesId: sEnd.id, chapterNumber: 3 } })
  ok('F05-027 ending chapter #2 (đủ allowance) → 201', rCh3.status === 201, `got ${rCh3.status}`)
  const rCh4 = await req('POST', '/chapters', { token: m1Tok, body: { seriesId: sEnd.id, chapterNumber: 4 } })
  expectError(rCh4, 409, 'Error.EndingAllowanceExceeded', 'F05-028 vượt allowance → 409 EndingAllowanceExceeded')

  const sCompleting = await makeSeriesAt(SeriesStatus.COMPLETING, { mangakaId: m1.id, editorId: e1.id })
  const rChComp = await req('POST', '/chapters', { token: m1Tok, body: { seriesId: sCompleting.id, chapterNumber: 1 } })
  ok('F05-029 COMPLETING → tạo chapter KHÔNG trần → 201', rChComp.status === 201, `got ${rChComp.status}`)

  const sHiaBlock = await makeSeriesAt(SeriesStatus.HIATUS, { mangakaId: m1.id, editorId: e1.id })
  const rChHia = await req('POST', '/chapters', { token: m1Tok, body: { seriesId: sHiaBlock.id, chapterNumber: 1 } })
  expectError(rChHia, 409, 'Error.SeriesNotSerialized', 'F05-030 tạo chapter khi HIATUS → 409 SeriesNotSerialized')

  const rHiaCancelled = await req('POST', `/series/${sCan.id}/hiatus`, { token: e1Tok, body: { reason: 'x' } })
  expectError(rHiaCancelled, 409, 'Error.InvalidSeriesTransition', 'F05-031 CANCELLED terminal: hiatus → 409')
  const rChCancelled = await req('POST', '/chapters', { token: m1Tok, body: { seriesId: sCan.id, chapterNumber: 99 } })
  expectError(rChCancelled, 409, 'Error.SeriesNotSerialized', 'F05-032 tạo chapter khi CANCELLED → 409')

  const sQuorum = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m1.id, editorId: e1.id })
  const { decisionId: decQ } = await boardDecide(
    DecisionType.CANCELLATION,
    sQuorum.id,
    { endingChapterAllowance: 2 },
    2,
    [b1Tok] // chỉ 1/3 phiếu → thiếu quorum
  )
  const decQAfter = await prisma.boardDecision.findUnique({ where: { id: decQ } })
  ok(
    'F05-033 decision CANCELLATION thiếu quorum → không APPROVED + series GIỮ SERIALIZED',
    decQAfter?.result !== 'APPROVED' &&
      (await prisma.series.findUnique({ where: { id: sQuorum.id } }))?.status === SeriesStatus.SERIALIZED,
    `decisionResult=${String(decQAfter?.result)}`
  )

  await boardDecide(DecisionType.CANCELLATION, sEnd.id, { endingChapterAllowance: 2 }, 2)
  const sEndHist = await prisma.series.findUnique({ where: { id: sEnd.id } })
  const cancellingEntries = (sEndHist?.statusHistory ?? []).filter(
    (h) => (h as unknown as { toStatus?: string }).toStatus === SeriesStatus.CANCELLING
  )
  ok(
    'F05-034 decision CANCEL lần 2 → transition no-op (statusHistory chỉ 1 entry CANCELLING)',
    cancellingEntries.length === 1 && sEndHist?.status === SeriesStatus.CANCELLING,
    `entries=${cancellingEntries.length} status=${String(sEndHist?.status)}`
  )

  ok(
    'F05-035 notify owners (M+E) khi board quyết định',
    (await prisma.notification.count({ where: { recipientId: m1.id, referenceId: sCan.id } })) > 0 &&
      (await prisma.notification.count({ where: { recipientId: e1.id, referenceId: sCan.id } })) > 0
  )

  const rDash = await req('GET', `/series/${sCont.id}/defense-dashboard`, { token: e1Tok })
  ok(
    'F05-036a defense-dashboard (EDITOR phụ trách) → 200',
    rDash.status === 200,
    `got ${rDash.status} ${rDash.raw.slice(0, 150)}`
  )
  const rDashM = await req('GET', `/series/${sCont.id}/defense-dashboard`, { token: m1Tok })
  ok('F05-036b defense-dashboard bởi MANGAKA → 403', rDashM.status === 403, `got ${rDashM.status}`)
  const rSeries404 = await req('GET', `/series/${FAKE_ID}`, { token: m1Tok })
  expectError(rSeries404, 404, 'Error.SeriesNotFound', 'F05-036c GET series id rác → 404 SeriesNotFound')

  await prisma.$disconnect()
  const fail = summary(FLOW)
  await sleep(300)
  process.exit(fail > 0 ? 1 : 0)
}

void main().catch(async (e) => {
  console.error('FATAL', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
