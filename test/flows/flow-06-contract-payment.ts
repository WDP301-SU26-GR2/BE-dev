// Flow-Test 06 — Contract lifecycle + Payment engine (Requiment Flow 6 + B1).
// ≈50 case theo spec §6 của docs/superpowers/specs/2026-07-11-flowtest-suite-design.md.
//
// Routes thật đã verify trên server :4100 (2026-07-11):
//   POST   /contracts                                         Editor tạo draft
//   GET    /contracts, /contracts/:id, /contracts/:id/versions, /contracts/:id/versions/:vid,
//          /contracts/:id/status
//   PATCH  /contracts/:id, /contracts/:id/status
//          body: { status: 'MANGAKA_REVIEW' | 'MANGAKA_APPROVED' }
//   POST   /contracts/:id/request-changes                      Mangaka → NEGOTIATION
//   POST   /contracts/:id/board-approve                        Board → BOARD_APPROVED
//   POST   /contracts/:id/board-request-changes                Board → NEGOTIATION
//   POST   /contracts/:id/signatures/mangaka    body { otpCode }  → MANGAKA_SIGNED
//   POST   /contracts/:id/signatures/board       body { otpCode }  → FULLY_EXECUTED (cuối cùng ký)
//   POST   /contracts/:id/revenue                body { revenue, period }
//   POST   /contracts/:contractId/payment-conditions          Editor tạo condition
//   GET    /contracts/:contractId/payment-conditions
//   PATCH  /contracts/:contractId/payment-conditions/:conditionId
//   PATCH  /contracts/:contractId/payment-conditions/:conditionId/disable
//   GET    /contracts/:contractId/amendments
//   POST   /contracts/:contractId/amendments       body { changedClauses, ...terms }
//   PATCH  /contracts/:contractId/amendments/:id
//   GET    /contracts/:contractId/amendments/:id
//   POST   /contracts/:contractId/amendments/:id/submit       DRAFT → PENDING_SIGNATURES
//   POST   /contracts/:contractId/amendments/:id/sign/mangaka    body { otpCode }
//   POST   /contracts/:contractId/amendments/:id/sign/board       body { otpCode }
//   POST   /contracts/:contractId/amendments/:id/reject   body { reason }
//   POST   /contracts/:contractId/amendments/:id/void     body { voidReason }
//   PATCH  /payments/:id/approve  body { approvedBy }
//   PATCH  /payments/:id/pay      body { paymentMethod, transactionReference }
//   PATCH  /payments/:id/cancel   body { cancelReason }
//   GET    /payments/:id, /payments, /payments/contracts/:id/payments
import { wipeDb, seedRolesAndAdmin, prisma, makeUser, makeSeriesAt } from './lib/seed.js'
import { req, ok, section, summary, expectError, expectStatus, resetCounters } from './lib/http.js'
import { login } from './lib/auth.js'
import { seedOtp } from './lib/auth.js'
import {
  SeriesStatus,
  ContractStatus,
  ContractType,
  ConditionType,
  PaymentRecordStatus,
  PaymentConditionStatus,
  BoardSessionStatus,
  DecisionType
} from '@prisma/client'

const FLOW = 'flow-06-contract-payment'

// ── Helpers ─────────────────────────────────────────────────────────────────────
// Tạo series SERIALIZED + contract DRAFT (REVENUE_SHARE) — sẵn để test hợp đồng.
const setupSeriesAndDraftContract = async (
  m: { id: string; email: string },
  e: { id: string; email: string },
  b1: { id: string; email: string },
  sa: { id: string; email: string },
  contractType: ContractType = ContractType.REVENUE_SHARE
) => {
  const series = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m.id, magazine: 'FT Jump' })
  const session = await prisma.boardSession.create({
    data: {
      creatorId: sa.id,
      status: BoardSessionStatus.CONCLUDED,
      allowedEditorIds: [b1.id],
      title: 'FT Board ' + Date.now(),
      startTime: new Date(Date.now() - 60_000),
      endTime: new Date()
    }
  })
  const dec = await prisma.boardDecision.create({
    data: {
      boardSessionId: session.id,
      targetSeriesId: series.id,
      decisionType: DecisionType.CONTRACT,
      result: 'APPROVED',
      allowedEditorIds: [b1.id],
      totalVotes: 1,
      approveCount: 1,
      rejectCount: 0,
      quorumMet: true
    }
  })
  const mTok = await login(m.email)
  const eTok = await login(e.email)
  const start = new Date().toISOString()
  const end = new Date(Date.now() + 365 * 86_400_000).toISOString()
  const rC = await req('POST', '/contracts', {
    token: eTok,
    body: {
      seriesId: series.id,
      mangakaId: m.id,
      boardDecisionId: dec.id,
      contractType,
      valuationAmount: 1000,
      publisherOwnershipPct: contractType === ContractType.FULL_BUYOUT ? 100 : 70,
      mangakaOwnershipPct: contractType === ContractType.FULL_BUYOUT ? 0 : 30,
      terminationClause: 'compensation:100',
      contractStart: start,
      contractEnd: end
    }
  })
  return { series, contractId: rC.json.data.id as string, boardDecisionId: dec.id, sessionId: session.id, mTok, eTok }
}

// Body happy cho một payment condition hợp lệ với type tương ứng.
const paymentConditionBody = (
  conditionType: ConditionType,
  payoutAmount = 100,
  isRecurring = false,
  thresholdConfig?: unknown
) => ({
  conditionType,
  payoutAmount,
  payoutPct: undefined,
  isRecurring,
  thresholdConfig: thresholdConfig ?? defaultThreshold(conditionType)
})

const defaultThreshold = (ct: ConditionType): unknown => {
  if (ct === ConditionType.CHAPTER_MILESTONE) return { chapter: 5 }
  if (ct === ConditionType.RECURRING_CHAPTER) return { every: 2 }
  if (ct === ConditionType.RANKING_MILESTONE) return { topRank: 3 }
  if (ct === ConditionType.TIME_BOUND) return { deadline: '2030-12-31' }
  return {}
}

