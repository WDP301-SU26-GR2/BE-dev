/**
 * Cross-cutting Event Chain (spec §18) — 10 case.
 *
 * Verify TỪNG cặp emit→listen bằng SIDE-EFFECT DB thật (không mock, không đọc log).
 * Mỗi case isolate: seed đúng tiền đề → kích hoạt qua API/Prisma → assert hệ quả.
 *
 * EV-01 Composite proposal approved → Series READY_TO_PITCH (Spec 28 — single approval)
 * EV-02 StoryboardApproved has no kind, seeds chapter stages, and leaves Series unchanged
 * EV-03 ContractAmendmentRequested (từ CHANGE_FORMAT) → amendment DRAFT + notify Editor
 * EV-04 assistant.availability.changed → task ON_HOLD
 * EV-05 chapter.published (payload CÓ chapterNumber) → payment engine đếm chương → PaymentRecord
 * EV-06 series.serialized → contract createDraft gate (trước serialize 409, sau → 201)
 * EV-07 series.cancelling → payment engine terminate contract
 * EV-08 series hiatus/resume → TIME_BOUND pause (DISABLED) → resume (PENDING)
 * EV-09 RankingFinalized → payload rankings[] không rỗng (RankingRecord được tạo)
 * EV-10 quorum 2/3 roster + DecisionAlreadyFinalized → vote muộn 409, KHÔNG re-emit
 */

import {
  SeriesStatus,
  ContractStatus,
  ConditionType,
  PaymentConditionStatus,
  ManuscriptStatus,
  StoryboardStatus,
  PageStatus,
  TaskStatus,
  DecisionType,
  BoardDecisionResult,
  RoleCode,
  SurveyStatus,
  Specialization
} from '@prisma/client'
import {
  wipeDb,
  seedRolesAndAdmin,
  prisma,
  makeUser,
  makeSeriesAt,
  makeContractAt,
  makeChapterAt,
  makeChapterStoryboardAt,
  makePageAt,
  makeTaskAt,
  makeStudioAssignment,
  makeSurveyPeriod,
  makePaymentCondition,
  makeBoardSession,
  makeBoardDecision,
  setBoardConfig
} from './lib/seed.js'
import { req, ok, section, summary, resetCounters, sleep } from './lib/http.js'
import { login, ensureMangakaProfile } from './lib/auth.js'
import { waitUntil } from './lib/cron.js'

const FLOW = 'cross-events'

