/**
 * Cross-cutting Event Chain (spec §18) — 10 case.
 *
 * Verify TỪNG cặp emit→listen bằng SIDE-EFFECT DB thật (không mock, không đọc log).
 * Mỗi case isolate: seed đúng tiền đề → kích hoạt qua API/Prisma → assert hệ quả.
 *
 * EV-01 NameApproved(PROPOSAL) → Series READY_TO_PITCH
 * EV-02 NameApproved(CHAPTER)  → Series KHÔNG đổi trạng thái
 * EV-03 ContractAmendmentRequested (từ CHANGE_FORMAT) → amendment DRAFT + notify Editor
 * EV-04 assistant.availability.changed → task ON_HOLD
 * EV-05 chapter.published (payload CÓ chapterNumber) → payment engine đếm chương → PaymentRecord
 * EV-06 series.serialized → contract createDraft gate (trước serialize 409, sau → 201)
 * EV-07 series.cancelling → payment engine terminate contract
 * EV-08 series hiatus/resume → TIME_BOUND pause (DISABLED) → resume (PENDING)
 * EV-09 RankingFinalized → payload rankings[] không rỗng (RankingRecord được tạo)
 * EV-10 BoardDecisionFinalized flip-terminal → vote muộn KHÔNG re-emit (series không transition lần 2)
 */