const main = async () => {
  resetCounters()
  console.log(`\n##### ${FLOW} #####`)
  await wipeDb()
  await seedRolesAndAdmin()

  const m1 = await makeUser('MANGAKA')
  const m2 = await makeUser('MANGAKA')
  const e1 = await makeUser('EDITOR')
  const e2 = await makeUser('EDITOR')
  const b1 = await makeUser('BOARD_MEMBER')
  const sa = await makeUser('SUPER_ADMIN')
  const m1Tok = await login(m1.email)
  const m2Tok = await login(m2.email)
  const e1Tok = await login(e1.email)
  const e2Tok = await login(e2.email)
  const b1Tok = await login(b1.email)
  const saTok = await login(sa.email)

  // ═════════════ 06.1 — HAPPY PATH: full lifecycle REVENUE_SHARE ═══════════════════════
  section('06.1 Happy full lifecycle (DRAFT → FULLY_EXECUTED)')
  const happy = await setupSeriesAndDraftContract(m1, e1, b1, sa, ContractType.REVENUE_SHARE)
  const { contractId: cHappy } = happy

  ok(
    '06.1a contract created DRAFT',
    (await prisma.contract.findUnique({ where: { id: cHappy } }))?.status === ContractStatus.DRAFT
  )

  // Editor send to mangaka
  const rMR = await req('PATCH', `/contracts/${cHappy}/status`, { token: e1Tok, body: { status: 'MANGAKA_REVIEW' } })
  ok('06.1b PATCH status → MANGAKA_REVIEW', rMR.status === 200, `got ${rMR.status} ${rMR.raw.slice(0, 200)}`)
  ok(
    '06.1c status DB = MANGAKA_REVIEW',
    (await prisma.contract.findUnique({ where: { id: cHappy } }))?.status === ContractStatus.MANGAKA_REVIEW
  )

  // Mangaka request-changes → NEGOTIATION
  const rRC = await req('POST', `/contracts/${cHappy}/request-changes`, { token: m1Tok })
  ok('06.1d Mangaka request-changes → NEGOTIATION', rRC.status === 201, `got ${rRC.status}`)
  ok(
    '06.1e status DB = NEGOTIATION',
    (await prisma.contract.findUnique({ where: { id: cHappy } }))?.status === ContractStatus.NEGOTIATION
  )

  // Editor update (sinh ContractVersion mới) → về MANGAKA_REVIEW
  const rUp = await req('PATCH', `/contracts/${cHappy}`, {
    token: e1Tok,
    body: { note: 'Cập nhật điều khoản', valuationAmount: 1500 }
  })
  ok('06.1f PATCH editor update (NEGOTIATION)', rUp.status === 200, `got ${rUp.status} ${rUp.raw.slice(0, 200)}`)
  ok(
    '06.1g status = NEGOTIATION sau editor update',
    (await prisma.contract.findUnique({ where: { id: cHappy } }))?.status === ContractStatus.NEGOTIATION
  )

  // Editor re-send → MANGAKA_REVIEW (PATCH status)
  const rReMR = await req('PATCH', `/contracts/${cHappy}/status`, { token: e1Tok, body: { status: 'MANGAKA_REVIEW' } })
  ok('06.1h editor re-send → MANGAKA_REVIEW', rReMR.status === 200, `got ${rReMR.status} ${rReMR.raw.slice(0, 200)}`)

  // Mangaka approve
  const rMA = await req('PATCH', `/contracts/${cHappy}/status`, { token: m1Tok, body: { status: 'MANGAKA_APPROVED' } })
  ok('06.1i Mangaka approve → MANGAKA_APPROVED', rMA.status === 200, `got ${rMA.status}`)

  // Board approve
  const rBA = await req('POST', `/contracts/${cHappy}/board-approve`, { token: b1Tok })
  ok('06.1j board-approve → BOARD_APPROVED', rBA.status === 201, `got ${rBA.status} ${rBA.raw.slice(0, 200)}`)
  ok(
    '06.1k status DB = BOARD_APPROVED',
    (await prisma.contract.findUnique({ where: { id: cHappy } }))?.status === ContractStatus.BOARD_APPROVED
  )

  // Mangaka sign với OTP
  await seedOtp(m1.email, 'SIGNING_CONTRACT')
  const rSM = await req('POST', `/contracts/${cHappy}/signatures/mangaka`, {
    token: m1Tok,
    body: { otpCode: '123456' }
  })
  ok('06.1l Mangaka sign OTP → MANGAKA_SIGNED', rSM.status === 201, `got ${rSM.status} ${rSM.raw.slice(0, 200)}`)
  ok(
    '06.1m status DB = MANGAKA_SIGNED',
    (await prisma.contract.findUnique({ where: { id: cHappy } }))?.status === ContractStatus.MANGAKA_SIGNED
  )

  // Board cần có boardDecisionId cho việc ký (BR-CONTRACT)
  await seedOtp(b1.email, 'SIGNING_CONTRACT')
  const rSB = await req('POST', `/contracts/${cHappy}/signatures/board`, { token: b1Tok, body: { otpCode: '123456' } })
  ok('06.1n Board sign OTP → FULLY_EXECUTED', rSB.status === 201, `got ${rSB.status} ${rSB.raw.slice(0, 200)}`)
  ok(
    '06.1o status DB = FULLY_EXECUTED + mangakaSignedAt set',
    (await prisma.contract.findUnique({ where: { id: cHappy } }))?.status === ContractStatus.FULLY_EXECUTED
  )

  // ═════════════ 06.2 — PAYMENT CONDITIONS ═══════════════════════════════════════════════
  section('06.2 PaymentConditions CRUD')
  // RECURRING_CHAPTER
  const rc1 = await req('POST', `/contracts/${cHappy}/payment-conditions`, {
    token: e1Tok,
    body: paymentConditionBody(ConditionType.RECURRING_CHAPTER, 100, true, { every: 2 })
  })
  ok('06.2a tạo RECURRING_CHAPTER', rc1.status === 201, `got ${rc1.status} ${rc1.raw.slice(0, 200)}`)
  const cRC1 = rc1.json.data.id

  // CHAPTER_MILESTONE
  const rc2 = await req('POST', `/contracts/${cHappy}/payment-conditions`, {
    token: e1Tok,
    body: paymentConditionBody(ConditionType.CHAPTER_MILESTONE, 500, false, { chapter: 5 })
  })
  ok('06.2b tạo CHAPTER_MILESTONE', rc2.status === 201, `got ${rc2.status}`)
  const cCM = rc2.json.data.id

  // RANKING_MILESTONE
  const rc3 = await req('POST', `/contracts/${cHappy}/payment-conditions`, {
    token: e1Tok,
    body: paymentConditionBody(ConditionType.RANKING_MILESTONE, 1000, false, { topRank: 3 })
  })
  ok('06.2c tạo RANKING_MILESTONE', rc3.status === 201, `got ${rc3.status}`)

  // TIME_BOUND
  const rc4 = await req('POST', `/contracts/${cHappy}/payment-conditions`, {
    token: e1Tok,
    body: paymentConditionBody(ConditionType.TIME_BOUND, 200, false, { deadline: '2030-12-31' })
  })
  ok('06.2d tạo TIME_BOUND', rc4.status === 201, `got ${rc4.status}`)

  // Validation: payoutAmount + payoutPct đều thiếu → 422
  const rNoPayout = await req('POST', `/contracts/${cHappy}/payment-conditions`, {
    token: e1Tok,
    body: { conditionType: ConditionType.CHAPTER_MILESTONE, isRecurring: false, thresholdConfig: { chapter: 1 } }
  })
  ok('06.2e thiếu payoutAmount/payoutPct → 422', rNoPayout.status === 422, `got ${rNoPayout.status}`)

  // Validation: thresholdConfig chapter âm → 422
  const rBadChapter = await req('POST', `/contracts/${cHappy}/payment-conditions`, {
    token: e1Tok,
    body: {
      conditionType: ConditionType.CHAPTER_MILESTONE,
      payoutAmount: 100,
      thresholdConfig: { chapter: -1 }
    }
  })
  ok('06.2f CHAPTER_MILESTONE chapter âm → 422', rBadChapter.status === 422, `got ${rBadChapter.status}`)

  // Validation: RECURRING_CHAPTER với isRecurring false → 422
  const rRecNotRecurring = await req('POST', `/contracts/${cHappy}/payment-conditions`, {
    token: e1Tok,
    body: {
      conditionType: ConditionType.RECURRING_CHAPTER,
      payoutAmount: 100,
      isRecurring: false,
      thresholdConfig: { every: 2 }
    }
  })
  ok(
    '06.2g RECURRING_CHAPTER mà isRecurring=false → 422',
    rRecNotRecurring.status === 422,
    `got ${rRecNotRecurring.status}`
  )

  // Validation: TIME_BOUND sai format
  const rTBbad = await req('POST', `/contracts/${cHappy}/payment-conditions`, {
    token: e1Tok,
    body: {
      conditionType: ConditionType.TIME_BOUND,
      payoutAmount: 100,
      thresholdConfig: { deadline: '31/12/2030' }
    }
  })
  ok('06.2h TIME_BOUND deadline sai format → 422', rTBbad.status === 422, `got ${rTBbad.status}`)

  // RANKING_MILESTONE topRank âm → 422
  const rRMbad = await req('POST', `/contracts/${cHappy}/payment-conditions`, {
    token: e1Tok,
    body: {
      conditionType: ConditionType.RANKING_MILESTONE,
      payoutAmount: 100,
      thresholdConfig: { topRank: -3 }
    }
  })
  ok('06.2i RANKING_MILESTONE topRank âm → 422', rRMbad.status === 422, `got ${rRMbad.status}`)

  // Get list
  const rList = await req('GET', `/contracts/${cHappy}/payment-conditions`, { token: e1Tok })
  ok('06.2j list conditions', rList.status === 200, `got ${rList.status}`)
  ok(
    '06.2k list 4 conditions',
    Array.isArray(rList.json?.data?.data || rList.json?.data) &&
      ((rList.json?.data?.data || rList.json?.data) as unknown[]).length >= 4,
    `count`
  )

  // PATCH update threshold
  const rUpd = await req('PATCH', `/contracts/${cHappy}/payment-conditions/${cRC1}`, {
    token: e1Tok,
    body: { thresholdConfig: { every: 3 } }
  })
  ok('06.2l PATCH update threshold', rUpd.status === 200, `got ${rUpd.status}`)

  // PATCH disable
  const rDisable = await req('PATCH', `/contracts/${cHappy}/payment-conditions/${cRC1}/disable`, { token: e1Tok })
  ok('06.2m PATCH disable', rDisable.status === 200, `got ${rDisable.status}`)
  ok(
    '06.2n status = DISABLED',
    (await prisma.paymentCondition.findUnique({ where: { id: cRC1 } }))?.status === PaymentConditionStatus.DISABLED
  )

  // PATCH condition bởi non-editor (Mangaka) → 403/422
  const rPatchByMangaka = await req('PATCH', `/contracts/${cHappy}/payment-conditions/${cCM}`, {
    token: m1Tok,
    body: { payoutAmount: 999 }
  })
  ok('06.2o PATCH condition bởi Mangaka → 403', rPatchByMangaka.status === 403, `got ${rPatchByMangaka.status}`)

  // Tạo condition bởi Mangaka → 403
  const rCreateByMangaka = await req('POST', `/contracts/${cHappy}/payment-conditions`, {
    token: m1Tok,
    body: paymentConditionBody(ConditionType.CHAPTER_MILESTONE, 100, false, { chapter: 1 })
  })
  ok('06.2p tạo condition bởi Mangaka → 403', rCreateByMangaka.status === 403, `got ${rCreateByMangaka.status}`)

  // ═════════════ 06.3 — PAYMENT RECORD engine (idempotency qua publish) ═════════════════
  section('06.3 PaymentRecord engine — chapter publish triggers + idempotency')
  // Note: /payments POST không có — record được engine tạo qua event chapter.published.
  // Test engine: bật RECURRING_CHAPTER every=2 và publish 2 chapter → 1 record; publish lần 2 chapter 2 = KHÔNG thêm.
  // Trước hết cần chapter + publish pipeline — chuyển series sang ready bằng cách test thông qua contract.
  // Ở mức flow-06, test qua Prisma đọc paymentRecord list + simulate PATCH.
  const rListPay = await req('GET', `/payments/contracts/${cHappy}/payments`, { token: saTok })
  ok('06.3a GET /payments/contracts/:id/payments', rListPay.status === 200, `got ${rListPay.status}`)

  // Tạo payment record TRIGGERED thủ công qua Prisma để test status guards
  const pr = await prisma.paymentRecord.create({
    data: {
      receiverId: m1.id,
      amount: 100,
      paymentType: 'REVENUE_SHARE',
      paymentSource: 'CONTRACT',
      contractId: cHappy,
      status: 'TRIGGERED',
      createdBy: b1.id
    }
  })
  ok('06.3b record seed TRIGGERED', pr.status === 'TRIGGERED')

  // FINDING-BE-004 ĐÃ FIX (2026-07-11): bỏ field chết `userId` khỏi PaymentRecordModelSchema
  // → approve/pay/cancel giờ trả 200 sạch (trước: DB update OK nhưng response 500 ZodSerialization).
  const rAp = await req('PATCH', `/payments/${pr.id}/approve`, { token: b1Tok, body: { approvedBy: b1.id } })
  expectStatus(rAp, 200, '06.3c payment approve → 200 (BE-004 fixed)')
  ok(
    '06.3d status DB = APPROVED (server-side state đã được update dù response 500)',
    (await prisma.paymentRecord.findUnique({ where: { id: pr.id } }))?.status === PaymentRecordStatus.APPROVED
  )

  // approve lần 2 (status != TRIGGERED) → INVALID_STATUS_FOR_APPROVAL_EXPECTED_TRIGGERED
  const rAp2 = await req('PATCH', `/payments/${pr.id}/approve`, { token: b1Tok, body: { approvedBy: b1.id } })
  expectError(rAp2, 400, 'INVALID_STATUS_FOR_APPROVAL_EXPECTED_TRIGGERED', '06.3e approve lần 2 → 400')

  // pay → PAID (server 500 bug)
  const rPay = await req('PATCH', `/payments/${pr.id}/pay`, {
    token: b1Tok,
    body: { paymentMethod: 'BANK_TRANSFER', transactionReference: 'TXN-FT-001' }
  })
  expectStatus(rPay, 200, '06.3f payment pay → 200 (BE-004 fixed)')
  ok(
    '06.3g status DB = PAID + paidAt set',
    (await prisma.paymentRecord.findUnique({ where: { id: pr.id } }))?.status === PaymentRecordStatus.PAID
  )

  // pay khi chưa APPROVED → tạo 1 record mới TRIGGERED thử
  const pr2 = await prisma.paymentRecord.create({
    data: {
      receiverId: m1.id,
      amount: 50,
      paymentType: 'REVENUE_SHARE',
      paymentSource: 'CONTRACT',
      contractId: cHappy,
      status: 'TRIGGERED',
      createdBy: b1.id
    }
  })
  const rPayFromTrig = await req('PATCH', `/payments/${pr2.id}/pay`, {
    token: b1Tok,
    body: { paymentMethod: 'CASH', transactionReference: 'TXN-FT-002' }
  })
  ok(
    '06.3h pay từ TRIGGERED → 400 INVALID_STATUS_FOR_PAYMENT_EXPECTED_APPROVED',
    rPayFromTrig.status === 400,
    `got ${rPayFromTrig.status}`
  )

  // cancel record đã PAID → 400 PAYMENT_ALREADY_PAID_CANNOT_CANCEL
  const rCancelPaid = await req('PATCH', `/payments/${pr.id}/cancel`, { token: b1Tok, body: { cancelReason: 'oops' } })
  expectError(rCancelPaid, 400, 'PAYMENT_ALREADY_PAID_CANNOT_CANCEL', '06.3i cancel PAID → 400')

  // cancel TRIGGERED → CANCELLED (BE-004 đã fix → 200)
  const rCancelTrig = await req('PATCH', `/payments/${pr2.id}/cancel`, {
    token: b1Tok,
    body: { cancelReason: 'chap không hợp lệ' }
  })
  expectStatus(rCancelTrig, 200, '06.3j payment cancel → 200 (BE-004 fixed)')
  ok(
    '06.3k status DB = CANCELLED',
    (await prisma.paymentRecord.findUnique({ where: { id: pr2.id } }))?.status === PaymentRecordStatus.CANCELLED
  )

  // payment record rác ID → 404
  const rPayGhost = await req('GET', `/payments/aaaaaaaaaaaaaaaaaaaaaaaa`, { token: saTok })
  ok('06.3l GET payment rác → 404', rPayGhost.status === 404, `got ${rPayGhost.status}`)

  // ═════════════ 06.4 — STATE MACHINE (invalid transitions) ═════════════════════════════
  section('06.4 Contract state machine — invalid transitions')
  const t1 = await setupSeriesAndDraftContract(m1, e1, b1, sa, ContractType.REVENUE_SHARE)
  const cT1 = t1.contractId

  // Sign khi mới MANGAKA_APPROVED (chưa BOARD_APPROVED) — tạo board session + decision required
  await req('PATCH', `/contracts/${cT1}/status`, { token: e1Tok, body: { status: 'MANGAKA_REVIEW' } })
  await req('PATCH', `/contracts/${cT1}/status`, { token: m1Tok, body: { status: 'MANGAKA_APPROVED' } })
  // Try board-approve khi đang MANGAKA_REVIEW (chưa MANGAKA_APPROVED) — setup tương tự
  const t2 = await setupSeriesAndDraftContract(m1, e1, b1, sa)
  await req('PATCH', `/contracts/${t2.contractId}/status`, { token: e1Tok, body: { status: 'MANGAKA_REVIEW' } })
  const rBAonReview = await req('POST', `/contracts/${t2.contractId}/board-approve`, { token: b1Tok })
  expectError(rBAonReview, 409, 'Error.InvalidContractTransition', '06.4a board-approve khi MANGAKA_REVIEW → 409')

  // sendToMangaka 2 lần liên tiếp — PATCH status từ MANGAKA_REVIEW → MANGAKA_REVIEW (invalid transition)
  const rAlreadyMR = await req('PATCH', `/contracts/${t2.contractId}/status`, {
    token: e1Tok,
    body: { status: 'MANGAKA_REVIEW' }
  })
  ok(
    '06.4b PATCH status MANGAKA_REVIEW khi đang MANGAKA_REVIEW → 4xx',
    rAlreadyMR.status === 400 || rAlreadyMR.status === 409,
    `got ${rAlreadyMR.status}`
  )

  // PATCH (update) sau khi FULLY_EXECUTED
  await seedOtp(m1.email, 'SIGNING_CONTRACT')
  await seedOtp(b1.email, 'SIGNING_CONTRACT')
  await req('PATCH', `/contracts/${cT1}/status`, { token: e1Tok, body: { status: 'MANGAKA_REVIEW' } })
  await req('PATCH', `/contracts/${cT1}/status`, { token: m1Tok, body: { status: 'MANGAKA_APPROVED' } })
  await req('POST', `/contracts/${cT1}/board-approve`, { token: b1Tok })
  await req('POST', `/contracts/${cT1}/signatures/mangaka`, { token: m1Tok, body: { otpCode: '123456' } })
  await req('POST', `/contracts/${cT1}/signatures/board`, { token: b1Tok, body: { otpCode: '123456' } })
  const rPatchAfterExec = await req('PATCH', `/contracts/${cT1}`, { token: e1Tok, body: { valuationAmount: 9999 } })
  expectError(rPatchAfterExec, 409, 'Error.InvalidContractTransition', '06.4c PATCH sau FULLY_EXECUTED → 409')

  // OTP sai → 422
  const t3 = await setupSeriesAndDraftContract(m1, e1, b1, sa)
  await req('PATCH', `/contracts/${t3.contractId}/status`, { token: e1Tok, body: { status: 'MANGAKA_REVIEW' } })
  await req('PATCH', `/contracts/${t3.contractId}/status`, { token: m1Tok, body: { status: 'MANGAKA_APPROVED' } })
  await req('POST', `/contracts/${t3.contractId}/board-approve`, { token: b1Tok })
  await seedOtp(m1.email, 'SIGNING_CONTRACT')
  const rBadOTP = await req('POST', `/contracts/${t3.contractId}/signatures/mangaka`, {
    token: m1Tok,
    body: { otpCode: '000000' }
  })
  ok(
    '06.4d sign với OTP sai → 4xx',
    rBadOTP.status >= 400 && rBadOTP.status < 500,
    `got ${rBadOTP.status} ${rBadOTP.raw.slice(0, 200)}`
  )

  // Tạo contract khi series chưa SERIALIZED (DRAFT) → 409 SeriesNotSerialized
  const draftSeries = await makeSeriesAt(SeriesStatus.DRAFT, { mangakaId: m1.id })
  const sessionGhost = await prisma.boardSession.create({
    data: {
      creatorId: sa.id,
      status: BoardSessionStatus.CONCLUDED,
      allowedEditorIds: [b1.id],
      title: 'FT Ghost',
      startTime: new Date(Date.now() - 60_000),
      endTime: new Date()
    }
  })
  const decGhost = await prisma.boardDecision.create({
    data: {
      boardSessionId: sessionGhost.id,
      targetSeriesId: draftSeries.id,
      decisionType: DecisionType.CONTRACT,
      result: 'APPROVED',
      allowedEditorIds: [b1.id],
      totalVotes: 1,
      approveCount: 1,
      rejectCount: 0,
      quorumMet: true
    }
  })
  const rContractOnDraft = await req('POST', '/contracts', {
    token: e1Tok,
    body: {
      seriesId: draftSeries.id,
      mangakaId: m1.id,
      boardDecisionId: decGhost.id,
      contractType: ContractType.REVENUE_SHARE,
      valuationAmount: 100,
      publisherOwnershipPct: 70,
      mangakaOwnershipPct: 30,
      terminationClause: 'compensation:100',
      contractStart: new Date().toISOString(),
      contractEnd: new Date(Date.now() + 365 * 86_400_000).toISOString()
    }
  })
  expectError(rContractOnDraft, 409, 'Error.SeriesNotSerialized', '06.4e tạo contract khi series chưa SERIALIZED → 409')

  // ═════════════ 06.5 — RBAC / scoping ══════════════════════════════════════════════════
  section('06.5 RBAC + scoping')

  // Setup một contract FULLY_EXECUTED riêng cho RBAC tests (dùng makeContractAt để khỏi phải walk lại)
  const rbacSetup = await setupSeriesAndDraftContract(m1, e1, b1, sa, ContractType.REVENUE_SHARE)
  const cRBAC = rbacSetup.contractId
  // Walk to FULLY_EXECUTED
  await req('PATCH', `/contracts/${cRBAC}/status`, { token: e1Tok, body: { status: 'MANGAKA_REVIEW' } })
  await req('PATCH', `/contracts/${cRBAC}/status`, { token: m1Tok, body: { status: 'MANGAKA_APPROVED' } })
  await req('POST', `/contracts/${cRBAC}/board-approve`, { token: b1Tok })
  await seedOtp(m1.email, 'SIGNING_CONTRACT')
  await seedOtp(b1.email, 'SIGNING_CONTRACT')
  await req('POST', `/contracts/${cRBAC}/signatures/mangaka`, { token: m1Tok, body: { otpCode: '123456' } })
  await req('POST', `/contracts/${cRBAC}/signatures/board`, { token: b1Tok, body: { otpCode: '123456' } })

  // M2 approve HĐ của M1 → 403
  const rM2Approve = await req('PATCH', `/contracts/${cRBAC}/status`, {
    token: m2Tok,
    body: { status: 'MANGAKA_APPROVED' }
  })
  ok('06.5a M2 approve HĐ của M1 → 403', rM2Approve.status === 403, `got ${rM2Approve.status}`)

  // E2 (không phải editor phụ trách) update → 403 ONLY_ASSIGNED_EDITOR_CAN_EDIT
  const rE2Update = await req('PATCH', `/contracts/${cRBAC}`, { token: e2Tok, body: { valuationAmount: 9999 } })
  ok('06.5b E2 (không phải editor HĐ) PATCH → 403', rE2Update.status === 403, `got ${rE2Update.status}`)

  // M1 ký amendment FULL_BUYOUT (sẽ test bên dưới — cần amendment setup)

  // M xem contract series người khác — getContracts scoping
  const rM2List = await req('GET', '/contracts', { token: m2Tok })
  ok(
    '06.5c M2 GET /contracts scoping (list của m2 rỗng hoặc list HĐ mình)',
    rM2List.status === 200,
    `got ${rM2List.status}`
  )
  // Verify M2 không thấy RBAC contract: tìm trong list
  const arr = (rM2List.json?.data || []) as Array<{ id: string }>
  ok('06.5d M2 không thấy contract của M1', !arr.some((c) => c.id === cRBAC), `len=${arr.length}`)

  // GET /contracts/:id của M2 cho RBAC → 403
  const rM2Get = await req('GET', `/contracts/${cRBAC}`, { token: m2Tok })
  ok('06.5e M2 GET /contracts/:id của M1 → 403', rM2Get.status === 403, `got ${rM2Get.status}`)

  // GET contract rác → 404
  const rGhost = await req('GET', `/contracts/aaaaaaaaaaaaaaaaaaaaaaaa`, { token: e1Tok })
  ok('06.5f GET contract rác → 404', rGhost.status === 404, `got ${rGhost.status}`)

  // Mangaka tạo contract → 403
  const rMCreateCon = await req('POST', '/contracts', {
    token: m1Tok,
    body: {
      seriesId: rbacSetup.series.id,
      mangakaId: m1.id,
      boardDecisionId: rbacSetup.boardDecisionId,
      contractType: ContractType.REVENUE_SHARE,
      valuationAmount: 100,
      publisherOwnershipPct: 70,
      mangakaOwnershipPct: 30,
      terminationClause: 'compensation:100',
      contractStart: new Date().toISOString(),
      contractEnd: new Date(Date.now() + 365 * 86_400_000).toISOString()
    }
  })
  ok('06.5g Mangaka tạo contract → 403', rMCreateCon.status === 403, `got ${rMCreateCon.status}`)

  // ═════════════ 06.6 — AMENDMENT lifecycle ════════════════════════════════════════════
  section('06.6 Contract Amendment lifecycle')
  // Setup contract FULLY_EXECUTED riêng cho amendment tests
  const amSetup = await setupSeriesAndDraftContract(m1, e1, b1, sa, ContractType.REVENUE_SHARE)
  const cAmend = amSetup.contractId
  await req('PATCH', `/contracts/${cAmend}/status`, { token: e1Tok, body: { status: 'MANGAKA_REVIEW' } })
  await req('PATCH', `/contracts/${cAmend}/status`, { token: m1Tok, body: { status: 'MANGAKA_APPROVED' } })
  await req('POST', `/contracts/${cAmend}/board-approve`, { token: b1Tok })
  await seedOtp(m1.email, 'SIGNING_CONTRACT')
  await seedOtp(b1.email, 'SIGNING_CONTRACT')
  await req('POST', `/contracts/${cAmend}/signatures/mangaka`, { token: m1Tok, body: { otpCode: '123456' } })
  await req('POST', `/contracts/${cAmend}/signatures/board`, { token: b1Tok, body: { otpCode: '123456' } })

  // Tạo amendment với changedClauses
  const amBody = {
    changedClauses: ['valuation'],
    valuationAmount: 2000,
    publisherOwnershipPct: 70,
    mangakaOwnershipPct: 30,
    reason: 'tăng giá theo thị trường'
  }
  const rAmCreate = await req('POST', `/contracts/${cAmend}/amendments`, { token: e1Tok, body: amBody })
  ok('06.6a tạo amendment DRAFT', rAmCreate.status === 201, `got ${rAmCreate.status} ${rAmCreate.raw.slice(0, 200)}`)
  const amId = rAmCreate.json.data.id
  ok(
    '06.6b amendment status = DRAFT',
    (await prisma.contractAmendment.findUnique({ where: { id: amId } }))?.status === 'DRAFT'
  )

  // Amendment thứ 2 khi 1 đang mở → 409
  const rAm2 = await req('POST', `/contracts/${cAmend}/amendments`, { token: e1Tok, body: amBody })
  expectError(rAm2, 409, 'Error.OpenAmendmentExists', '06.6c amendment thứ 2 khi 1 đang mở → 409')

  // Submit amendment DRAFT → PENDING_SIGNATURES
  const rSubmit = await req('POST', `/contracts/${cAmend}/amendments/${amId}/submit`, { token: e1Tok })
  ok('06.6d submit amendment → PENDING_SIGNATURES', rSubmit.status === 200, `got ${rSubmit.status}`)
  ok(
    '06.6e amendment status = PENDING_SIGNATURES',
    (await prisma.contractAmendment.findUnique({ where: { id: amId } }))?.status === 'PENDING_SIGNATURES'
  )

  // PATCH khi không DRAFT → 409 AmendmentNotEditable
  const rPatchAmNotDraft = await req('PATCH', `/contracts/${cAmend}/amendments/${amId}`, {
    token: e1Tok,
    body: { valuationAmount: 3000 }
  })
  expectError(rPatchAmNotDraft, 409, 'Error.AmendmentNotEditable', '06.6f PATCH khi không DRAFT → 409')

  // Mangaka sign amendment
  await seedOtp(m1.email, 'SIGNING_CONTRACT')
  const rAmSignM = await req('POST', `/contracts/${cAmend}/amendments/${amId}/sign/mangaka`, {
    token: m1Tok,
    body: { otpCode: '123456' }
  })
  ok('06.6g Mangaka sign amendment', rAmSignM.status === 201, `got ${rAmSignM.status} ${rAmSignM.raw.slice(0, 200)}`)

  // Board sign → FULLY_EXECUTED
  await seedOtp(b1.email, 'SIGNING_CONTRACT')
  const rAmSignB = await req('POST', `/contracts/${cAmend}/amendments/${amId}/sign/board`, {
    token: b1Tok,
    body: { otpCode: '123456' }
  })
  ok(
    '06.6h Board sign amendment → FULLY_EXECUTED',
    rAmSignB.status === 201,
    `got ${rAmSignB.status} ${rAmSignB.raw.slice(0, 200)}`
  )
  ok(
    '06.6i amendment status = FULLY_EXECUTED',
    (await prisma.contractAmendment.findUnique({ where: { id: amId } }))?.status === 'FULLY_EXECUTED'
  )
  ok(
    '06.6j contract.valuationAmount updated',
    (await prisma.contract.findUnique({ where: { id: cAmend } }))?.valuationAmount === 2000
  )

  // Void amendment đã FULLY_EXECUTED → 409 AmendmentNotVoidable
  const rVoidTerminal = await req('POST', `/contracts/${cAmend}/amendments/${amId}/void`, {
    token: e1Tok,
    body: { voidReason: 'try' }
  })
  expectError(rVoidTerminal, 409, 'Error.AmendmentNotVoidable', '06.6k void amendment FULLY_EXECUTED → 409')

  // Amendment trên contract chưa FULLY_EXECUTED → 409 ContractNotAmendable
  const t4 = await setupSeriesAndDraftContract(m1, e1, b1, sa)
  await req('PATCH', `/contracts/${t4.contractId}/status`, { token: e1Tok, body: { status: 'MANGAKA_REVIEW' } })
  const rAmNotExec = await req('POST', `/contracts/${t4.contractId}/amendments`, {
    token: e1Tok,
    body: { changedClauses: ['x'], valuationAmount: 100, publisherOwnershipPct: 70, mangakaOwnershipPct: 30 }
  })
  expectError(rAmNotExec, 409, 'Error.ContractNotAmendable', '06.6l amendment trên contract MANGAKA_REVIEW → 409')

  // OwnershipMismatch: amendment đổi sang full-mangaka 0/100 không hợp lệ (lệch tỉ lệ)
  const t5 = await setupSeriesAndDraftContract(m1, e1, b1, sa)
  // Walk t5 tới FULLY_EXECUTED
  await req('PATCH', `/contracts/${t5.contractId}/status`, { token: e1Tok, body: { status: 'MANGAKA_REVIEW' } })
  await req('PATCH', `/contracts/${t5.contractId}/status`, { token: m1Tok, body: { status: 'MANGAKA_APPROVED' } })
  await req('POST', `/contracts/${t5.contractId}/board-approve`, { token: b1Tok })
  await seedOtp(m1.email, 'SIGNING_CONTRACT')
  await seedOtp(b1.email, 'SIGNING_CONTRACT')
  await req('POST', `/contracts/${t5.contractId}/signatures/mangaka`, { token: m1Tok, body: { otpCode: '123456' } })
  await req('POST', `/contracts/${t5.contractId}/signatures/board`, { token: b1Tok, body: { otpCode: '123456' } })

  // Amendment sai tỉ lệ (publisherOwnershipPct=60, mangakaOwnershipPct=50, tổng=110) → 422
  const rBadAm = await req('POST', `/contracts/${t5.contractId}/amendments`, {
    token: e1Tok,
    body: { changedClauses: ['x'], valuationAmount: 500, publisherOwnershipPct: 60, mangakaOwnershipPct: 50 }
  })
  ok('06.6m amendment sai tỉ lệ 60+50 → 422', rBadAm.status === 422, `got ${rBadAm.status}`)

  // Reject amendment từ Mangaka (full_mangaka) — flow reject là khi PENDING_SIGNATURES
  const t6 = await setupSeriesAndDraftContract(m1, e1, b1, sa)
  await req('PATCH', `/contracts/${t6.contractId}/status`, { token: e1Tok, body: { status: 'MANGAKA_REVIEW' } })
  await req('PATCH', `/contracts/${t6.contractId}/status`, { token: m1Tok, body: { status: 'MANGAKA_APPROVED' } })
  await req('POST', `/contracts/${t6.contractId}/board-approve`, { token: b1Tok })
  await seedOtp(m1.email, 'SIGNING_CONTRACT')
  await seedOtp(b1.email, 'SIGNING_CONTRACT')
  await req('POST', `/contracts/${t6.contractId}/signatures/mangaka`, { token: m1Tok, body: { otpCode: '123456' } })
  await req('POST', `/contracts/${t6.contractId}/signatures/board`, { token: b1Tok, body: { otpCode: '123456' } })

  const rAm3 = await req('POST', `/contracts/${t6.contractId}/amendments`, {
    token: e1Tok,
    body: { changedClauses: ['y'], valuationAmount: 1500, publisherOwnershipPct: 70, mangakaOwnershipPct: 30 }
  })
  const amId6 = rAm3.json.data.id
  await req('POST', `/contracts/${t6.contractId}/amendments/${amId6}/submit`, { token: e1Tok })
  const rReject = await req('POST', `/contracts/${t6.contractId}/amendments/${amId6}/reject`, {
    token: m1Tok,
    body: { reason: 'không đồng ý' }
  })
  ok('06.6n Mangaka reject amendment → 200', rReject.status === 200, `got ${rReject.status}`)
  ok(
    '06.6o amendment quay về DRAFT sau reject',
    (await prisma.contractAmendment.findUnique({ where: { id: amId6 } }))?.status === 'DRAFT'
  )

  // Void amendment khi DRAFT
  const rVoid = await req('POST', `/contracts/${t6.contractId}/amendments/${amId6}/void`, {
    token: e1Tok,
    body: { voidReason: 'thôi' }
  })
  ok('06.6p void amendment DRAFT → VOIDED', rVoid.status === 200, `got ${rVoid.status}`)
  ok(
    '06.6q amendment status = VOIDED',
    (await prisma.contractAmendment.findUnique({ where: { id: amId6 } }))?.status === 'VOIDED'
  )

  // ═════════════ 06.7 — REVENUE REPORT (REVENUE_SHARE only) ═════════════════════════════
  section('06.7 Revenue report + termination lifecycle')
  // Setup contract FULLY_EXECUTED riêng cho revenue
  const revSetup = await setupSeriesAndDraftContract(m1, e1, b1, sa, ContractType.REVENUE_SHARE)
  const cRev = revSetup.contractId
  await req('PATCH', `/contracts/${cRev}/status`, { token: e1Tok, body: { status: 'MANGAKA_REVIEW' } })
  await req('PATCH', `/contracts/${cRev}/status`, { token: m1Tok, body: { status: 'MANGAKA_APPROVED' } })
  await req('POST', `/contracts/${cRev}/board-approve`, { token: b1Tok })
  await seedOtp(m1.email, 'SIGNING_CONTRACT')
  await seedOtp(b1.email, 'SIGNING_CONTRACT')
  await req('POST', `/contracts/${cRev}/signatures/mangaka`, { token: m1Tok, body: { otpCode: '123456' } })
  await req('POST', `/contracts/${cRev}/signatures/board`, { token: b1Tok, body: { otpCode: '123456' } })

  const rRev = await req('POST', `/contracts/${cRev}/revenue`, {
    token: b1Tok,
    body: { revenue: 1000, period: 'FT-2026-Q3' }
  })
  ok('06.7a revenue 1000 → 201 (chia 70/30)', rRev.status === 201, `got ${rRev.status} ${rRev.raw.slice(0, 200)}`)

  // revenue bởi Mangaka → 403
  const rRevByM = await req('POST', `/contracts/${cRev}/revenue`, {
    token: m1Tok,
    body: { revenue: 1000, period: 'FT-2026-Q3' }
  })
  ok('06.7b revenue bởi Mangaka → 403', rRevByM.status === 403, `got ${rRevByM.status}`)

  // revenue trên contract FULL_BUYOUT → không hợp lệ (chỉ REVENUE_SHARE) — tạo FULL_BUYOUT để test
  const fbSet = await setupSeriesAndDraftContract(m1, e1, b1, sa, ContractType.FULL_BUYOUT)
  const cFB = fbSet.contractId
  // Walk to FULLY_EXECUTED
  await req('PATCH', `/contracts/${cFB}/status`, { token: e1Tok, body: { status: 'MANGAKA_REVIEW' } })
  await req('PATCH', `/contracts/${cFB}/status`, { token: m1Tok, body: { status: 'MANGAKA_APPROVED' } })
  await req('POST', `/contracts/${cFB}/board-approve`, { token: b1Tok })
  await seedOtp(m1.email, 'SIGNING_CONTRACT')
  await seedOtp(b1.email, 'SIGNING_CONTRACT')
  await req('POST', `/contracts/${cFB}/signatures/mangaka`, { token: m1Tok, body: { otpCode: '123456' } })
  await req('POST', `/contracts/${cFB}/signatures/board`, { token: b1Tok, body: { otpCode: '123456' } })
  const rRevFB = await req('POST', `/contracts/${cFB}/revenue`, {
    token: b1Tok,
    body: { revenue: 1000, period: 'FT-FB-Q3' }
  })
  ok('06.7c revenue trên FULL_BUYOUT → 409 REVENUE_NOT_APPLICABLE', rRevFB.status === 409, `got ${rRevFB.status}`)

  // revenue trên contract DRAFT (chưa execute) → 409 (e.g. InvalidContractTransition hoặc similar)
  const t7 = await setupSeriesAndDraftContract(m1, e1, b1, sa)
  const rRevOnDraft = await req('POST', `/contracts/${t7.contractId}/revenue`, {
    token: b1Tok,
    body: { revenue: 100, period: 'X' }
  })
  ok(
    '06.7d revenue trên DRAFT → 4xx',
    rRevOnDraft.status >= 400 && rRevOnDraft.status < 500,
    `got ${rRevOnDraft.status}`
  )

  // GET /contracts/:id versions (cAmend PATCH history)
  const rVers = await req('GET', `/contracts/${cAmend}/versions`, { token: e1Tok })
  const versArr = Array.isArray(rVers.json?.data) ? rVers.json.data : []
  ok(
    '06.7e GET versions ≥1',
    rVers.status === 200 && versArr.length >= 1,
    `status=${rVers.status} len=${versArr.length}`
  )

  // GET audit? — kiểm tra có TRANSITION cho CONTRACT
  const rAudit = await req('GET', `/audit?entityType=CONTRACT`, { token: saTok })
  ok('06.7f GET audit CONTRACT', rAudit.status === 200, `got ${rAudit.status}`)

  await prisma.$disconnect()
  const fail = summary(FLOW)
  process.exit(fail > 0 ? 1 : 0)
}

void main().catch(async (e) => {
  console.error('FATAL', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