const main = async () => {
  resetCounters()
  console.log(`\n##### ${FLOW} #####`)
  await wipeDb()
  await seedRolesAndAdmin()
  // quorumMin chỉ là roster-default; quorum vote thực tế luôn là ceil(2/3 roster của session).
  await setBoardConfig({ boardTotalMembers: 3, quorumMin: 3, approveMajorityRatio: 0.5 })

  const m1 = await makeUser(RoleCode.MANGAKA)
  const a1 = await makeUser(RoleCode.ASSISTANT)
  const e1 = await makeUser(RoleCode.EDITOR)
  const b1 = await makeUser(RoleCode.BOARD_MEMBER)
  const b2 = await makeUser(RoleCode.BOARD_MEMBER)
  const b3 = await makeUser(RoleCode.BOARD_MEMBER)
  // Kỳ bình chọn là đơn vị cấp tạp chí → mọi mutation survey nay SUPER_ADMIN-only (xem §84).
  const sa1 = await makeUser(RoleCode.SUPER_ADMIN)
  const sa1Tok = await login(sa1.email)
  const m1Tok = await login(m1.email)
  await ensureMangakaProfile(m1Tok, 'FT XE M1') // BR 2026-08-04: submit cần hồ sơ Mangaka
  const a1Tok = await login(a1.email)
  const e1Tok = await login(e1.email)
  const boardToks = [await login(b1.email), await login(b2.email), await login(b3.email)]

  // Helper vote đến khi decision terminal; phiếu thừa sau khi chốt có thể trả 409 và được bỏ qua.
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
        title: `EV ${Date.now()}`,
        startTime: new Date(Date.now() + 60_000).toISOString(),
        allowedEditorIds: [b1.id, b2.id, b3.id]
      }
    })
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
    const decisionId = rd.json.data.id as string
    for (const t of voters) {
      await req('POST', `/board/decisions/${decisionId}/vote`, { token: t, body: { voteValue: 'APPROVE' } })
    }
    await sleep(800)
    return { sessionId, decisionId }
  }

  // ── EV-01 Composite proposal approve → Series READY_TO_PITCH (Spec 28 — single approval) ──
  section('EV-01/02 series approval + chapter storyboard listener')
  // Spec 28: composite proposal — tạo qua API rồi submit/claim/approve, status = READY_TO_PITCH.
  const evPropRes = await req('POST', '/series/proposals', {
    token: m1Tok,
    body: {
      title: 'EV Proposal Composite',
      genres: ['ACTION'],
      demographic: 'SHONEN',
      synopsis: 'ev synopsis',
      storyboardPages: [{ pageNumber: 1, fileUrl: 'flowtest/sb-1.png' }]
    }
  })
  const sPropFreshId = evPropRes.json?.data?.id as string
  await req('POST', `/series/${sPropFreshId}/submit`, { token: m1Tok })
  await req('POST', `/series/${sPropFreshId}/claim`, { token: e1Tok })
  const rApproveProp = await req('POST', `/series/${sPropFreshId}/proposal/approve`, { token: e1Tok, body: {} })
  ok(
    'EV-01 Composite proposal approved → Series IN_REVIEW → READY_TO_PITCH (single approval, Spec 28)',
    rApproveProp.status === 201 &&
      (await waitUntil(
        async () =>
          (await prisma.series.findUnique({ where: { id: sPropFreshId } }))?.status === SeriesStatus.READY_TO_PITCH,
        8_000,
        400
      )),
    `approve=${rApproveProp.status} status=${String((await prisma.series.findUnique({ where: { id: sPropFreshId } }))?.status)}`
  )

  // ── EV-02 StoryboardApproved { seriesId, storyboardId, chapterId } ──
  // Approval seeds the chapter production stages but must not change Series.status.
  const sSer = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m1.id, editorId: e1.id })
  const chapter = await makeChapterAt({ seriesId: sSer.id, chapterNumber: 1 })
  const storyboard = await makeChapterStoryboardAt({
    seriesId: sSer.id,
    chapterId: chapter.id,
    status: StoryboardStatus.IN_REVIEW
  })
  await prisma.chapter.update({ where: { id: chapter.id }, data: { storyboardId: storyboard.id } })
  const sBefore = await prisma.series.findUnique({ where: { id: sSer.id } })
  const approveStoryboard = await req('POST', `/chapters/${chapter.id}/storyboards/${storyboard.id}/approve`, {
    token: e1Tok,
    body: {}
  })
  await sleep(800)
  const sAfter = await prisma.series.findUnique({ where: { id: sSer.id } })
  const seededStages = await prisma.productionStage.findMany({
    where: { chapterId: chapter.id },
    orderBy: { order: 'asc' }
  })
  ok(
    'EV-02 StoryboardApproved seeds 4 stages and keeps Series SERIALIZED',
    approveStoryboard.status === 201 &&
      seededStages.length === 4 &&
      seededStages[0]?.name === 'INKING' &&
      seededStages[0]?.status === 'ACTIVE' &&
      sAfter?.status === SeriesStatus.SERIALIZED &&
      sAfter?.status === sBefore?.status,
    `approve=${approveStoryboard.status} stages=${seededStages.map((stage) => `${stage.name}:${stage.status}`).join(',')} before=${sBefore?.status} after=${sAfter?.status}`
  )

  // ── EV-06 series.serialized → contract createDraft gate ──
  section('EV-06 series.serialized → contract gate')
  const sPitched = await makeSeriesAt(SeriesStatus.PITCHED, { mangakaId: m1.id, editorId: e1.id })
  // boardDecisionId + contractStart/End là field BẮT BUỘC của POST /contracts (schema thật).
  const preSession = await makeBoardSession({ creatorId: e1.id, allowedEditorIds: [b1.id, b2.id, b3.id] })
  // Spec 2026-08-06 C1: một series chỉ được có MỘT quyết định CHƯA terminal. `preDecision` chỉ phục vụ
  // EV-06a (createDraft khi series chưa SERIALIZED → 409, không phụ thuộc result), nên để nó TERMINAL
  // (REJECTED) — nếu để PENDING sẽ chặn quyết định serial hoá thật ở dưới (409 OpenBoardDecisionExists).
  const preDecision = await makeBoardDecision({
    sessionId: preSession.id,
    decisionType: DecisionType.SERIALIZATION,
    targetSeriesId: sPitched.id,
    result: BoardDecisionResult.REJECTED
  })
  const draftBody = {
    seriesId: sPitched.id,
    mangakaId: m1.id,
    boardDecisionId: preDecision.id,
    contractType: 'REVENUE_SHARE',
    valuationAmount: 1000,
    publisherOwnershipPct: 70,
    mangakaOwnershipPct: 30,
    terminationClause: 'compensation:100',
    contractStart: new Date().toISOString(),
    contractEnd: new Date(Date.now() + 365 * 86_400_000).toISOString()
  }
  const rDraftBefore = await req('POST', '/contracts', { token: e1Tok, body: draftBody })
  ok(
    'EV-06a createDraft khi series chưa SERIALIZED → 409 SeriesNotSerialized',
    rDraftBefore.status === 409,
    `got ${rDraftBefore.status} ${rDraftBefore.raw.slice(0, 140)}`
  )
  const { decisionId: approvedSerializationId } = await boardDecide(DecisionType.SERIALIZATION, sPitched.id, {
    magazine: 'EV Jump',
    startIssueNumber: 1,
    publicationType: 'WEEKLY'
  })
  // Series transition (SERIALIZED + slot) chạy qua listener SAU khi BoardDecisionFinalized emit —
  // poll thay vì tin sleep cố định (chống flake dưới tải, §74.8). Assertion GIỮ NGUYÊN.
  const serializedOk = await waitUntil(
    async () => {
      const s = await prisma.series.findUnique({ where: { id: sPitched.id } })
      return s?.status === SeriesStatus.SERIALIZED && s?.magazine === 'EV Jump' && s?.startIssueNumber === 1
    },
    8_000,
    400
  )
  const sPitchedAfter = await prisma.series.findUnique({ where: { id: sPitched.id } })
  ok(
    'EV-06b BoardDecisionFinalized(SERIALIZATION) → Series SERIALIZED + slot set',
    serializedOk &&
      sPitchedAfter?.status === SeriesStatus.SERIALIZED &&
      sPitchedAfter?.magazine === 'EV Jump' &&
      sPitchedAfter?.startIssueNumber === 1,
    `status=${String(sPitchedAfter?.status)} magazine=${String(sPitchedAfter?.magazine)}`
  )
  // Gate createDraft (commit 6cbd57e) đòi decision phải đúng bộ ba (targetSeriesId, SERIALIZATION, APPROVED).
  // `preDecision` ở trên là REJECTED (terminal — xem note C1), KHÔNG dùng lại được ở đây; phải trỏ vào chính
  // decision vừa được Board bỏ phiếu DUYỆT (`approvedSerializationId`). Đừng "sửa cho xanh" bằng cách nới gate:
  // hợp đồng bắt buộc phải viện dẫn đúng quyết định serial hoá đã được thông qua.
  const rDraftAfter = await req('POST', '/contracts', {
    token: e1Tok,
    body: { ...draftBody, boardDecisionId: approvedSerializationId }
  })
  ok(
    'EV-06c series.serialized → createDraft mở cổng → 201',
    rDraftAfter.status === 201,
    `got ${rDraftAfter.status} ${rDraftAfter.raw.slice(0, 140)}`
  )

  // ── EV-10 quorum 2/3 roster + late-vote khóa sổ (Spec 17) ──
  section('EV-10 quorum 2/3 + DecisionAlreadyFinalized')
  const b4 = await makeUser(RoleCode.BOARD_MEMBER)
  const b5 = await makeUser(RoleCode.BOARD_MEMBER)
  const b4Tok = await login(b4.email)
  const b5Tok = await login(b5.email)
  const sFlip = await makeSeriesAt(SeriesStatus.PITCHED, { mangakaId: m1.id, editorId: e1.id })
  const rsFlip = await req('POST', '/board/sessions', {
    token: e1Tok,
    body: {
      title: `EV flip ${Date.now()}`,
      startTime: new Date(Date.now() + 60_000).toISOString(),
      allowedEditorIds: [b1.id, b2.id, b3.id, b4.id, b5.id] // 5 board members, lẻ
    }
  })
  const flipSession = rsFlip.json.data.id as string
  await prisma.boardSession.update({ where: { id: flipSession }, data: { startTime: new Date(Date.now() - 5_000) } })
  await req('PATCH', `/board/sessions/${flipSession}/start`, { token: e1Tok })
  await req('PATCH', `/board/sessions/${flipSession}/phase`, { token: e1Tok, body: { phase: 'VOTING' } })
  const rdFlip = await req('POST', '/board/decisions', {
    token: e1Tok,
    body: {
      boardSessionId: flipSession,
      decisionType: DecisionType.SERIALIZATION,
      targetSeriesId: sFlip.id,
      allowedEditorIds: [b1.id, b2.id, b3.id, b4.id, b5.id],
      details: { magazine: 'Flip', startIssueNumber: 2, publicationType: 'WEEKLY' }
    }
  })
  const flipDecision = rdFlip.json.data.id as string
  for (const t of boardToks) {
    await req('POST', `/board/decisions/${flipDecision}/vote`, { token: t, body: { voteValue: 'APPROVE' } })
  }
  await sleep(400)
  const dec3 = await prisma.boardDecision.findUnique({ where: { id: flipDecision } })
  const sMid = await prisma.series.findUnique({ where: { id: sFlip.id } })
  ok(
    'EV-10a 3/5 phiếu → PENDING_QUORUM, series vẫn PITCHED',
    dec3?.result === 'PENDING_QUORUM' && sMid?.status === SeriesStatus.PITCHED,
    `result=${dec3?.result} series=${sMid?.status}`
  )

  await req('POST', `/board/decisions/${flipDecision}/vote`, {
    token: b4Tok,
    body: { voteValue: 'APPROVE' }
  })
  // Phiếu 4 → quorum đủ → decision APPROVED → listener transition series SERIALIZED (async).
  // Poll tới khi đúng 1 entry SERIALIZED (chống flake, thay 2×sleep cố định). Assertion GIỮ NGUYÊN.
  const flipSerializedOk = await waitUntil(
    async () => {
      const s = await prisma.series.findUnique({ where: { id: sFlip.id } })
      const entries = (s?.statusHistory ?? []).filter(
        (h) => (h as unknown as { toStatus?: string }).toStatus === SeriesStatus.SERIALIZED
      )
      return s?.status === SeriesStatus.SERIALIZED && entries.length === 1
    },
    10_000,
    400
  )
  const sFlipAfter = await prisma.series.findUnique({ where: { id: sFlip.id } })
  const serializedEntries = (sFlipAfter?.statusHistory ?? []).filter(
    (h) => (h as unknown as { toStatus?: string }).toStatus === SeriesStatus.SERIALIZED
  )
  ok(
    'EV-10b phiếu 4 → APPROVED → series SERIALIZED (1 entry)',
    flipSerializedOk && sFlipAfter?.status === SeriesStatus.SERIALIZED && serializedEntries.length === 1,
    `status=${sFlipAfter?.status} entries=${serializedEntries.length}`
  )

  const rLateVote = await req('POST', `/board/decisions/${flipDecision}/vote`, {
    token: b5Tok,
    body: { voteValue: 'APPROVE' }
  })
  await sleep(400)
  const serializedEntries2 = (
    (await prisma.series.findUnique({ where: { id: sFlip.id } }))?.statusHistory ?? []
  ).filter((h) => (h as unknown as { toStatus?: string }).toStatus === SeriesStatus.SERIALIZED)
  ok(
    'EV-10c vote sau terminal → 409 DecisionAlreadyFinalized, vẫn 1 entry',
    rLateVote.status === 409 &&
      rLateVote.raw.includes('Error.DecisionAlreadyFinalized') &&
      serializedEntries2.length === 1,
    `lateVote=${rLateVote.status} body=${rLateVote.raw.slice(0, 120)} entries=${serializedEntries2.length}`
  )

  // ── EV-03 ContractAmendmentRequested (từ CHANGE_FORMAT) ──
  section('EV-03 CHANGE_FORMAT → ContractAmendmentRequested')
  const sFmt = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m1.id, editorId: e1.id })
  const cFmt = await makeContractAt(ContractStatus.FULLY_EXECUTED, {
    seriesId: sFmt.id,
    mangakaId: m1.id,
    editorId: e1.id
  })
  await boardDecide(DecisionType.FORMAT_CHANGE, sFmt.id, { publicationType: 'MONTHLY' })
  ok(
    'EV-03a ContractAmendmentRequested → ContractAmendment DRAFT stub',
    await waitUntil(
      async () => (await prisma.contractAmendment.count({ where: { contractId: cFmt.id, status: 'DRAFT' } })) === 1,
      10_000,
      500
    )
  )
  ok(
    'EV-03b → notify Editor (CONTRACT_AMENDMENT_NEEDED)',
    await waitUntil(
      async () =>
        (await prisma.notification.count({
          where: { recipientId: e1.id, referenceType: 'CONTRACT_AMENDMENT_NEEDED' }
        })) >= 1,
      10_000,
      500
    )
  )

  // ── EV-04 assistant.availability.changed → task ON_HOLD ──
  section('EV-04 availability → task ON_HOLD')
  const chTask = await makeChapterAt({
    seriesId: sSer.id,
    chapterNumber: 2,
    manuscriptStatus: ManuscriptStatus.IN_PRODUCTION
  })
  const pgTask = await makePageAt({ chapterId: chTask.id, pageNumber: 1, status: PageStatus.DRAFT })
  await makeStudioAssignment({ mangakaId: m1.id, assistantId: a1.id, seriesId: sSer.id })
  const tHold = await makeTaskAt({ pageId: pgTask.id, assistantId: a1.id, status: TaskStatus.IN_PROGRESS })
  await req('PUT', '/me/assistant-profile', {
    token: a1Tok,
    body: {
      specializations: [Specialization.INKING],
      experienceLevel: 'MID',
      portfolioFiles: [],
      availabilityStatus: 'ON_LEAVE'
    }
  })
  ok(
    'EV-04 assistant.availability.changed(ON_LEAVE) → task IN_PROGRESS → ON_HOLD',
    await waitUntil(
      async () => (await prisma.task.findUnique({ where: { id: tHold.id } }))?.status === TaskStatus.ON_HOLD,
      10_000,
      500
    ),
    `status=${String((await prisma.task.findUnique({ where: { id: tHold.id } }))?.status)}`
  )

  // ── EV-05 chapter.published (chapterNumber trong payload) → payment engine ──
  section('EV-05 chapter.published → payment engine (RECURRING_CHAPTER)')
  const sPub = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m1.id, editorId: e1.id })
  const cPub = await makeContractAt(ContractStatus.FULLY_EXECUTED, {
    seriesId: sPub.id,
    mangakaId: m1.id,
    editorId: e1.id
  })
  // ⚠ Key thật engine đọc = `every` (payment-engine.handleRecurringChapter), KHÔNG phải everyNChapters.
  await makePaymentCondition({
    contractId: cPub.id,
    conditionType: ConditionType.RECURRING_CHAPTER,
    payoutAmount: 200,
    isRecurring: true,
    thresholdConfig: { every: 1, payoutAmount: 200, isRecurring: true }
  })
  const chPub = await makeChapterAt({
    seriesId: sPub.id,
    chapterNumber: 1,
    manuscriptStatus: ManuscriptStatus.READY_FOR_PRINT
  })
  const rPublish = await req('POST', `/chapters/${chPub.id}/publish`, { token: e1Tok, body: {} })
  ok(
    'EV-05a publish chapter → 201 (contract FULLY_EXECUTED nên qua gate)',
    rPublish.status === 201,
    `got ${rPublish.status} ${rPublish.raw.slice(0, 140)}`
  )
  ok(
    'EV-05b chapter.published (payload CÓ chapterNumber) → engine tạo PaymentRecord RECURRING',
    await waitUntil(
      async () => (await prisma.paymentRecord.count({ where: { contractId: cPub.id } })) >= 1,
      12_000,
      500
    ),
    `records=${await prisma.paymentRecord.count({ where: { contractId: cPub.id } })}`
  )

  // ── EV-08 hiatus/resume → TIME_BOUND pause/resume ──
  section('EV-08 hiatus/resume → TIME_BOUND pause')
  const condTB = await makePaymentCondition({
    contractId: cPub.id,
    conditionType: ConditionType.TIME_BOUND,
    payoutAmount: 300,
    thresholdConfig: {
      deadline: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      chapterTarget: 5,
      payoutAmount: 300
    }
  })
  await req('POST', `/series/${sPub.id}/hiatus`, { token: e1Tok, body: { reason: 'nghỉ' } })
  ok(
    'EV-08a series.hiatus.started → TIME_BOUND DISABLED (dừng đồng hồ)',
    await waitUntil(
      async () =>
        (await prisma.paymentCondition.findUnique({ where: { id: condTB.id } }))?.status ===
        PaymentConditionStatus.DISABLED,
      10_000,
      500
    )
  )
  await req('POST', `/series/${sPub.id}/resume`, { token: e1Tok, body: {} })
  ok(
    'EV-08b series.hiatus.ended → TIME_BOUND PENDING (chạy lại)',
    await waitUntil(
      async () =>
        (await prisma.paymentCondition.findUnique({ where: { id: condTB.id } }))?.status ===
        PaymentConditionStatus.PENDING,
      10_000,
      500
    )
  )

  // ── EV-07 series.cancelling → payment engine terminate ──
  section('EV-07 series.cancelling → contract TERMINATED')
  const sCan = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m1.id, editorId: e1.id })
  const cCan = await makeContractAt(ContractStatus.FULLY_EXECUTED, {
    seriesId: sCan.id,
    mangakaId: m1.id,
    editorId: e1.id
  })
  await boardDecide(DecisionType.CANCELLATION, sCan.id, { endingChapterAllowance: 2 }, 2)
  ok(
    'EV-07 series.cancelling → payment engine set Contract TERMINATED (B-CON-09)',
    await waitUntil(
      async () => (await prisma.contract.findUnique({ where: { id: cCan.id } }))?.status === ContractStatus.TERMINATED,
      12_000,
      500
    ),
    `status=${String((await prisma.contract.findUnique({ where: { id: cCan.id } }))?.status)}`
  )

  // ── EV-09 RankingFinalized → rankings[] không rỗng ──
  section('EV-09 RankingFinalized → RankingRecord')
  const period = await makeSurveyPeriod({ createdBy: e1.id, issueNumber: 99, status: SurveyStatus.CLOSED })
  // SurveyData KHÔNG có issueNumber/reflectedIssueNumber (nằm ở SurveyPeriod) — chỉ entries offline.
  await prisma.surveyData.create({
    data: {
      surveyPeriodId: period.id,
      importedBy: e1.id,
      surveyDate: new Date(),
      entries: [{ seriesId: sSer.id, voteCount: 10 }] as never
    }
  })
  const rFinalize = await req('POST', `/survey-periods/${period.id}/finalize`, { token: sa1Tok, body: {} })
  ok(
    'EV-09 finalize → RankingRecord tạo (payload rankings[] không rỗng)',
    (rFinalize.status === 200 || rFinalize.status === 201 || rFinalize.status === 202) &&
      (await waitUntil(
        async () => (await prisma.rankingRecord.count({ where: { surveyPeriodId: period.id } })) >= 1,
        12_000,
        500
      )),
    `finalize=${rFinalize.status} ${rFinalize.raw.slice(0, 140)}`
  )

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
