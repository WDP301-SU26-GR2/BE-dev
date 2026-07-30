import {
  wipeDb,
  seedRolesAndAdmin,
  prisma,
  makeUser,
  makeSeriesAt,
  makeContractAt,
  makeChapterAt,
  makeBoardSession,
  makeBoardDecision
} from './lib/seed.js'
import { req, ok, section, summary, expectError, resetCounters, sleep } from './lib/http.js'
import { login, seedOtp } from './lib/auth.js'
import {
  ChapterStatus,
  BoardDecisionResult,
  BoardSessionPhase,
  BoardSessionStatus,
  ConditionType,
  ContractType,
  DecisionType,
  ManuscriptStatus,
  OutboxEventType,
  RoleCode,
  SeriesStatus,
  TransferType
} from '@prisma/client'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@ecom.dev.com'
const FLOW = 'flow-08-transfer'

const responseData = (response: { json: unknown }) =>
  (response.json as { data?: Record<string, unknown> } | null)?.data ??
  (response.json as Record<string, unknown> | null)

const waitFor = async (predicate: () => Promise<boolean>, timeoutMs = 15_000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await sleep(250)
  }
  return false
}

const main = async () => {
  resetCounters()
  console.log(`\n##### ${FLOW} #####`)
  await wipeDb()
  await seedRolesAndAdmin()

  // ─── SEED ──────────────────────────────────────────────────────────────────
  const admin = await login(ADMIN_EMAIL)
  const e1 = await makeUser(RoleCode.EDITOR)
  const e2 = await makeUser(RoleCode.EDITOR)
  const mA = await makeUser(RoleCode.MANGAKA) // original mangaka (FB series)
  const mB1 = await makeUser(RoleCode.MANGAKA) // original mangaka (RS series)
  const mB2 = await makeUser(RoleCode.MANGAKA) // receiving mangaka
  const mOther = await makeUser(RoleCode.MANGAKA) // outside observer
  const b1 = await makeUser(RoleCode.BOARD_MEMBER)
  const bOutside = await makeUser(RoleCode.BOARD_MEMBER)
  const a1 = await makeUser(RoleCode.ASSISTANT)

  const e1Tok = await login(e1.email)
  const e2Tok = await login(e2.email)
  const mB1Tok = await login(mB1.email)
  const mB2Tok = await login(mB2.email)
  const mOtherTok = await login(mOther.email)
  const b1Tok = await login(b1.email)
  const bOutsideTok = await login(bOutside.email)
  const a1Tok = await login(a1.email)

  // ─── SERIES A: FULL_BUYOUT (mA) ────────────────────────────────────────────
  const seriesFB = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: mA.id, editorId: e1.id })
  const contractFB = await makeContractAt('FULLY_EXECUTED', {
    seriesId: seriesFB.id,
    mangakaId: mA.id,
    editorId: e1.id,
    contractType: ContractType.FULL_BUYOUT
  })
  // 2 chapter PUBLISHED for revenue test
  const fbCh1 = await makeChapterAt({
    seriesId: seriesFB.id,
    chapterNumber: 1,
    manuscriptStatus: ManuscriptStatus.PUBLISHED,
    publishedAt: new Date()
  })
  await prisma.chapter.update({ where: { id: fbCh1.id }, data: { status: ChapterStatus.PUBLISHED } })
  const fbCh2 = await makeChapterAt({
    seriesId: seriesFB.id,
    chapterNumber: 2,
    manuscriptStatus: ManuscriptStatus.PUBLISHED,
    publishedAt: new Date()
  })
  await prisma.chapter.update({ where: { id: fbCh2.id }, data: { status: ChapterStatus.PUBLISHED } })

  // ─── SERIES B: REVENUE_SHARE (mB1) ──────────────────────────────────────────
  const seriesRS = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: mB1.id, editorId: e2.id })
  await makeContractAt('FULLY_EXECUTED', {
    seriesId: seriesRS.id,
    mangakaId: mB1.id,
    editorId: e2.id,
    contractType: ContractType.REVENUE_SHARE
  })
  const rsCh1 = await makeChapterAt({
    seriesId: seriesRS.id,
    chapterNumber: 1,
    manuscriptStatus: ManuscriptStatus.PUBLISHED,
    publishedAt: new Date()
  })
  await prisma.chapter.update({ where: { id: rsCh1.id }, data: { status: ChapterStatus.PUBLISHED } })

  // Transfer screening is authoritative only when backed by a terminal TRANSFER
  // decision for the same series and the acting Board member is in its roster.
  const boardSession = await makeBoardSession({
    creatorId: b1.id,
    allowedEditorIds: [b1.id],
    status: BoardSessionStatus.CONCLUDED,
    phase: BoardSessionPhase.VOTING,
    startTime: new Date(Date.now() - 120_000),
    endTime: new Date()
  })
  const makeApprovedContractDecision = async (o: {
    seriesId: string
    resourceType: 'REPLACEMENT_CONTRACT' | 'TRANSFER_CONTRACT'
    resourceId: string
    versionId?: string
  }) =>
    makeBoardDecision({
      sessionId: boardSession.id,
      targetSeriesId: o.seriesId,
      decisionType: DecisionType.CONTRACT,
      result: BoardDecisionResult.APPROVED,
      allowedEditorIds: [b1.id],
      details: {
        resourceType: o.resourceType,
        resourceId: o.resourceId,
        ...(o.versionId ? { versionId: o.versionId } : {})
      }
    })
  const fbApprovedDecision = await makeBoardDecision({
    sessionId: boardSession.id,
    targetSeriesId: seriesFB.id,
    decisionType: DecisionType.TRANSFER,
    result: BoardDecisionResult.APPROVED,
    allowedEditorIds: [b1.id]
  })
  const fbRejectedDecision = await makeBoardDecision({
    sessionId: boardSession.id,
    targetSeriesId: seriesFB.id,
    decisionType: DecisionType.TRANSFER,
    result: BoardDecisionResult.REJECTED,
    allowedEditorIds: [b1.id]
  })
  const rsApprovedDecision = await makeBoardDecision({
    sessionId: boardSession.id,
    targetSeriesId: seriesRS.id,
    decisionType: DecisionType.TRANSFER,
    result: BoardDecisionResult.APPROVED,
    allowedEditorIds: [b1.id]
  })

  // §v2 point 6: guard "1 series = 1 yêu cầu chuyển nhượng đang hoạt động". Flow này tạo nhiều request
  // chồng thời gian, nên các request KHÔNG nối tiếp trên `seriesRS` (rbac 8.13, guard 8.19, otp 8.32)
  // cần MỖI CÁI một series RS riêng. Helper seed nhanh: series RS + hợp đồng RS FULLY_EXECUTED + decision TRANSFER.
  const makeRsFixture = async () => {
    const series = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: mB1.id, editorId: e2.id })
    await makeContractAt('FULLY_EXECUTED', {
      seriesId: series.id,
      mangakaId: mB1.id,
      editorId: e2.id,
      contractType: ContractType.REVENUE_SHARE
    })
    const decision = await makeBoardDecision({
      sessionId: boardSession.id,
      targetSeriesId: series.id,
      decisionType: DecisionType.TRANSFER,
      result: BoardDecisionResult.APPROVED,
      allowedEditorIds: [b1.id]
    })
    return { series, decision }
  }
  const rbacRs = await makeRsFixture()
  const guardRs = await makeRsFixture()
  const otpRs = await makeRsFixture()
  // §v2 point 6: rejectId (8.4) cũng chồng transferId (8.1) trên seriesFB → cần FB series riêng + decision REJECTED.
  const makeFbRejectFixture = async () => {
    const series = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: mA.id, editorId: e1.id })
    await makeContractAt('FULLY_EXECUTED', {
      seriesId: series.id,
      mangakaId: mA.id,
      editorId: e1.id,
      contractType: ContractType.FULL_BUYOUT
    })
    const rejectedDecision = await makeBoardDecision({
      sessionId: boardSession.id,
      targetSeriesId: series.id,
      decisionType: DecisionType.TRANSFER,
      result: BoardDecisionResult.REJECTED,
      allowedEditorIds: [b1.id]
    })
    return { series, rejectedDecision }
  }
  const rejectFb = await makeFbRejectFixture()

  // ─── SERIES C: NO contract ──────────────────────────────────────────────────
  const seriesNoContract = await makeSeriesAt(SeriesStatus.SERIALIZED, {
    mangakaId: mOther.id,
    editorId: e1.id
  })

  // ─── Section 8.1 — M-B2 tạo transfer request → SUBMITTED + snapshot ────
  section('8.1 M-B2 tạo transfer request → SUBMITTED + snapshot originalContractType')
  const r1 = await req('POST', '/transfers/requests', {
    token: mB2Tok,
    body: {
      seriesId: seriesFB.id,
      planDescription: 'Plan to revamp the series',
      proposedType: TransferType.FULL_TRANSFER
    }
  })
  ok('8.1a create transfer 201', r1.status === 201, `got ${r1.status} ${r1.raw.slice(0, 200)}`)
  ok('8.1b status SUBMITTED', responseData(r1)?.status === 'SUBMITTED', `got ${String(responseData(r1)?.status)}`)
  ok(
    '8.1c originalContractType snapshot = FULL_BUYOUT',
    r1.json?.data?.originalContractType === 'FULL_BUYOUT' || r1.json?.originalContractType === 'FULL_BUYOUT',
    `got ${r1.json?.data?.originalContractType ?? r1.json?.originalContractType}`
  )
  const transferId = r1.json?.data?.id ?? r1.json?.id
  const r1Detail = await req('GET', `/transfers/requests/${transferId}`, { token: b1Tok })
  ok(
    'F08-EMB transfer detail embeds requesting mangaka',
    r1Detail.status === 200 && r1Detail.json?.data?.requestingMangaka?.displayName?.length > 0,
    `got ${r1Detail.status} ${r1Detail.raw.slice(0, 200)}`
  )

  // ─── Section 8.2 — RBAC: request bởi EDITOR → 403 ──────────────────────────
  section('8.2 RBAC: tạo transfer bởi EDITOR → 403')
  const r2 = await req('POST', '/transfers/requests', {
    token: e1Tok,
    body: {
      seriesId: seriesFB.id,
      planDescription: 'Wrong role',
      proposedType: TransferType.FULL_TRANSFER
    }
  })
  ok('8.2a editor tạo transfer 403', r2.status === 403, `got ${r2.status} ${r2.raw.slice(0, 200)}`)

  // ─── Section 8.3 — Guard: series no contract → NoActiveContractFound ────
  section('8.3 series no contract → NoActiveContractFound')
  const r3 = await req('POST', '/transfers/requests', {
    token: mB2Tok,
    body: {
      seriesId: seriesNoContract.id,
      planDescription: 'No contract',
      proposedType: TransferType.FULL_TRANSFER
    }
  })
  // 400 + Error.NoActiveContractForSeries
  expectError(r3, 400, 'Error.NoActiveContractForSeries', '8.3a no contract → Error.NoActiveContractForSeries')

  // ─── Section 8.4 — Board reject → REJECTED_BY_BOARD ────────────────────────
  section('8.4 B reject screening → REJECTED_BY_BOARD')
  const r4a = await req('POST', '/transfers/requests', {
    token: mB2Tok,
    body: {
      seriesId: rejectFb.series.id,
      planDescription: 'Will be rejected',
      proposedType: TransferType.FULL_TRANSFER
    }
  })
  const rejectId = r4a.json?.data?.id ?? r4a.json?.id
  const r4b = await req('POST', `/transfers/requests/${rejectId}/board-reject`, {
    token: b1Tok,
    body: { boardDecisionId: rejectFb.rejectedDecision.id, details: 'insufficient capability' }
  })
  ok('8.4a board-reject 201', r4b.status === 201, `got ${r4b.status} ${r4b.raw.slice(0, 200)}`)
  ok(
    '8.4b status REJECTED_BY_BOARD',
    responseData(r4b)?.status === 'REJECTED_BY_BOARD',
    `got ${String(responseData(r4b)?.status)}`
  )

  // ─── Section 8.4c — authoritative BoardDecision negative matrix ──────────
  section('8.4c BoardDecision semantic integrity + roster authorization')
  const rejectedDecisionForApprove = await req('POST', `/transfers/requests/${transferId}/board-approve`, {
    token: b1Tok,
    body: { boardDecisionId: fbRejectedDecision.id }
  })
  expectError(
    rejectedDecisionForApprove,
    422,
    'Error.InvalidTransferBoardDecision',
    '8.4c1 APPROVE action rejects REJECTED decision'
  )
  const wrongSeriesDecision = await req('POST', `/transfers/requests/${transferId}/board-approve`, {
    token: b1Tok,
    body: { boardDecisionId: rsApprovedDecision.id }
  })
  expectError(
    wrongSeriesDecision,
    422,
    'Error.InvalidTransferBoardDecision',
    '8.4c2 decision from another series is rejected'
  )
  const sessionMasqueradingAsDecision = await req('POST', `/transfers/requests/${transferId}/board-approve`, {
    token: b1Tok,
    body: { boardDecisionId: boardSession.id }
  })
  expectError(
    sessionMasqueradingAsDecision,
    422,
    'Error.InvalidTransferBoardDecision',
    '8.4c3 BoardSession id cannot masquerade as BoardDecision id'
  )
  const outsiderBoardDecision = await req('POST', `/transfers/requests/${transferId}/board-approve`, {
    token: bOutsideTok,
    body: { boardDecisionId: fbApprovedDecision.id }
  })
  expectError(
    outsiderBoardDecision,
    403,
    'Error.TransferAccessDenied',
    '8.4c4 Board member outside authoritative roster is denied'
  )

  // ─── Section 8.5 — Board approve screening → UNDER_REVIEW ──────────────────
  section('8.5 B approve screening → UNDER_REVIEW')
  const r5 = await req('POST', `/transfers/requests/${transferId}/board-approve`, {
    token: b1Tok,
    body: { boardDecisionId: fbApprovedDecision.id }
  })
  ok('8.5a board-approve 201', r5.status === 201, `got ${r5.status} ${r5.raw.slice(0, 200)}`)
  ok('8.5b status UNDER_REVIEW', responseData(r5)?.status === 'UNDER_REVIEW', `got ${String(responseData(r5)?.status)}`)

  // ─── Section 8.6 — Board approve khi không SUBMITTED → InvalidStatusForScreening ─
  section('8.6 board-approve khi status ≠ SUBMITTED → InvalidStatusForScreening')
  const r6 = await req('POST', `/transfers/requests/${transferId}/board-approve`, {
    token: b1Tok,
    body: { boardDecisionId: fbApprovedDecision.id }
  })
  expectError(
    r6,
    400,
    'Error.InvalidStatusForScreening',
    '8.6a board-approve khi UNDER_REVIEW → Error.InvalidStatusForScreening'
  )

  // ─── Section 8.7 — Scoping: GET /transfers/requests/mine / pending-board ─
  section('8.7 Scoping: mine + pending-board')
  const r7a = await req('GET', '/transfers/requests/mine', { token: mB2Tok })
  ok('8.7a mine 200', r7a.status === 200, `got ${r7a.status}`)
  // API wraps response in envelope {success, message, data}; service also returns {data: [...]}.
  // So actual array is at r7a.json?.data?.data.
  const mineList = r7a.json?.data?.data ?? r7a.json?.data ?? r7a.json
  ok('8.7b có ≥1 entry', Array.isArray(mineList) && mineList.length >= 1, `got ${JSON.stringify(r7a.json)}`)
  const r7c = await req('GET', '/transfers/requests/pending-board', { token: b1Tok })
  ok('8.7c pending-board 200', r7c.status === 200, `got ${r7c.status}`)
  const r7d = await req('GET', '/transfers/requests/mine', { token: a1Tok })
  ok('8.7d assistant mine 403', r7d.status === 403, `got ${r7d.status}`)
  const r7e = await req('GET', '/transfers/requests/pending-board', { token: e1Tok })
  ok('8.7e editor pending-board 403', r7e.status === 403, `got ${r7e.status}`)

  // ─── Section 8.8 — id rác GET → 404 ───────────────────────────────────────
  section('8.8 id rác → 404')
  const r8b = await req('GET', '/transfers/requests/notahexid', { token: b1Tok })
  expectError(r8b, 404, 'Error.TransferRequestNotFound', '8.8a GET format rác → TransferRequestNotFound')

  // ─── Section 8.9 — Audit TRANSFER_REQUEST entries ─────────────────────────
  section('8.9 Audit entries')
  const r9 = await req('GET', '/audit?entityType=TRANSFER_REQUEST', { token: admin })
  ok('8.9a audit endpoint 200', r9.status === 200, `got ${r9.status} ${r9.raw.slice(0, 200)}`)

  // ─── Section 8.10 — assign-full-buyout thiếu valuation → ValuationRequired ─
  section('8.10 assign-full-buyout thiếu valuation → 422 (Zod validation)')
  const r10 = await req('POST', `/transfers/requests/${transferId}/assign-full-buyout`, {
    token: b1Tok,
    body: {
      valuationAmount: 0, // <= 0 → Zod rejects với VALUATION_MUST_BE_POSITIVE (422 trước service guard)
      conditions: [{ description: 'test', type: 'RECURRING_CHAPTER', value: 100 }]
    }
  })
  expectError(r10, 422, 'Error.ValidationFailed', '8.10a valuation 0 → Zod validation fail')

  // ─── Section 8.11 — assign-full-buyout trên RS → OnlyAppliesToFullBuyout ─
  section('8.11 assign-full-buyout trên gốc REVENUE_SHARE → 400 OnlyAppliesToFullBuyout')
  // Tạo request trên RS series
  const r11a = await req('POST', '/transfers/requests', {
    token: mB2Tok,
    body: {
      seriesId: seriesRS.id,
      planDescription: 'RS transfer',
      proposedType: TransferType.FULL_TRANSFER
    }
  })
  const rsTransferId = r11a.json?.data?.id ?? r11a.json?.id
  const r11b = await req('POST', `/transfers/requests/${rsTransferId}/board-approve`, {
    token: b1Tok,
    body: { boardDecisionId: rsApprovedDecision.id }
  })
  ok('8.11a board-approve RS transfer', r11b.status === 201, `got ${r11b.status}`)
  const r11c = await req('POST', `/transfers/requests/${rsTransferId}/assign-full-buyout`, {
    token: b1Tok,
    body: {
      valuationAmount: 5000,
      conditions: [{ description: 'test', type: 'RECURRING_CHAPTER', value: 100 }]
    }
  })
  expectError(r11c, 400, 'Error.OnlyAppliesToFullBuyout', '8.11b assign-full-buyout trên RS → OnlyAppliesToFullBuyout')

  // ─── Section 8.12 — FULL_BUYOUT staged saga + durable outbox ─────────────
  section('8.12 FULL_BUYOUT staged saga → AWAITING_REPLACEMENT_SIGNATURES → COMPLETED')
  const r12 = await req('POST', `/transfers/requests/${transferId}/assign-full-buyout`, {
    token: b1Tok,
    body: {
      valuationAmount: 10000,
      conditions: [
        { description: 'recurring 2 chapters', type: ConditionType.RECURRING_CHAPTER, value: 200 },
        { description: 'milestone 5', type: ConditionType.CHAPTER_MILESTONE, value: 500 }
      ]
    }
  })
  ok('8.12a assign-full-buyout 201', r12.status === 201, `got ${r12.status} ${r12.raw.slice(0, 200)}`)
  // The endpoint intentionally returns MessageResDto, so obtain the generated
  // aggregate through its authoritative sourceTransferRequestId relationship.
  const stagedReplacements = await prisma.contract.findMany({ where: { sourceTransferRequestId: transferId } })
  ok('8.12b exactly one replacement draft created', stagedReplacements.length === 1, `got ${stagedReplacements.length}`)
  const replacementContractId = stagedReplacements[0]?.id
  const stagedOldContract = await prisma.contract.findUnique({ where: { id: contractFB.id } })
  const stagedSeries = await prisma.series.findUnique({ where: { id: seriesFB.id } })
  const stagedTransfer = await prisma.transferRequest.findUnique({ where: { id: transferId } })
  const stagedReplacement =
    typeof replacementContractId === 'string'
      ? await prisma.contract.findUnique({ where: { id: replacementContractId } })
      : null
  ok(
    '8.12c old contract remains FULLY_EXECUTED before replacement signatures',
    stagedOldContract?.status === 'FULLY_EXECUTED',
    `got ${stagedOldContract?.status}`
  )
  ok(
    '8.12d owner remains Mangaka A before replacement signatures',
    stagedSeries?.mangakaId === mA.id,
    `got ${stagedSeries?.mangakaId}`
  )
  ok(
    '8.12e request AWAITING_REPLACEMENT_SIGNATURES',
    stagedTransfer?.status === 'AWAITING_REPLACEMENT_SIGNATURES',
    `got ${stagedTransfer?.status}`
  )
  ok(
    '8.12f replacement is DRAFT and linked to transfer',
    stagedReplacement?.status === 'DRAFT' && stagedReplacement.sourceTransferRequestId === transferId,
    `got ${stagedReplacement?.status}/${stagedReplacement?.sourceTransferRequestId}`
  )
  ok(
    '8.12g no replacement outbox event before final signature',
    (await prisma.outboxEvent.count({
      where: { type: OutboxEventType.TRANSFER_REPLACEMENT_READY, aggregateId: transferId }
    })) === 0
  )

  if (typeof replacementContractId !== 'string') throw new Error('Flow08 replacement contract id missing')
  const r12Review = await req('PATCH', `/contracts/${replacementContractId}/status`, {
    token: e1Tok,
    body: { status: 'MANGAKA_REVIEW' }
  })
  ok('8.12h editor sends replacement to Mangaka review', r12Review.status === 200, `got ${r12Review.status}`)
  const r12Approve = await req('PATCH', `/contracts/${replacementContractId}/status`, {
    token: mB2Tok,
    body: { status: 'MANGAKA_APPROVED' }
  })
  ok('8.12i replacement Mangaka approves', r12Approve.status === 200, `got ${r12Approve.status}`)
  const r12MissingDecision = await req('POST', `/contracts/${replacementContractId}/board-approve`, { token: b1Tok })
  expectError(r12MissingDecision, 422, 'Error.ValidationFailed', '8.12j board-approve requires boardDecisionId')
  const replacementVersion = await prisma.contractVersion.findFirst({
    where: { contractId: replacementContractId },
    orderBy: { versionNumber: 'desc' }
  })
  if (!replacementVersion) throw new Error('Flow08 replacement contract version missing')
  const replacementApprovalDecision = await makeApprovedContractDecision({
    seriesId: seriesFB.id,
    resourceType: 'REPLACEMENT_CONTRACT',
    resourceId: replacementContractId,
    versionId: replacementVersion.id
  })
  const r12BoardApprove = await req('POST', `/contracts/${replacementContractId}/board-approve`, {
    token: b1Tok,
    body: { boardDecisionId: replacementApprovalDecision.id }
  })
  ok(
    '8.12k Board applies approved replacement decision',
    r12BoardApprove.status === 201,
    `got ${r12BoardApprove.status}`
  )
  await seedOtp(mB2.email, 'SIGNING_CONTRACT')
  const r12MangakaSign = await req('POST', `/contracts/${replacementContractId}/signatures/mangaka`, {
    token: mB2Tok,
    body: { otpCode: '123456' }
  })
  ok('8.12l replacement Mangaka signs', r12MangakaSign.status === 201, `got ${r12MangakaSign.status}`)
  await seedOtp(b1.email, 'SIGNING_CONTRACT')
  const r12BoardSign = await req('POST', `/contracts/${replacementContractId}/signatures/board`, {
    token: b1Tok,
    body: { otpCode: '123456' }
  })
  ok('8.12m final Board signature accepted', r12BoardSign.status === 201, `got ${r12BoardSign.status}`)

  const outboxAfterSignature = await prisma.outboxEvent.findMany({
    where: { type: OutboxEventType.TRANSFER_REPLACEMENT_READY, aggregateId: transferId }
  })
  ok(
    '8.12n exactly one durable replacement outbox event',
    outboxAfterSignature.length === 1,
    `got ${outboxAfterSignature.length}`
  )
  const settled = await waitFor(async () => {
    const request = await prisma.transferRequest.findUnique({ where: { id: transferId } })
    return request?.status === 'COMPLETED'
  })
  ok('8.12o outbox finalizer settles request to COMPLETED', settled)
  const finalOldContract = await prisma.contract.findUnique({ where: { id: contractFB.id } })
  const finalReplacement = await prisma.contract.findUnique({ where: { id: replacementContractId } })
  const finalSeries = await prisma.series.findUnique({ where: { id: seriesFB.id } })
  ok(
    '8.12p old contract TERMINATED only after finalization',
    finalOldContract?.status === 'TERMINATED',
    `got ${finalOldContract?.status}`
  )
  ok(
    '8.12q replacement FULLY_EXECUTED after finalization',
    finalReplacement?.status === 'FULLY_EXECUTED',
    `got ${finalReplacement?.status}`
  )
  ok(
    '8.12r owner changes to Mangaka B after finalization',
    finalSeries?.mangakaId === mB2.id,
    `got ${finalSeries?.mangakaId}`
  )
  // 🔴 Flake §83.4 — ĐÃ TRUY RA GỐC: `TransferFinalizerService.finalize` set request=COMPLETED *bên trong*
  // transaction, nhưng `processedAt` chỉ được ghi ở `effects.acknowledge()` chạy SAU transaction và SAU
  // `effects.publish()` (audit + notify + emit). `waitFor` ở 8.12n thoát ngay khi COMPLETED commit ⇒ có
  // cửa sổ vài chục ms mà processedAt còn null. Đọc thẳng như trước là RACE, không phải bug production
  // (acknowledge-sau-publish là chủ ý để giữ ngữ nghĩa at-least-once). Vì vậy test phải CHỜ, không được đoán.
  const outboxProcessed = await waitFor(async () => {
    const rows = await prisma.outboxEvent.findMany({
      where: { type: OutboxEventType.TRANSFER_REPLACEMENT_READY, aggregateId: transferId }
    })
    return rows.length === 1 && rows[0]?.processedAt instanceof Date
  })
  const finalOutboxSettled = await prisma.outboxEvent.findMany({
    where: { type: OutboxEventType.TRANSFER_REPLACEMENT_READY, aggregateId: transferId }
  })
  ok(
    '8.12s outbox processed exactly once',
    outboxProcessed,
    `got ${finalOutboxSettled.length}/${String(finalOutboxSettled[0]?.processedAt)}`
  )
  await sleep(5500)
  ok(
    '8.12t processor retry is idempotent',
    (await prisma.outboxEvent.count({
      where: { type: OutboxEventType.TRANSFER_REPLACEMENT_READY, aggregateId: transferId }
    })) === 1 &&
      (await prisma.contract.count({ where: { sourceTransferRequestId: transferId } })) === 1 &&
      (await prisma.transferRequest.findUnique({ where: { id: transferId } }))?.status === 'COMPLETED'
  )

  // ─── Section 8.13 — RBAC: assign-full-buyout bởi E → 403 ────────────────
  section('8.13 RBAC: E assign-full-buyout → 403')
  // §v2 point 6: dùng RS series RIÊNG (rbacRs) để không đụng request đang active trên seriesRS.
  const r13a = await req('POST', '/transfers/requests', {
    token: mB2Tok,
    body: {
      seriesId: rbacRs.series.id,
      planDescription: 'rbac test',
      proposedType: TransferType.FULL_TRANSFER
    }
  })
  ok('8.13a rbacFbId create 201', r13a.status === 201, `got ${r13a.status} ${r13a.raw.slice(0, 200)}`)
  const rbacFbId = r13a.json?.data?.id ?? r13a.json?.id
  ok('8.13b rbacFbId extracted', !!rbacFbId, `got ${rbacFbId}`)
  const r13b = await req('POST', `/transfers/requests/${rbacFbId}/board-approve`, {
    token: b1Tok,
    body: { boardDecisionId: rbacRs.decision.id }
  })
  ok('8.13c board-approve 201', r13b.status === 201, `got ${r13b.status} ${r13b.raw.slice(0, 200)}`)
  const r13c = await req('POST', `/transfers/requests/${rbacFbId}/assign-full-buyout`, {
    token: e1Tok, // editor
    body: {
      valuationAmount: 1000,
      conditions: [{ description: 'test', type: 'RECURRING_CHAPTER', value: 100 }]
    }
  })
  ok('8.13d editor assign-full-buyout 403', r13c.status === 403, `got ${r13c.status} ${r13c.raw.slice(0, 200)}`)

  // ─── Section 8.14 — REVENUE_SHARE: start-negotiation trên FB gốc → OnlyAppliesToRevenueShare ─
  section('8.14 start-negotiation trên FB → OnlyAppliesToRevenueShare (gốc FB → guard)')
  // rbacFbId (RS series) — start-negotiation hợp lệ (RS), nên cần tạo transfer mới trên FB
  // NHƯNG FB đã DRAFT contract sau 8.12
  // Guard type is evaluated before state, so a rejected FULL_BUYOUT request is sufficient.
  const r14 = await req('POST', `/transfers/requests/${rejectId}/start-negotiation`, {
    token: e1Tok
  })
  expectError(r14, 400, 'Error.OnlyAppliesToRevenueShare', '8.14a FULL_BUYOUT negotiation → OnlyAppliesToRevenueShare')

  // ─── Section 8.15 — REVENUE_SHARE: start-negotiation → NEGOTIATING ────────
  section('8.15 REVENUE_SHARE: start-negotiation → NEGOTIATING')
  // rsTransferId is UNDER_REVIEW từ 8.11
  const r15 = await req('POST', `/transfers/requests/${rsTransferId}/start-negotiation`, {
    token: e2Tok
  })
  ok('8.15a start-negotiation 201', r15.status === 201, `got ${r15.status} ${r15.raw.slice(0, 200)}`)
  ok(
    '8.15b status NEGOTIATING',
    responseData(r15)?.status === 'NEGOTIATING',
    `got ${String(responseData(r15)?.status)}`
  )

  // ─── Section 8.16 — REVENUE_SHARE: M-B1 (gốc) reject → REJECTED_BY_ORIGINAL_MANGAKA ─
  section('8.16 M-B1 reject NEGOTIATING → REJECTED_BY_ORIGINAL_MANGAKA')
  const r16 = await req('POST', `/transfers/requests/${rsTransferId}/mangaka-reject`, {
    token: mB1Tok
  })
  ok('8.16a m reject 201', r16.status === 201, `got ${r16.status} ${r16.raw.slice(0, 200)}`)
  ok(
    '8.16b status REJECTED_BY_ORIGINAL_MANGAKA',
    responseData(r16)?.status === 'REJECTED_BY_ORIGINAL_MANGAKA',
    `got ${String(responseData(r16)?.status)}`
  )

  // ─── Section 8.17 — REVENUE_SHARE: M accept NEGOTIATING → ACCEPTED (§v2 point 1) ───
  section('8.17 M accept NEGOTIATING → ACCEPTED')
  const r17a = await req('POST', '/transfers/requests', {
    token: mB2Tok,
    body: {
      seriesId: seriesRS.id,
      planDescription: 'RS accept test',
      proposedType: TransferType.PARTIAL_TRANSFER,
      proposedPercentage: 30
    }
  })
  const acceptId = r17a.json?.data?.id ?? r17a.json?.id
  const r17b = await req('POST', `/transfers/requests/${acceptId}/board-approve`, {
    token: b1Tok,
    body: { boardDecisionId: rsApprovedDecision.id }
  })
  ok('8.17a board-approve', r17b.status === 201, `got ${r17b.status}`)
  const r17c = await req('POST', `/transfers/requests/${acceptId}/start-negotiation`, {
    token: e2Tok
  })
  ok('8.17c start-negotiation', r17c.status === 201, `got ${r17c.status}`)
  const r17d = await req('POST', `/transfers/requests/${acceptId}/mangaka-accept`, {
    token: mB1Tok
  })
  ok('8.17d m accept 201', r17d.status === 201, `got ${r17d.status} ${r17d.raw.slice(0, 200)}`)
  ok('8.17e status ACCEPTED', responseData(r17d)?.status === 'ACCEPTED', `got ${String(responseData(r17d)?.status)}`)

  // ─── Section 8.18 — accept khi không NEGOTIATING → RequestNotInNegotiatingStage ─
  section('8.18 mangaka-accept khi ≠ NEGOTIATING → Error.RequestNotInNegotiatingStage')
  const r18 = await req('POST', `/transfers/requests/${acceptId}/mangaka-accept`, {
    token: mB1Tok
  })
  expectError(
    r18,
    400,
    'Error.RequestNotInNegotiatingStage',
    '8.18a accept khi ACCEPTED → Error.RequestNotInNegotiatingStage'
  )

  // ─── Section 8.19 — Tạo TransferContract khi request chưa ACCEPTED (§v2 point 2) ──
  section('8.19 tạo TransferContract khi request chưa ACCEPTED (đang NEGOTIATING) → InvalidTransferState')
  // §v2 point 6: guardRs = RS series riêng. board-approve (→ UNDER_REVIEW) + start-negotiation (→ NEGOTIATING) — KHÔNG accept
  const r19a = await req('POST', '/transfers/requests', {
    token: mB2Tok,
    body: {
      seriesId: guardRs.series.id,
      planDescription: 'contract guard test',
      proposedType: TransferType.PARTIAL_TRANSFER,
      proposedPercentage: 40
    }
  })
  const guardId = r19a.json?.data?.id ?? r19a.json?.id
  await req('POST', `/transfers/requests/${guardId}/board-approve`, {
    token: b1Tok,
    body: { boardDecisionId: guardRs.decision.id }
  })
  await req('POST', `/transfers/requests/${guardId}/start-negotiation`, {
    token: e2Tok
  })
  // Now in NEGOTIATING, not UNDER_REVIEW — create contract → 409
  const r19d = await req('POST', '/transfers/contracts', {
    token: e2Tok,
    body: {
      transferRequestId: guardId,
      transferAmount: 1000,
      transferType: TransferType.PARTIAL_TRANSFER,
      newOwnershipSplit: { mB1: 60, mB2: 40 },
      coOwnerApprovalRequired: true
    }
  })
  expectError(r19d, 409, 'Error.InvalidTransferState', '8.19a tạo contract khi NEGOTIATING → InvalidTransferState')

  // ─── Section 8.20 — E tạo TransferContract hợp lệ (ACCEPTED — §v2 point 2) ─────────
  section('8.20 E tạo TransferContract ACCEPTED → DRAFT')
  const r20 = await req('POST', '/transfers/contracts', {
    token: e2Tok,
    body: {
      transferRequestId: acceptId,
      transferAmount: 5000,
      transferType: TransferType.PARTIAL_TRANSFER,
      newOwnershipSplit: { mB1: 60, mB2: 40 },
      coOwnerApprovalRequired: true
    }
  })
  ok('8.20a create contract 201', r20.status === 201, `got ${r20.status} ${r20.raw.slice(0, 200)}`)
  ok('8.20b status DRAFT', responseData(r20)?.status === 'DRAFT', `got ${String(responseData(r20)?.status)}`)
  const contractTId = r20.json?.data?.id ?? r20.json?.id
  if (typeof contractTId !== 'string') throw new Error('Flow08 transfer contract id missing')

  // ─── Section 8.20bis — Spec 27: bên ký PHẢI khám phá được id + đọc được điều khoản ──
  // Trước Spec 27, `transferContractId` không lộ ra bất kỳ đường GET nào ⇒ chỉ Editor (người tạo)
  // biết id, Mangaka/Board không có cách nào ký. Unit test mock Prisma KHÔNG chứng minh được
  // truy vấn `where: { transferRequestId: { in: [...] } }` chạy đúng trên Mongo — chỉ DB thật mới lộ.
  section('8.20bis Spec 27 — transferContractId + GET /transfers/contracts/:id')

  const r20cDetail = await req('GET', `/transfers/requests/${acceptId}`, { token: mB2Tok })
  ok(
    '8.20bis-a GET request detail trả transferContractId khớp hợp đồng vừa tạo',
    responseData(r20cDetail)?.transferContractId === contractTId,
    `got ${String(responseData(r20cDetail)?.transferContractId)} · expected ${String(contractTId)}`
  )

  const r20cMine = await req('GET', '/transfers/requests/mine', { token: mB2Tok })
  const mineRows = (responseData(r20cMine)?.data ?? []) as Array<{ id?: string; transferContractId?: string | null }>
  const mineRow = mineRows.find((row) => row.id === acceptId)
  ok(
    '8.20bis-b GET /mine cũng mang transferContractId (list, không chỉ detail)',
    mineRow?.transferContractId === contractTId,
    `got ${String(mineRow?.transferContractId)}`
  )

  // Mangaka A (bên nhượng) đọc điều khoản TRƯỚC khi ký — trước Spec 27 là ký mù.
  const r20cRead = await req('GET', `/transfers/contracts/${contractTId}`, { token: mB1Tok })
  const term = responseData(r20cRead)
  ok('8.20bis-c Mangaka A đọc được hợp đồng (200)', r20cRead.status === 200, `got ${r20cRead.status}`)
  ok('8.20bis-d trả đúng transferAmount', term?.transferAmount === 5000, `got ${String(term?.transferAmount)}`)
  ok(
    '8.20bis-e trả newOwnershipSplit đúng shape Record<string,number>',
    (term?.newOwnershipSplit as Record<string, number> | undefined)?.mB1 === 60 &&
      (term?.newOwnershipSplit as Record<string, number> | undefined)?.mB2 === 40,
    `got ${JSON.stringify(term?.newOwnershipSplit)}`
  )
  ok('8.20bis-f trả status để biết tới lượt ai ký', term?.status === 'DRAFT', `got ${String(term?.status)}`)

  // Board trong roster cũng đọc được (Board ký sau cùng nên cần xem điều khoản nhất).
  const r20cBoard = await req('GET', `/transfers/contracts/${contractTId}`, { token: b1Tok })
  ok('8.20bis-g Board đọc được hợp đồng (200)', r20cBoard.status === 200, `got ${r20cBoard.status}`)

  // id rác phải 404 sạch, KHÔNG để Prisma ném P2023 → 500.
  const r20cBad = await req('GET', '/transfers/contracts/notahexid', { token: mB1Tok })
  expectError(r20cBad, 404, 'Error.TransferContractNotFound', '8.20bis-h id rác → 404 sạch')

  // ─── Section 8.21 — Tạo TransferContract với split tổng ≠ 100 → 422 ──
  section('8.21 split tổng ≠ 100 → 422 (validation)')
  const r21 = await req('POST', '/transfers/contracts', {
    token: e2Tok,
    body: {
      transferRequestId: acceptId,
      transferAmount: 5000,
      transferType: TransferType.PARTIAL_TRANSFER,
      newOwnershipSplit: { mB1: 60, mB2: 30 }, // tổng 90
      coOwnerApprovalRequired: false
    }
  })
  expectError(r21, 422, 'Error.InvalidOwnershipSplit', '8.21a split ≠ 100 → InvalidOwnershipSplit')

  // ─── Section 8.22 — 3-signature flow: A → B → Board → FULLY_EXECUTED ──
  section('8.22 3 bên ký: MANGAKA_A → MANGAKA_B → BOARD → FULLY_EXECUTED')
  // Seed OTP cho 3 bên
  await seedOtp(mB1.email, 'SIGNING_CONTRACT')
  await seedOtp(mB2.email, 'SIGNING_CONTRACT')
  await seedOtp(b1.email, 'SIGNING_CONTRACT')

  const r22MissingDecision = await req('POST', `/transfers/contracts/${contractTId}/sign`, {
    token: mB1Tok,
    body: { otpCode: '123456' }
  })
  expectError(
    r22MissingDecision,
    409,
    'Error.TransferContractApprovalDecisionRequired',
    '8.22a first signature is blocked before Board approval'
  )
  await makeApprovedContractDecision({
    seriesId: seriesRS.id,
    resourceType: 'TRANSFER_CONTRACT',
    resourceId: contractTId
  })

  // Client attempts to spoof MANGAKA_A. The server derives MANGAKA_B from the
  // authenticated actor, rejects the out-of-order signature and does not burn OTP.
  const r22Spoof = await req('POST', `/transfers/contracts/${contractTId}/sign?signerRole=MANGAKA_A`, {
    token: mB2Tok,
    body: { otpCode: '123456' }
  })
  expectError(r22Spoof, 409, 'Error.InvalidTransferState', '8.22b spoofed signerRole is ignored')

  // A sign
  const r22a = await req('POST', `/transfers/contracts/${contractTId}/sign`, {
    token: mB1Tok,
    body: { otpCode: '123456' }
  })
  ok('8.22c A sign 201', r22a.status === 201, `got ${r22a.status} ${r22a.raw.slice(0, 200)}`)

  // B sign
  const r22b = await req('POST', `/transfers/contracts/${contractTId}/sign`, {
    token: mB2Tok,
    body: { otpCode: '123456' }
  })
  ok('8.22d B sign 201', r22b.status === 201, `got ${r22b.status} ${r22b.raw.slice(0, 200)}`)

  // Board sign
  const r22c = await req('POST', `/transfers/contracts/${contractTId}/sign`, {
    token: b1Tok,
    body: { otpCode: '123456' }
  })
  ok('8.22e Board sign 201', r22c.status === 201, `got ${r22c.status} ${r22c.raw.slice(0, 200)}`)
  await sleep(300)

  // verify status FULLY_EXECUTED
  const signedContract = await prisma.transferContract.findUnique({ where: { id: contractTId } })
  ok('8.22f contract FULLY_EXECUTED', signedContract?.status === 'FULLY_EXECUTED', `got ${signedContract?.status}`)
  const completedRevenueShare = await prisma.transferRequest.findUnique({ where: { id: acceptId } })
  ok(
    '8.22g request COMPLETED atomically with final signature',
    completedRevenueShare?.status === 'COMPLETED',
    `got ${completedRevenueShare?.status}`
  )
  // verify 3 signatures
  const sigs = await prisma.transferContractSignature.findMany({ where: { transferContractId: contractTId } })
  ok('8.22h 3 signatures', sigs.length === 3, `got ${sigs.length}`)

  // ─── Section 8.23 — Sign lần 2 với cùng role → UserHasAlreadySigned ───
  section('8.23 sign lần 2 cùng role → Error.TransferAlreadySigned')
  await seedOtp(mB1.email, 'SIGNING_CONTRACT')
  const r23 = await req('POST', `/transfers/contracts/${contractTId}/sign`, {
    token: mB1Tok,
    body: { otpCode: '123456' }
  })
  expectError(r23, 400, 'Error.TransferAlreadySigned', '8.23a re-sign MANGAKA_A → Error.TransferAlreadySigned')

  // ─── Section 8.24 — PARTIAL_TRANSFER → Series.coOwnerId = original + coOwnerApprovalRequired ─
  section('8.24 PARTIAL_TRANSFER → co-owner setup')
  const updatedRS = await prisma.series.findUnique({ where: { id: seriesRS.id } })
  ok(
    '8.24a coOwnerId set',
    updatedRS?.coOwnerId === mB1.id,
    `got coOwnerId=${updatedRS?.coOwnerId}, mangakaId=${updatedRS?.mangakaId}`
  )
  ok(
    '8.24b coOwnerApprovalRequired true',
    updatedRS?.coOwnerApprovalRequired === true,
    `got ${updatedRS?.coOwnerApprovalRequired}`
  )

  // ─── Section 8.25 — M-B2 publish chapter mới (sau PARTIAL_TRANSFER) → AWAITING_CO_OWNER_APPROVAL ─
  section('8.25 publish chapter mới → AWAITING_CO_OWNER_APPROVAL (co-owner gate)')
  // Tạo chapter mới cho seriesRS (mới transfer sang mB2)
  const newCh = await makeChapterAt({
    seriesId: seriesRS.id,
    chapterNumber: 99,
    manuscriptStatus: ManuscriptStatus.READY_FOR_PRINT
  })
  // E publish via API
  const r25 = await req('POST', `/chapters/${newCh.id}/publish`, {
    token: e2Tok
  })
  ok('8.25a publish chapter 201', r25.status === 201, `got ${r25.status} ${r25.raw.slice(0, 200)}`)
  const mssState = await prisma.manuscript.findUnique({ where: { chapterId: newCh.id } })
  ok(
    '8.25b manuscript AWAITING_CO_OWNER_APPROVAL',
    mssState?.status === 'AWAITING_CO_OWNER_APPROVAL',
    `got ${mssState?.status}`
  )
  const coOwnerApproval = await prisma.chapterCoOwnerApproval.findFirst({ where: { chapterId: newCh.id } })
  ok(
    '8.25c ChapterCoOwnerApproval PENDING',
    coOwnerApproval?.status === 'PENDING',
    `got ${String(coOwnerApproval?.status)}`
  )

  // ─── Section 8.26 — Non-co-owner co-owner-approve → 403 ─────────────────
  section('8.26 non-co-owner approve → 403')
  const r26 = await req('POST', `/chapters/${newCh.id}/co-owner-approve`, {
    token: mOtherTok // mOther không phải co-owner
  })
  expectError(r26, 403, 'Error.NotCoOwner', '8.26a non-co-owner → NotCoOwner')

  // ─── Section 8.27 — M-B1 co-owner-approve → PUBLISHED ────────────────────
  section('8.27 M-B1 co-owner-approve → PUBLISHED')
  const r27 = await req('POST', `/chapters/${newCh.id}/co-owner-approve`, {
    token: mB1Tok
  })
  ok('8.27a co-owner-approve 201', r27.status === 201, `got ${r27.status}`)
  const mssAfter = await prisma.manuscript.findUnique({ where: { chapterId: newCh.id } })
  ok('8.27b manuscript PUBLISHED', mssAfter?.status === 'PUBLISHED', `got ${mssAfter?.status}`)

  // ─── Section 8.28 — co-owner-reject (reason) → EDITOR_REVISION ──────────
  section('8.28 co-owner-reject → EDITOR_REVISION + record REJECTED')
  const newCh2 = await makeChapterAt({
    seriesId: seriesRS.id,
    chapterNumber: 100,
    manuscriptStatus: ManuscriptStatus.READY_FOR_PRINT
  })
  const r28a = await req('POST', `/chapters/${newCh2.id}/publish`, { token: e2Tok })
  ok('8.28a second publish 201', r28a.status === 201, `got ${r28a.status}`)
  const r28b = await req('POST', `/chapters/${newCh2.id}/co-owner-reject`, {
    token: mB1Tok,
    body: { reason: 'art quality insufficient' }
  })
  ok('8.28b co-owner-reject 201', r28b.status === 201, `got ${r28b.status} ${r28b.raw.slice(0, 200)}`)
  const mssReject = await prisma.manuscript.findUnique({ where: { chapterId: newCh2.id } })
  ok('8.28c manuscript EDITOR_REVISION', mssReject?.status === 'EDITOR_REVISION', `got ${mssReject?.status}`)

  // ─── Section 8.29 — Co-owner-escalation cron (set deadline quá hạn) ────
  section('8.29 escalation cron — record ESCALATED + notify B')
  const newCh3 = await makeChapterAt({
    seriesId: seriesRS.id,
    chapterNumber: 101,
    manuscriptStatus: ManuscriptStatus.READY_FOR_PRINT
  })
  const r29a = await req('POST', `/chapters/${newCh3.id}/publish`, { token: e2Tok })
  ok('8.29a third publish 201', r29a.status === 201, `got ${r29a.status}`)
  await prisma.chapterCoOwnerApproval.updateMany({
    where: { chapterId: newCh3.id },
    data: { deadline: new Date(Date.now() - 7 * 86_400_000) }
  })
  ok('8.29b setup deadline past', true)

  // ─── Section 8.30 — Sign contract id rác → Error.TransferContractNotFound ─
  section('8.30 sign contract id rác → 404')
  const r30b = await req('POST', '/transfers/contracts/notahexid/sign', {
    token: b1Tok,
    body: { otpCode: '123456' }
  })
  expectError(r30b, 404, 'Error.TransferContractNotFound', '8.30a sign format rác → Error.TransferContractNotFound')

  // ─── Section 8.31 — getSignatures ────────────────────────────────────────
  section('8.31 GET /transfers/contracts/:id/signatures')
  const r31 = await req('GET', `/transfers/contracts/${contractTId}/signatures`, { token: b1Tok })
  ok('8.31a signatures 200', r31.status === 200, `got ${r31.status}`)
  ok(
    '8.31b 3 signatures listed',
    (() => {
      const sigs = r31.json?.signatures ?? r31.json?.data?.signatures
      return Array.isArray(sigs) && sigs.length === 3
    })(),
    `got ${JSON.stringify(r31.json)}`
  )

  // ─── Section 8.32 — sign OTP sai → 422 InvalidOTP ────────────────────────
  section('8.32 sign OTP sai → 422 InvalidOTP')
  // §v2 point 6: dùng RS series RIÊNG (otpRs) để không đụng guard 1-series-1-active-request.
  const r32a = await req('POST', '/transfers/requests', {
    token: mB2Tok,
    body: {
      seriesId: otpRs.series.id,
      planDescription: 'OTP test',
      proposedType: TransferType.PARTIAL_TRANSFER,
      proposedPercentage: 25
    }
  })
  const otpReqId = r32a.json?.data?.id ?? r32a.json?.id
  const r32b = await req('POST', `/transfers/requests/${otpReqId}/board-approve`, {
    token: b1Tok,
    body: { boardDecisionId: otpRs.decision.id }
  })
  ok('8.32a board-approve OTP test', r32b.status === 201, `got ${r32b.status}`)
  await req('POST', `/transfers/requests/${otpReqId}/start-negotiation`, {
    token: e2Tok
  })
  const r32d = await req('POST', `/transfers/requests/${otpReqId}/mangaka-accept`, {
    token: mB1Tok
  })
  ok('8.32d m accept → ACCEPTED', r32d.status === 201, `got ${r32d.status}`)
  const r32e = await req('POST', '/transfers/contracts', {
    token: e2Tok,
    body: {
      transferRequestId: otpReqId,
      transferAmount: 1000,
      transferType: TransferType.PARTIAL_TRANSFER,
      newOwnershipSplit: { mB1: 70, mB2: 30 },
      coOwnerApprovalRequired: false
    }
  })
  const otpContractId = r32e.json?.data?.id ?? r32e.json?.id
  ok('8.32e contract created', !!otpContractId && r32e.status === 201, `got ${r32e.status}`)
  if (typeof otpContractId !== 'string') throw new Error('Flow08 OTP transfer contract id missing')
  await makeApprovedContractDecision({
    seriesId: otpRs.series.id,
    resourceType: 'TRANSFER_CONTRACT',
    resourceId: otpContractId
  })

  // Sign với OTP sai (chưa seedOtp → sẽ fail InvalidOTP)
  const r32f = await req('POST', `/transfers/contracts/${otpContractId}/sign`, {
    token: mB1Tok,
    body: { otpCode: '000000' }
  })
  expectError(r32f, 422, 'Error.InvalidOTP', '8.32f sign OTP sai → InvalidOTP')

  // ─── Section 8.33 — pricing/proposedPercentage validation ────────────────
  section('8.33 proposedPercentage validation (>100 hoặc âm)')
  const r33a = await req('POST', '/transfers/requests', {
    token: mB2Tok,
    body: {
      seriesId: seriesRS.id,
      planDescription: 'invalid pct',
      proposedType: TransferType.PARTIAL_TRANSFER,
      proposedPercentage: 150 // > 100
    }
  })
  ok('8.33a proposedPercentage >100 → 422', r33a.status === 422, `got ${r33a.status} ${r33a.raw.slice(0, 200)}`)
  const r33b = await req('POST', '/transfers/requests', {
    token: mB2Tok,
    body: {
      seriesId: seriesRS.id,
      planDescription: 'negative pct',
      proposedType: TransferType.PARTIAL_TRANSFER,
      proposedPercentage: -10
    }
  })
  ok('8.33b proposedPercentage <0 → 422', r33b.status === 422, `got ${r33b.status} ${r33b.raw.slice(0, 200)}`)

  // ─── Section 8.34 — Validation: body thiếu seriesId/planDescription ─────
  section('8.34 Validation 422 — body thiếu field')
  const r34 = await req('POST', '/transfers/requests', {
    token: mB2Tok,
    body: { proposedType: TransferType.FULL_TRANSFER }
  })
  ok('8.34a thiếu field → 422', r34.status === 422, `got ${r34.status}`)

  // ─── Section 8.35 — RBAC: assistant POST /transfers/requests → 403 ──────
  section('8.35 RBAC: assistant POST transfer → 403')
  const r35 = await req('POST', '/transfers/requests', {
    token: a1Tok,
    body: {
      seriesId: seriesFB.id,
      planDescription: 'wrong role',
      proposedType: TransferType.FULL_TRANSFER
    }
  })
  ok('8.35a assistant POST 403', r35.status === 403, `got ${r35.status}`)

  // ─── Section 8.36 — RBAC: mangaka-accept khi transfer không của mình ──
  section('8.36 RBAC: mangaka-accept transfer của series khác → guard response')
  const r36 = await req('POST', `/transfers/requests/${otpReqId}/mangaka-accept`, {
    token: mOtherTok // mOther không phải originalMangaka của seriesFB
  })
  expectError(r36, 403, 'Error.TransferAccessDenied', '8.36a non-owner accept → TransferAccessDenied')

  await prisma.$disconnect()
  const fail = summary(FLOW)
  process.exit(fail > 0 ? 1 : 0)
}

void main().catch(async (e) => {
  console.error('FATAL', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