import {
  SeriesStatus,
  ContractStatus,
  ConditionType,
  PaymentConditionStatus,
  ManuscriptStatus,
  NameKind,
  NameStatus,
  PageStatus,
  TaskStatus,
  DecisionType,
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
  makeNameAt,
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
import { login } from './lib/auth.js'
import { waitUntil } from './lib/cron.js'

const FLOW = 'cross-events'

const main = async () => {
  resetCounters()
  console.log(`\n##### ${FLOW} #####`)
  await wipeDb()
  await seedRolesAndAdmin()
  await setBoardConfig({ boardTotalMembers: 3, quorumMin: 3, approveMajorityRatio: 0.5 })

  const m1 = await makeUser(RoleCode.MANGAKA)
  const a1 = await makeUser(RoleCode.ASSISTANT)
  const e1 = await makeUser(RoleCode.EDITOR)
  const b1 = await makeUser(RoleCode.BOARD_MEMBER)
  const b2 = await makeUser(RoleCode.BOARD_MEMBER)
  const b3 = await makeUser(RoleCode.BOARD_MEMBER)
  const a1Tok = await login(a1.email)
  const e1Tok = await login(e1.email)
  const boardToks = [await login(b1.email), await login(b2.email), await login(b3.email)]

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

  // ── EV-01 NameApproved(PROPOSAL) → Series READY_TO_PITCH ──
  section('EV-01/02 NameApproved → series listener')
  const sProp = await makeSeriesAt(SeriesStatus.IN_REVIEW, {
    mangakaId: m1.id,
    editorId: e1.id,
    proposalStatus: 'PROPOSAL_APPROVED'
  })
  const nProp = await makeNameAt({
    seriesId: sProp.id,
    kind: NameKind.PROPOSAL,
    status: NameStatus.IN_REVIEW
  })
  await prisma.series.update({
    where: { id: sProp.id },
    data: { proposal: { set: { ...(sProp.proposal as object), nameId: nProp.id } } as never }
  })
  const rApproveName = await req('POST', `/series/${sProp.id}/names/${nProp.id}/approve`, { token: e1Tok, body: {} })
  ok(
    'EV-01 NameApproved(kind=PROPOSAL) → Series IN_REVIEW → READY_TO_PITCH',
    rApproveName.status === 201 &&
      (await waitUntil(
        async () =>
          (await prisma.series.findUnique({ where: { id: sProp.id } }))?.status === SeriesStatus.READY_TO_PITCH,
        8_000,
        400
      )),
    `approve=${rApproveName.status} status=${String((await prisma.series.findUnique({ where: { id: sProp.id } }))?.status)}`
  )

  // ── EV-02 NameApproved(CHAPTER) → series KHÔNG đổi ──
  const sSer = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m1.id, editorId: e1.id })
  const chName = await makeChapterAt({ seriesId: sSer.id, chapterNumber: 1 })
  const nChap = await makeNameAt({
    seriesId: sSer.id,
    chapterId: chName.id,
    chapterNumber: 1,
    kind: NameKind.CHAPTER,
    status: NameStatus.IN_REVIEW
  })
  await prisma.chapter.update({ where: { id: chName.id }, data: { nameId: nChap.id } })
  const rApproveChName = await req('POST', `/chapters/${chName.id}/names/${nChap.id}/approve`, {
    token: e1Tok,
    body: {}
  })
  await sleep(800)
  ok(
    'EV-02 NameApproved(kind=CHAPTER) → series GIỮ SERIALIZED (listener no-op)',
    rApproveChName.status === 201 &&
      (await prisma.series.findUnique({ where: { id: sSer.id } }))?.status === SeriesStatus.SERIALIZED,
    `approve=${rApproveChName.status}`
  )

  // ── EV-06 series.serialized → contract createDraft gate ──
  section('EV-06 series.serialized → contract gate')
  const sPitched = await makeSeriesAt(SeriesStatus.PITCHED, { mangakaId: m1.id, editorId: e1.id })
  // boardDecisionId + contractStart/End là field BẮT BUỘC của POST /contracts (schema thật).
  const preSession = await makeBoardSession({ creatorId: e1.id, allowedEditorIds: [b1.id, b2.id, b3.id] })
  const preDecision = await makeBoardDecision({
    sessionId: preSession.id,
    decisionType: DecisionType.SERIALIZATION,
    targetSeriesId: sPitched.id
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
  await boardDecide(DecisionType.SERIALIZATION, sPitched.id, {
    magazine: 'EV Jump',
    startIssueNumber: 1,
    publicationType: 'WEEKLY'
  })
  const sPitchedAfter = await prisma.series.findUnique({ where: { id: sPitched.id } })
  ok(
    'EV-06b BoardDecisionFinalized(SERIALIZATION) → Series SERIALIZED + slot set',
    sPitchedAfter?.status === SeriesStatus.SERIALIZED &&
      sPitchedAfter?.magazine === 'EV Jump' &&
      sPitchedAfter?.startIssueNumber === 1,
    `status=${String(sPitchedAfter?.status)} magazine=${String(sPitchedAfter?.magazine)}`
  )
  const rDraftAfter = await req('POST', '/contracts', { token: e1Tok, body: draftBody })
  ok(
    'EV-06c series.serialized → createDraft mở cổng → 201',
    rDraftAfter.status === 201,
    `got ${rDraftAfter.status} ${rDraftAfter.raw.slice(0, 140)}`
  )

  // ── EV-10 flip-terminal: vote muộn KHÔNG re-emit ──
  section('EV-10 BoardDecisionFinalized flip-terminal guard')
  const b4 = await makeUser(RoleCode.BOARD_MEMBER)
  const b4Tok = await login(b4.email)
  const sFlip = await makeSeriesAt(SeriesStatus.PITCHED, { mangakaId: m1.id, editorId: e1.id })
  const rsFlip = await req('POST', '/board/sessions', {
    token: e1Tok,
    body: {
      title: `EV flip ${Date.now()}`,
      startTime: new Date(Date.now() + 60_000).toISOString(),
      allowedEditorIds: [b1.id, b2.id, b3.id, b4.id, m1.id] // 5 = lẻ
    }
  })
  const flipSession = rsFlip.json.data.id as string
  await prisma.boardSession.update({ where: { id: flipSession }, data: { startTime: new Date(Date.now() - 5_000) } })
  await req('PATCH', `/board/sessions/${flipSession}/start`, { token: e1Tok })
  const rdFlip = await req('POST', '/board/decisions', {
    token: e1Tok,
    body: {
      boardSessionId: flipSession,
      decisionType: DecisionType.SERIALIZATION,
      targetSeriesId: sFlip.id,
      allowedEditorIds: [b1.id, b2.id, b3.id, b4.id, m1.id],
      details: { magazine: 'Flip', startIssueNumber: 2, publicationType: 'WEEKLY' }
    }
  })
  const flipDecision = rdFlip.json.data.id as string
  for (const t of boardToks) {
    await req('POST', `/board/decisions/${flipDecision}/vote`, { token: t, body: { voteValue: 'APPROVE' } })
  }
  await sleep(900)
  const rLateVote = await req('POST', `/board/decisions/${flipDecision}/vote`, {
    token: b4Tok,
    body: { voteValue: 'APPROVE' }
  })
  await sleep(900)
  const sFlipAfter = await prisma.series.findUnique({ where: { id: sFlip.id } })
  const serializedEntries = (sFlipAfter?.statusHistory ?? []).filter(
    (h) => (h as unknown as { toStatus?: string }).toStatus === SeriesStatus.SERIALIZED
  )
  ok(
    'EV-10 vote đến SAU khi decision terminal → KHÔNG re-emit (statusHistory chỉ 1 entry SERIALIZED)',
    sFlipAfter?.status === SeriesStatus.SERIALIZED && serializedEntries.length === 1,
    `lateVote=${rLateVote.status} entries=${serializedEntries.length}`
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
  const pgTask = await makePageAt({ chapterId: chTask.id, pageNumber: 1, status: PageStatus.IN_PROGRESS })
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
  const rFinalize = await req('POST', `/survey-periods/${period.id}/finalize`, { token: e1Tok, body: {} })
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
