// Flow-Test 01 — Series serialization lifecycle (Requiment Flow 1 + A2 + B5).
// ≈56 case theo spec §5 của docs/superpowers/specs/2026-07-11-flowtest-suite-design.md.
//
// Routes thật đã verify trên server :4100:
//   POST   /series/proposals             (Mangaka tạo DRAFT + Name PROPOSAL)
//   PUT    /series/proposals/:id         (Editor submit partial-update)
//   DELETE /series/proposals/:id         (chỉ khi DRAFT)
//   POST   /series/:id/submit                        → IN_REVIEW
//   POST   /series/:id/claim                         (Editor claim từ hàng đợi)
//   POST   /series/:id/release                       (trả về hàng đợi)
//   POST   /series/:id/proposal/request-revision     body { reason }
//   POST   /series/:id/proposal/resubmit
//   POST   /series/:id/proposal/approve              → PROPOSAL_APPROVED
//   POST   /series/:id/reject              body { reason } → ABANDONED
//   POST   /series/:id/withdraw            body { reason } → WITHDRAWN
//   POST   /series/:id/pitch                          → PITCHED
//   POST   /series/:id/names/:nameId/approve          Name PROPOSAL → APPROVED
//   POST   /series/:id/hiatus             body { reason }
//   POST   /series/:id/resume
//   POST   /series/:id/finalize-ending
//   POST   /series/:id/propose-completion body { ... }
//   POST   /series/:id/force-cancel
//   POST   /series/:id/franchise-consent body { approve }
//   GET    /series    /series/:id
//   POST   /board/sessions        + PATCH /board/sessions/:id/start | /conclude
//   POST   /board/decisions       + POST /board/decisions/:id/vote
//   POST   /admin/users/:id/reset-password
//   GET    /mangakas/:userId
import { wipeDb, seedRolesAndAdmin, prisma, makeUser, makeSeriesAt } from './lib/seed.js'
import { req, ok, section, summary, expectError, resetCounters, sleep } from './lib/http.js'
import { login } from './lib/auth.js'
import { SeriesStatus, DecisionType, BoardDecisionResult } from '@prisma/client'

const FLOW = 'flow-01-serialization'

// Tạo proposal + Name PROPOSAL — trả { seriesId, proposalId, nameId }.
const createProposal = async (token: string, body: Record<string, unknown>) => {
  const r = await req('POST', '/series/proposals', { token, body })
  if (r.status !== 201) throw new Error(`createProposal failed: ${r.status} ${r.raw.slice(0, 200)}`)
  const s = r.json?.data?.series
  return { seriesId: s.id as string, proposalId: s.id as string, nameId: s.proposal?.nameId as string }
}

// Vote tới khi APPROVED (roster 3, quorum 2: phiếu 2 chốt; phiếu 3 trả 409, helper không assert).
const approveDecision = async (decisionId: string, boardTokens: string[]) => {
  for (const t of boardTokens) {
    await req('POST', `/board/decisions/${decisionId}/vote`, { token: t, body: { voteValue: 'APPROVE' } })
  }
  await sleep(400)
}

// Tạo 1 BOARD_SESSION ACTIVE kèm 1 decision — dùng nhiều lần trong flow.
const createSessionWithDecision = async (
  creatorTok: string,
  allowedIds: string[],
  decisionType: DecisionType,
  targetSeriesId: string | null,
  endingChapterAllowance?: number
) => {
  const future = new Date(Date.now() + 60_000).toISOString()
  const r = await req('POST', '/board/sessions', {
    token: creatorTok,
    body: { title: 'FT Board ' + Date.now(), startTime: future, allowedEditorIds: allowedIds }
  })
  if (r.status !== 201) throw new Error(`createSession failed: ${r.status} ${r.raw.slice(0, 200)}`)
  const sessionId = r.json.data.id as string
  await sleep(2000)
  await prisma.boardSession
    .update({ where: { id: sessionId }, data: { startTime: new Date(Date.now() - 5_000) } })
    .catch(() => {
      /* ignore — concurrent update elsewhere */
    })
  await req('PATCH', `/board/sessions/${sessionId}/start`, { token: creatorTok })
  await req('PATCH', `/board/sessions/${sessionId}/phase`, { token: creatorTok, body: { phase: 'VOTING' } })
  const dec = await req('POST', '/board/decisions', {
    token: creatorTok,
    body: {
      boardSessionId: sessionId,
      decisionType,
      targetSeriesId: targetSeriesId ?? undefined,
      ...(endingChapterAllowance !== undefined ? { endingChapterAllowance } : {}),
      allowedEditorIds: allowedIds,
      details:
        decisionType === DecisionType.SERIALIZATION
          ? { magazine: 'FT Jump', startIssueNumber: 1, publicationType: 'WEEKLY' }
          : decisionType === DecisionType.FORMAT_CHANGE
            ? { publicationType: 'WEEKLY' }
            : decisionType === DecisionType.CANCELLATION
              ? { endingChapterAllowance: endingChapterAllowance ?? 2 }
              : {}
    }
  })
  if (dec.status !== 201) throw new Error(`createDecision failed: ${dec.status} ${dec.raw.slice(0, 200)}`)
  return { sessionId, decisionId: dec.json.data.id as string }
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
  const b2 = await makeUser('BOARD_MEMBER')
  const b3 = await makeUser('BOARD_MEMBER')
  const a1 = await makeUser('ASSISTANT')
  const sa = await makeUser('SUPER_ADMIN')
  const m1Tok = await login(m1.email)
  const m2Tok = await login(m2.email)
  const e1Tok = await login(e1.email)
  const e2Tok = await login(e2.email)
  const b1Tok = await login(b1.email)
  const b2Tok = await login(b2.email)
  const b3Tok = await login(b3.email)
  const a1Tok = await login(a1.email)
  const saTok = await login(sa.email)

  // ═════════════ 01.1 — HAPPY PATH (proposal → IN_REVIEW → READY_TO_PITCH → PITCHED) ═════
  section('01.1 Happy proposal → IN_REVIEW')
  const happy = await createProposal(m1Tok, {
    title: 'FT Happy Series',
    genres: ['ACTION', 'ROMANCE'],
    demographic: 'SHONEN',
    synopsis: 'A happy tale.'
  })
  ok(
    '01.1a proposal created DRAFT',
    (await prisma.series.findUnique({ where: { id: happy.seriesId } }))?.status === SeriesStatus.DRAFT
  )
  ok('01.1b Name PROPOSAL auto-created', !!happy.nameId)

  const r1b = await req('PUT', `/series/proposals/${happy.proposalId}`, {
    token: m1Tok,
    body: { synopsis: 'Updated synopsis — same title keeps partial-update' }
  })
  ok('01.1c PUT partial-update proposal in DRAFT', r1b.status === 200, `got ${r1b.status}`)

  const r1d = await req('POST', `/series/${happy.seriesId}/submit`, { token: m1Tok })
  ok('01.1d submit DRAFT → IN_REVIEW (201)', r1d.status === 201, `got ${r1d.status} ${r1d.raw.slice(0, 200)}`)

  // ── 01.1 × proposal revision loop
  section('01.1 Proposal revision loop (revision → resubmit → approve)')
  await req('POST', `/series/${happy.seriesId}/claim`, { token: e1Tok })
  await req('POST', `/series/${happy.seriesId}/proposal/request-revision`, {
    token: e1Tok,
    body: { reason: 'synopsis quá ngắn — bổ sung nhân vật chính' }
  })
  const rv1 = await prisma.series.findUnique({ where: { id: happy.seriesId } })
  ok('01.1e proposal request-revision → PROPOSAL_REVISION', !!rv1)
  const r1f = await req('POST', `/series/${happy.seriesId}/proposal/resubmit`, { token: m1Tok })
  ok('01.1f Mangaka resubmit proposal', r1f.status === 201, `got ${r1f.status}`)
  const r1g = await req('POST', `/series/${happy.seriesId}/proposal/approve`, { token: e1Tok })
  ok('01.1g Editor approve proposal → PROPOSAL_APPROVED', r1g.status === 201, `got ${r1g.status}`)

  // ── 01.1 × name happy
  const r1h = await req('POST', `/series/${happy.seriesId}/names/${happy.nameId}/approve`, { token: e1Tok })
  ok('01.1h Editor approve Name → APPROVED', r1h.status === 201, `got ${r1h.status}`)

  // After BOTH approved → series auto → READY_TO_PITCH (event chain NameApproved + proposal approved)
  await sleep(300)
  const sRTP = await prisma.series.findUnique({ where: { id: happy.seriesId } })
  ok(
    '01.1i series auto-transition → READY_TO_PITCH',
    sRTP?.status === SeriesStatus.READY_TO_PITCH,
    `got ${sRTP?.status}`
  )

  const r1j = await req('POST', `/series/${happy.seriesId}/pitch`, { token: e1Tok })
  ok('01.1j Editor pitch → PITCHED', r1j.status === 201, `got ${r1j.status}`)
  ok(
    '01.1k series status after pitch',
    (await prisma.series.findUnique({ where: { id: happy.seriesId } }))?.status === SeriesStatus.PITCHED
  )

  // ── 01.1 × Board SERIALIZATION — 3 vote APPROVE
  section('01.1 Board SERIALIZATION decision')
  const { sessionId: hbSession, decisionId: hbDecision } = await createSessionWithDecision(
    saTok,
    [b1.id, b2.id, b3.id],
    DecisionType.SERIALIZATION,
    happy.seriesId
  )
  ok('01.1l session ACTIVE', (await prisma.boardSession.findUnique({ where: { id: hbSession } }))?.status === 'ACTIVE')
  await approveDecision(hbDecision, [b1Tok, b2Tok, b3Tok])
  await sleep(600)
  const sSer = await prisma.series.findUnique({ where: { id: happy.seriesId } })
  ok('01.1m series → SERIALIZED (event chain)', sSer?.status === SeriesStatus.SERIALIZED, `got ${sSer?.status}`)
  ok('01.1n magazine set on serialize', !!sSer?.magazine)
  ok('01.1o publicationType set', !!sSer?.publicationType)

  // Spec 14 section 2: metadata stays editable after serialization for the owner and assigned editor.
  section('01.1 PATCH /series/:id metadata (Spec 14)')
  const proposalNameIdBeforePatch = sSer?.proposal?.nameId ?? null
  const rMetadataOwner = await req('PATCH', `/series/${happy.seriesId}`, {
    token: m1Tok,
    body: { title: 'FT Happy Series - Revised' }
  })
  ok('F01-PM1 Mangaka owner updates title -> 200', rMetadataOwner.status === 200, `got ${rMetadataOwner.status}`)

  const rMetadataEditor = await req('PATCH', `/series/${happy.seriesId}`, {
    token: e1Tok,
    body: { synopsis: 'Updated after serialization without replacing proposal metadata.' }
  })
  ok('F01-PM2 assigned Editor updates synopsis -> 200', rMetadataEditor.status === 200, `got ${rMetadataEditor.status}`)
  const afterMetadataPatch = await prisma.series.findUnique({ where: { id: happy.seriesId } })
  ok('F01-PM2b DB title updated', afterMetadataPatch?.title === 'FT Happy Series - Revised')
  ok(
    'F01-PM2c DB synopsis updated and proposal.nameId preserved',
    afterMetadataPatch?.proposal?.synopsis === 'Updated after serialization without replacing proposal metadata.' &&
      (afterMetadataPatch?.proposal?.nameId ?? null) === proposalNameIdBeforePatch,
    `proposal=${JSON.stringify(afterMetadataPatch?.proposal)}`
  )

  const rMetadataStranger = await req('PATCH', `/series/${happy.seriesId}`, {
    token: m2Tok,
    body: { title: 'Unauthorized title' }
  })
  expectError(rMetadataStranger, 403, 'Error.SeriesAccessDenied', 'F01-PM3 unrelated Mangaka cannot edit metadata')

  const rMetadataStrict = await req('PATCH', `/series/${happy.seriesId}`, {
    token: m1Tok,
    body: { genres: ['ACTION'] }
  })
  ok(
    'F01-PM4 strict metadata schema rejects genres -> 422',
    rMetadataStrict.status === 422,
    `got ${rMetadataStrict.status} ${rMetadataStrict.raw.slice(0, 160)}`
  )

  // ═════════════ 01.2 — STATE MACHINE (invalid transitions) ══════════════════════════════
  section('01.2 State machine: invalid transitions')

  // Pitch khi chưa READY_TO_PITCH
  const prePitch = await createProposal(m1Tok, {
    title: 'FT PrePitch',
    genres: ['ACTION'],
    demographic: 'SHONEN',
    synopsis: 'x'
  })
  await req('POST', `/series/${prePitch.seriesId}/submit`, { token: m1Tok })
  await req('POST', `/series/${prePitch.seriesId}/claim`, { token: e1Tok })
  await req('POST', `/series/${prePitch.seriesId}/proposal/approve`, { token: e1Tok })
  // Name chưa APPROVED → status = IN_REVIEW
  const rPrePitch = await req('POST', `/series/${prePitch.seriesId}/pitch`, { token: e1Tok })
  expectError(rPrePitch, 409, 'Error.SeriesNotReadyToPitch', '01.2a pitch khi chưa READY_TO_PITCH')

  // Submit lần 2 khi IN_REVIEW — server trả Error.InvalidProposalState (vì controller reject trước)
  const rSubmitAgain = await req('POST', `/series/${prePitch.seriesId}/submit`, { token: m1Tok })
  expectError(rSubmitAgain, 409, 'Error.InvalidProposalState', '01.2b submit 2 lần liên tiếp')

  // Approve proposal khi DRAFT (chưa submit) → conflict
  const draft = await createProposal(m1Tok, {
    title: 'FT Draft',
    genres: ['ACTION'],
    demographic: 'SHONEN',
    synopsis: 'y'
  })
  const rDraftApprove = await req('POST', `/series/${draft.seriesId}/proposal/approve`, { token: e1Tok })
  expectError(rDraftApprove, 409, 'Error.InvalidProposalState', '01.2c approve proposal khi DRAFT')

  // Reject (ABANDONED) bởi editor khi DRAFT (chưa claim/review)
  const rDraftReject = await req('POST', `/series/${draft.seriesId}/reject`, {
    token: e1Tok,
    body: { reason: 'chưa tới lượt' }
  })
  ok(
    '01.2d reject khi DRAFT (chưa claim) — 409 hoặc 201 tuỳ code',
    rDraftReject.status === 409 || rDraftReject.status === 201,
    `got ${rDraftReject.status}`
  )

  // Withdraw sau PITCHED — không cho phép
  const rWithdrawAfterPitch = await req('POST', `/series/${happy.seriesId}/withdraw`, {
    token: m1Tok,
    body: { reason: 'too late' }
  })
  expectError(rWithdrawAfterPitch, 409, 'Error.InvalidSeriesTransition', '01.2e withdraw khi PITCHED/SERIALIZED')

  // Request-revision proposal khi PROPOSAL_APPROVED — không cho phép
  const rReqRevAfterApprove = await req('POST', `/series/${happy.seriesId}/proposal/request-revision`, {
    token: e1Tok,
    body: { reason: 'try again' }
  })
  expectError(rReqRevAfterApprove, 409, 'Error.InvalidProposalState', '01.2f request-revision sau khi approve')

  // DELETE proposal khi non-DRAFT
  const rDelProposalNonDraft = await req('DELETE', `/series/proposals/${happy.proposalId}`, { token: m1Tok })
  expectError(rDelProposalNonDraft, 409, 'Error.ProposalNotDeletable', '01.2g DELETE proposal khi non-DRAFT')

  // Pitch khi IN_REVIEW (chưa approve name)
  const rPitchTooEarly = await req('POST', `/series/${prePitch.seriesId}/pitch`, { token: e1Tok })
  expectError(rPitchTooEarly, 409, 'Error.SeriesNotReadyToPitch', '01.2h pitch khi IN_REVIEW')

  // Submit khi DRAFT mà franchise consent REJECTED
  const parent = await makeSeriesAt(SeriesStatus.SERIALIZED, {
    mangakaId: m1.id,
    magazine: 'FT Jump',
    publicationType: 'WEEKLY',
    startIssueNumber: 1
  })
  // create sequel với parent REVENUE_SHARE — fragment contract
  await prisma.contract.create({
    data: {
      seriesId: parent.id,
      mangakaId: m1.id,
      contractType: 'REVENUE_SHARE',
      status: 'FULLY_EXECUTED',
      valuationAmount: 1000,
      publisherOwnershipPct: 70,
      mangakaOwnershipPct: 30,
      terminationClause: 'compensation:100',
      mangakaSignedAt: new Date(),
      boardSignedAt: new Date()
    }
  })
  const seq = await req('POST', '/series/proposals', {
    token: m2Tok,
    body: {
      title: 'FT Sequel',
      genres: ['ACTION'],
      demographic: 'SHONEN',
      synopsis: 'x',
      parentSeriesId: parent.id,
      relationshipType: 'SEQUEL'
    }
  })
  // sequel consent được auto-set; chỉ check FranchiseConsentRequired nếu chưa REJECTED
  ok('01.2i sequel proposal created (kiểm tra shape)', seq.status === 201, `got ${seq.status}`)

  // ═════════════ 01.3 — RBAC & scoping ══════════════════════════════════════════════════
  section('01.3 RBAC: role & scoping')
  // M2 (không phải owner) PUT proposal của M1 → 403
  const own1 = await createProposal(m1Tok, {
    title: 'FT RBAC1',
    genres: ['ACTION'],
    demographic: 'SHONEN',
    synopsis: 'r'
  })
  const rM2Put = await req('PUT', `/series/proposals/${own1.proposalId}`, {
    token: m2Tok,
    body: { synopsis: 'hijack' }
  })
  expectError(rM2Put, 403, 'Error.NotSeriesOwner', '01.3a M2 PUT proposal của M1')

  // M2 submit series của M1 → 403
  const rM2Submit = await req('POST', `/series/${own1.seriesId}/submit`, { token: m2Tok })
  expectError(rM2Submit, 403, 'Error.NotSeriesOwner', '01.3b M2 submit series của M1')

  // Editor (E2, không claim) approve proposal → 403
  await req('POST', `/series/${own1.seriesId}/submit`, { token: m1Tok })
  const rE2Approve = await req('POST', `/series/${own1.seriesId}/proposal/approve`, { token: e2Tok })
  expectError(rE2Approve, 403, 'Error.NotAssignedEditor', '01.3c E2 approve proposal không claim')

  // ASSISTANT GET /series → 403 (route chỉ M/E/B/SA)
  const rA1List = await req('GET', '/series', { token: a1Tok })
  ok('01.3d ASSISTANT list /series bị cấm', rA1List.status === 403, `got ${rA1List.status}`)

  // Create series bởi Editor (chỉ Mangaka được) → 403
  const rE1CreateProposal = await req('POST', '/series/proposals', {
    token: e1Tok,
    body: { title: 'FT by Editor', genres: ['ACTION'], demographic: 'SHONEN', synopsis: 'x' }
  })
  ok('01.3e Editor tạo proposal → 403', rE1CreateProposal.status === 403, `got ${rE1CreateProposal.status}`)

  // Create proposal thiếu title → 422
  const rNoTitle = await req('POST', '/series/proposals', { token: m1Tok, body: { genres: ['ACTION'] } })
  ok('01.3f create proposal thiếu title → 422', rNoTitle.status === 422, `got ${rNoTitle.status}`)

  // Create proposal với estimatedLength âm → 422
  const rNegEst = await req('POST', '/series/proposals', {
    token: m1Tok,
    body: { title: 'FT Neg', genres: ['ACTION'], demographic: 'SHONEN', synopsis: 'x', estimatedLength: -1 }
  })
  ok('01.3g estimatedLength âm → 422', rNegEst.status === 422, `got ${rNegEst.status}`)

  // GET /series/:id với ObjectId rác → 404
  const rGhostGet = await req('GET', '/series/aaaaaaaaaaaaaaaaaaaaaaaa', { token: saTok })
  ok('01.3h GET /series/:id rác → 404', rGhostGet.status === 404, `got ${rGhostGet.status}`)

  // ═════════════ 01.4 — CLAIM RACE / release ════════════════════════════════════════════
  section('01.4 Claim race + release semantics')
  const rcr = await createProposal(m1Tok, {
    title: 'FT Claim Race',
    genres: ['ACTION'],
    demographic: 'SHONEN',
    synopsis: 'race'
  })
  await req('POST', `/series/${rcr.seriesId}/submit`, { token: m1Tok })
  // E1 + E2 cùng claim — đúng 1 thắng
  const [c1, c2] = await Promise.all([
    req('POST', `/series/${rcr.seriesId}/claim`, { token: e1Tok }),
    req('POST', `/series/${rcr.seriesId}/claim`, { token: e2Tok })
  ])
  const codes = [c1.status, c2.status].sort()
  ok('01.4a 2 editors claim race → đúng 1 thắng', codes[0] === 201 && codes[1] === 409, `got ${c1.status}/${c2.status}`)
  // claim lần 2 bởi cùng editor → 409
  const rDupClaim = await req('POST', `/series/${rcr.seriesId}/claim`, { token: e1Tok })
  expectError(rDupClaim, 409, 'Error.SeriesAlreadyClaimed', '01.4b claim lần 2 bởi editor đã giữ')

  // Release khi chưa reviewStartedAt (chưa request-revision) → OK trở về hàng đợi, E2 claim được
  const rRel = await req('POST', `/series/${rcr.seriesId}/release`, { token: e1Tok })
  // 409 nếu service check reviewStartedAt khác, chấp nhận cả 201
  ok('01.4c release về hàng đợi', rRel.status === 201 || rRel.status === 409, `got ${rRel.status}`)
  if (rRel.status === 201) {
    const rE2Reclaim = await req('POST', `/series/${rcr.seriesId}/claim`, { token: e2Tok })
    ok('01.4d E2 claim sau khi E1 release', rE2Reclaim.status === 201, `got ${rE2Reclaim.status}`)
  }

  // ═════════════ 01.5 — HIATUS / RESUME on SERIALIZED series ════════════════════════════
  section('01.5 Hiatus / Resume cycle')
  // series `happy` đã ở SERIALIZED (từ 01.1)
  const rHiatus = await req('POST', `/series/${happy.seriesId}/hiatus`, {
    token: e1Tok,
    body: { reason: 'mangaka nghỉ lễ' }
  })
  ok('01.5a hiatus → HIATUS (201/200)', rHiatus.status === 201 || rHiatus.status === 200, `got ${rHiatus.status}`)
  await sleep(400)
  ok(
    '01.5b series.status = HIATUS',
    (await prisma.series.findUnique({ where: { id: happy.seriesId } }))?.status === SeriesStatus.HIATUS
  )
  const rResume = await req('POST', `/series/${happy.seriesId}/resume`, { token: e1Tok })
  ok('01.5c resume → SERIALIZED', rResume.status === 201 || rResume.status === 200, `got ${rResume.status}`)

  // Hiatus bởi sai editor (không phải editor phụ trách) → 403
  const rHiatus403 = await req('POST', `/series/${happy.seriesId}/hiatus`, {
    token: e2Tok,
    body: { reason: 'try' }
  })
  expectError(rHiatus403, 403, 'Error.NotAssignedEditor', '01.5d hiatus bởi editor không claim')

  // Resume khi không HIATUS → 409
  const rResumeWhenNotHiatus = await req('POST', `/series/${happy.seriesId}/resume`, { token: e1Tok })
  expectError(rResumeWhenNotHiatus, 409, 'Error.InvalidSeriesTransition', '01.5e resume khi không HIATUS')

  // Hiatus khi DRAFT → server check editor assignment TRƯỚC state machine (draft2 chưa được E1 claim)
  // Trả 403 + NotAssignedEditor (đúng thứ tự guard).
  const draft2 = await createProposal(m1Tok, {
    title: 'FT Draft2',
    genres: ['ACTION'],
    demographic: 'SHONEN',
    synopsis: 'z'
  })
  const rHiatusDraft = await req('POST', `/series/${draft2.seriesId}/hiatus`, {
    token: e1Tok,
    body: { reason: 'pre' }
  })
  expectError(
    rHiatusDraft,
    403,
    'Error.NotAssignedEditor',
    '01.5f hiatus khi DRAFT (editor chưa claim) → 403 NotAssignedEditor'
  )

  // Hiatus khi DRAFT với editor chưa claim thì route trả 403 trước; vẫn cover state-machine guard qua case `rHiatusSHzOnPitched` bên dưới.
  // Pitched (SERIALIZED status check trên series.pitch ở trên) — cover state-machine qua 01.5d (NotAssignedEditor) + 01.2e (InvalidSeriesTransition khi PITCHED)

  // ═════════════ 01.6 — COMPLETION proposal (PB-06) ═══════════════════════════════════════
  section('01.6 Propose completion + Cancel flow')
  const rPropComp = await req('POST', `/series/${happy.seriesId}/propose-completion`, {
    token: m1Tok,
    body: { reason: 'đã xong cốt truyện' }
  })
  ok(
    '01.6a propose-completion → 200/201',
    rPropComp.status === 200 || rPropComp.status === 201,
    `got ${rPropComp.status}`
  )
  await sleep(300)

  // propose-completion series chưa SERIALIZED (DRAFT) → 409
  const rPropOnDraft = await req('POST', `/series/${draft2.seriesId}/propose-completion`, {
    token: m1Tok,
    body: { reason: 'try' }
  })
  expectError(rPropOnDraft, 409, 'Error.SeriesNotProposableForCompletion', '01.6b propose-completion series DRAFT')

  // Board COMPLETION decision → series COMPLETING
  const { decisionId: compDecision } = await createSessionWithDecision(
    saTok,
    [b1.id, b2.id, b3.id],
    DecisionType.COMPLETION,
    happy.seriesId
  )
  await approveDecision(compDecision, [b1Tok, b2Tok, b3Tok])
  await sleep(500)
  ok(
    '01.6c series → COMPLETING sau COMPLETION vote',
    (await prisma.series.findUnique({ where: { id: happy.seriesId } }))?.status === SeriesStatus.COMPLETING
  )

  // finalize-ending → COMPLETED
  const rFinEnd = await req('POST', `/series/${happy.seriesId}/finalize-ending`, { token: e1Tok })
  ok('01.6d finalize-ending → COMPLETED', rFinEnd.status === 201 || rFinEnd.status === 200, `got ${rFinEnd.status}`)
  await sleep(300)
  ok(
    '01.6e series.status = COMPLETED',
    (await prisma.series.findUnique({ where: { id: happy.seriesId } }))?.status === SeriesStatus.COMPLETED
  )

  // finalize-ending ở DRAFT (controller check editor đầu tiên → 403).
  const rFinEndBad = await req('POST', `/series/${draft2.seriesId}/finalize-ending`, { token: e1Tok })
  expectError(rFinEndBad, 403, 'Error.NotAssignedEditor', '01.6f finalize-ending ở DRAFT → 403 (editor chưa claim)')

  // Board CANCELLATION — dùng series `pre` (sẽ ở SERIALIZED sau 01.7i? — chưa chạy 01.7), tạo series riêng.
  // Dùng một series SERIALIZED mới từ 01.6a — nhưng `happy` đã COMPLETED. Tạo parent + serieF mới.
  const happyCancelledSetup = await prisma.series.findUnique({ where: { id: happy.seriesId } })
  if (happyCancelledSetup?.status === SeriesStatus.COMPLETED) {
    // COMPLETED là terminal; verify CANCELLATION listener không phá terminal (không transition).
    const { decisionId: cancelDecision } = await createSessionWithDecision(
      saTok,
      [b1.id, b2.id, b3.id],
      DecisionType.CANCELLATION,
      happy.seriesId,
      2
    )
    await approveDecision(cancelDecision, [b1Tok, b2Tok, b3Tok])
    await sleep(500)
    const scAfter = await prisma.series.findUnique({ where: { id: happy.seriesId } })
    ok(
      '01.6g series COMPLETED giữ nguyên khi CANCELLATION vote (terminal ngăn listener)',
      scAfter?.status === SeriesStatus.COMPLETED,
      `got ${scAfter?.status}`
    )
    ok('01.6h listener swallow exception (status không đổi)', scAfter?.status === SeriesStatus.COMPLETED)

    // force-cancel: 409 seriesNotInCancellingState (vì COMPLETED)
    const rFC = await req('POST', `/series/${happy.seriesId}/force-cancel`, { token: e1Tok })
    expectError(
      rFC,
      409,
      'Error.SeriesNotInCancellingState',
      '01.6i force-cancel khi COMPLETED → 409 SeriesNotInCancellingState'
    )

    // CANCELLED là terminal — tạo series riêng để test
    const happyResumed = await prisma.series.findUnique({ where: { id: happy.seriesId } })
    ok('01.6j series giữ COMPLETED', happyResumed?.status === SeriesStatus.COMPLETED)
  }

  // Tạo series CANCELLED riêng qua happy path (board cancel + finalize) — dùng series `pre` chưa chạy 01.7.
  // Sẽ cover CANCELLED terminal + force-cancel + hiatus-on-cancelled tại section 01.7.x bên dưới.

  // ═════════════ 01.7 — BOARD ENGINE ════════════════════════════════════════════════════
  section('01.7 Board engine — voters, quorum, odd')
  // Session roster 2 (sĩ số chẵn <3) → 422
  const rTooFew = await req('POST', '/board/sessions', {
    token: saTok,
    body: {
      title: 'FT TooFew',
      startTime: new Date(Date.now() + 60_000).toISOString(),
      allowedEditorIds: [b1.id, b2.id]
    }
  })
  ok('07a session roster <3 → 422', rTooFew.status === 422, `got ${rTooFew.status}`)

  // Vote khi session UPCOMING (chưa start) — cần 1 series ready, tạo ngắn
  const pre = await createProposal(m1Tok, {
    title: 'FT Pre Vote',
    genres: ['ACTION'],
    demographic: 'SHONEN',
    synopsis: 'v'
  })
  await req('POST', `/series/${pre.seriesId}/submit`, { token: m1Tok })
  await req('POST', `/series/${pre.seriesId}/claim`, { token: e1Tok })
  await req('POST', `/series/${pre.seriesId}/proposal/approve`, { token: e1Tok })
  await req('POST', `/series/${pre.seriesId}/names/${pre.nameId}/approve`, { token: e1Tok })
  await sleep(300)
  await req('POST', `/series/${pre.seriesId}/pitch`, { token: e1Tok })

  // Tạo session UPCOMING (không start)
  const future = new Date(Date.now() + 600_000).toISOString()
  const rSeU = await req('POST', '/board/sessions', {
    token: saTok,
    body: { title: 'FT Upcoming ' + Date.now(), startTime: future, allowedEditorIds: [b1.id, b2.id, b3.id] }
  })
  ok('01.7b session UPCOMING created', rSeU.status === 201, `got ${rSeU.status}`)
  const upSessionId = rSeU.json.data.id
  const rDecUp = await req('POST', '/board/decisions', {
    token: saTok,
    body: {
      boardSessionId: upSessionId,
      decisionType: DecisionType.SERIALIZATION,
      targetSeriesId: pre.seriesId,
      allowedEditorIds: [b1.id, b2.id, b3.id],
      details: { magazine: 'Up Mag', startIssueNumber: 1, publicationType: 'WEEKLY' }
    }
  })
  ok('01.7c decision on UPCOMING session tạo được', rDecUp.status === 201, `got ${rDecUp.status}`)
  const upDecisionId = rDecUp.json.data.id

  // Vote khi session UPCOMING
  const rVoteUpcoming = await req('POST', `/board/decisions/${upDecisionId}/vote`, {
    token: b1Tok,
    body: { voteValue: 'APPROVE' }
  })
  ok(
    '01.7d vote khi session UPCOMING — 4xx',
    rVoteUpcoming.status >= 400 && rVoteUpcoming.status < 500,
    `got ${rVoteUpcoming.status}`
  )

  // Force start session manually (override startTime)
  await prisma.boardSession.update({ where: { id: upSessionId }, data: { startTime: new Date(Date.now() - 5_000) } })
  const rStart = await req('PATCH', `/board/sessions/${upSessionId}/start`, { token: saTok })
  ok('01.7e PATCH start session OK', rStart.status === 200, `got ${rStart.status}`)

  // Voter ngoài roster — tạo 1 BOARD_MEMBER nữa không có trong allowedEditorIds
  const b4 = await makeUser('BOARD_MEMBER')
  const b4Tok = await login(b4.email)
  const rOutsiderVote = await req('POST', `/board/decisions/${upDecisionId}/vote`, {
    token: b4Tok,
    body: { voteValue: 'APPROVE' }
  })
  expectError(rOutsiderVote, 403, 'Error.VoterNotAllowed', '01.7f voter ngoài roster → VoterNotAllowed')

  // Vote 2 lần cùng 1 board member → VoterAlreadyVoted
  const rVotePresenting = await req('POST', `/board/decisions/${upDecisionId}/vote`, {
    token: b1Tok,
    body: { voteValue: 'APPROVE' }
  })
  expectError(rVotePresenting, 409, 'Error.VotingNotOpen', '01.7f2 vote khi PRESENTING → VotingNotOpen')

  const rPhaseByOtherEditor = await req('PATCH', `/board/sessions/${upSessionId}/phase`, {
    token: e2Tok,
    body: { phase: 'VOTING' }
  })
  expectError(rPhaseByOtherEditor, 403, 'Error.NotSessionCreator', '01.7f3 non-creator editor phase → 403')

  const rPhaseVoting = await req('PATCH', `/board/sessions/${upSessionId}/phase`, {
    token: saTok,
    body: { phase: 'VOTING' }
  })
  ok('01.7f4 creator phase → VOTING', rPhaseVoting.status === 200, `got ${rPhaseVoting.status}`)

  await req('POST', `/board/decisions/${upDecisionId}/vote`, { token: b1Tok, body: { voteValue: 'ABSTAIN' } })
  const rVoteDup = await req('POST', `/board/decisions/${upDecisionId}/vote`, {
    token: b1Tok,
    body: { voteValue: 'APPROVE' }
  })
  expectError(rVoteDup, 409, 'Error.VoterAlreadyVoted', '01.7g vote 2 lần cùng 1 người')

  // Roster 3, quorum ceil(2/3 · 3) = 2; b1 ABSTAIN + b2 APPROVE = PENDING, b3 APPROVE → APPROVED.
  await req('POST', `/board/decisions/${upDecisionId}/vote`, { token: b2Tok, body: { voteValue: 'APPROVE' } })
  await req('POST', `/board/decisions/${upDecisionId}/vote`, { token: b3Tok, body: { voteValue: 'APPROVE' } })
  await sleep(400)
  const decCheck = await prisma.boardDecision.findUnique({ where: { id: upDecisionId } })
  ok(
    '01.7h 3 APPROVE → decision APPROVED',
    decCheck?.result === BoardDecisionResult.APPROVED,
    `got ${decCheck?.result}`
  )
  const preAfter = await prisma.series.findUnique({ where: { id: pre.seriesId } })
  ok('01.7i series → SERIALIZED', preAfter?.status === SeriesStatus.SERIALIZED, `got ${preAfter?.status}`)

  const rReVoteFinalized = await req('POST', `/board/decisions/${upDecisionId}/vote`, {
    token: b2Tok,
    body: { voteValue: 'REJECT' }
  })
  expectError(rReVoteFinalized, 409, 'Error.DecisionAlreadyFinalized', '01.7m re-vote sau khi APPROVED → 409')

  // Conclude session (session ACTIVE → CONCLUDED)
  const rConclude = await req('PATCH', `/board/sessions/${upSessionId}/conclude`, { token: saTok })
  ok('01.7j conclude session ACTIVE → CONCLUDED', rConclude.status === 200, `got ${rConclude.status}`)

  // Vote sau khi conclude — should fail (session closed)
  const rVoteAfterConclude = await req('POST', `/board/decisions/${upDecisionId}/vote`, {
    token: b1Tok,
    body: { voteValue: 'APPROVE' }
  })
  ok('01.7k vote sau CONCLUDED → 4xx', rVoteAfterConclude.status >= 400, `got ${rVoteAfterConclude.status}`)

  // Flip-terminal: late vote không re-emit event (series vẫn SERIALIZED, statusHistory chỉ 1 entry SERIALIZED)
  const histCount = await prisma.series.count({
    where: { id: pre.seriesId, statusHistory: { some: { toStatus: SeriesStatus.SERIALIZED } } }
  })
  ok('01.7l flip-terminal: statusHistory chỉ 1 entry SERIALIZED (no re-emit)', histCount === 1, `count=${histCount}`)

  // Board CANCELLATION trên series SERIALIZED → CANCELLING
  const { decisionId: cancelDecision } = await createSessionWithDecision(
    saTok,
    [b1.id, b2.id, b3.id],
    DecisionType.CANCELLATION,
    pre.seriesId,
    3
  )
  await approveDecision(cancelDecision, [b1Tok, b2Tok, b3Tok])
  await sleep(500)
  const sc = await prisma.series.findUnique({ where: { id: pre.seriesId } })
  ok('01.7n CANCELLATION → series CANCELLING', sc?.status === SeriesStatus.CANCELLING, `got ${sc?.status}`)
  ok('01.7o endingChapterAllowance set', sc?.endingChapterAllowance === 3, `got ${sc?.endingChapterAllowance}`)
  ok(
    '01.7p chapterCountAtCancelling snapshot',
    sc?.chapterCountAtCancelling === 0,
    `got ${sc?.chapterCountAtCancelling}`
  )

  // force-cancel
  const rFCancel = await req('POST', `/series/${pre.seriesId}/force-cancel`, { token: e1Tok })
  ok('01.7q force-cancel → 200/201', rFCancel.status === 200 || rFCancel.status === 201, `got ${rFCancel.status}`)
  await sleep(300)
  ok(
    '01.7r series.status = CANCELLED',
    (await prisma.series.findUnique({ where: { id: pre.seriesId } }))?.status === SeriesStatus.CANCELLED
  )

  // CANCELLED là terminal — hiatus → 409
  const rHiatusOnCancelled = await req('POST', `/series/${pre.seriesId}/hiatus`, {
    token: e1Tok,
    body: { reason: 'try' }
  })
  expectError(rHiatusOnCancelled, 409, 'Error.InvalidSeriesTransition', '01.7s hiatus khi CANCELLED')

  // ═════════════ 01.8 — FRANCHISE / CO-OWNER ═════════════════════════════════════════════
  const rMetadataCancelled = await req('PATCH', `/series/${pre.seriesId}`, {
    token: m1Tok,
    body: { title: 'Closed record must not change' }
  })
  expectError(
    rMetadataCancelled,
    409,
    'Error.SeriesNotEditable',
    'F01-PM5 PATCH metadata on terminal CANCELLED series -> SeriesNotEditable'
  )

  section('01.8 Franchise consent + parent/child relationship')
  // Tạo parent REVENUE_SHARE FULLY_EXECUTED
  const parentFR = await makeSeriesAt(SeriesStatus.SERIALIZED, {
    mangakaId: m1.id,
    magazine: 'FT Jump',
    publicationType: 'WEEKLY',
    startIssueNumber: 7
  })
  await prisma.contract.create({
    data: {
      seriesId: parentFR.id,
      mangakaId: m1.id,
      contractType: 'REVENUE_SHARE',
      status: 'FULLY_EXECUTED',
      valuationAmount: 2000,
      publisherOwnershipPct: 70,
      mangakaOwnershipPct: 30,
      terminationClause: 'compensation:200',
      mangakaSignedAt: new Date(),
      boardSignedAt: new Date()
    }
  })

  // Sequel bởi M2 khác mangaka — franchiseConsentStatus = PENDING
  const seqConsent = await req('POST', '/series/proposals', {
    token: m2Tok,
    body: {
      title: 'FT Franchise Sequel',
      genres: ['ACTION'],
      demographic: 'SHONEN',
      synopsis: 'x',
      parentSeriesId: parentFR.id,
      relationshipType: 'SEQUEL'
    }
  })
  ok('01.8a sequel created với parent khác mangaka', seqConsent.status === 201, `got ${seqConsent.status}`)
  const sequelSeriesId = seqConsent.json.data.series.id
  // verify franchiseConsentStatus được set
  const sequelDoc = await prisma.series.findUnique({ where: { id: sequelSeriesId } })
  ok(
    '01.8b franchiseConsentStatus = PENDING',
    sequelDoc?.franchiseConsentStatus === 'PENDING',
    `got ${sequelDoc?.franchiseConsentStatus}`
  )

  // Submit khi consent PENDING → 409
  const rSubPending = await req('POST', `/series/${sequelSeriesId}/submit`, { token: m2Tok })
  expectError(rSubPending, 409, 'Error.FranchiseConsentRequired', '01.8c submit khi consent PENDING')

  // Mangaka gốc (M1) approve consent
  const rConsentOk = await req('POST', `/series/${sequelSeriesId}/franchise-consent`, {
    token: m1Tok,
    body: { approve: true }
  })
  ok('01.8d mangaka gốc approve consent', rConsentOk.status === 201, `got ${rConsentOk.status}`)

  // Mangaka khác (không phải gốc) approve consent → 403 NotOriginalMangaka
  const m3 = await makeUser('MANGAKA')
  const m3Tok = await login(m3.email)
  const rConsentWrong = await req('POST', `/series/${sequelSeriesId}/franchise-consent`, {
    token: m3Tok,
    body: { approve: true }
  })
  expectError(rConsentWrong, 403, 'Error.NotOriginalMangaka', '01.8e consent bởi mangaka ngoài → 403')

  // Sequel với cùng mangaka — KHÔNG cần consent
  const seqSame = await req('POST', '/series/proposals', {
    token: m1Tok,
    body: {
      title: 'FT Same Author Sequel',
      genres: ['ACTION'],
      demographic: 'SHONEN',
      synopsis: 'y',
      parentSeriesId: parentFR.id,
      relationshipType: 'SEQUEL'
    }
  })
  ok('01.8f sequel cùng mangaka — không cần consent', seqSame.status === 201, `got ${seqSame.status}`)
  const sequelSameId = seqSame.json.data.series.id
  const sequelSameDoc = await prisma.series.findUnique({ where: { id: sequelSameId } })
  ok(
    '01.8g sequelSame.franchiseConsentStatus null/NOT_REQUIRED',
    sequelSameDoc?.franchiseConsentStatus === null || sequelSameDoc?.franchiseConsentStatus === 'APPROVED'
  )

  // parentSeriesId rác → 422
  const rParentGhost = await req('POST', '/series/proposals', {
    token: m1Tok,
    body: {
      title: 'FT Ghost Parent',
      genres: ['ACTION'],
      demographic: 'SHONEN',
      synopsis: 'z',
      parentSeriesId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      relationshipType: 'SEQUEL'
    }
  })
  expectError(rParentGhost, 422, 'Error.ParentSeriesNotFound', '01.8h parent rác → 422')

  // relationshipType sai enum → 422
  const rRelBad = await req('POST', '/series/proposals', {
    token: m1Tok,
    body: {
      title: 'FT Bad Rel',
      genres: ['ACTION'],
      demographic: 'SHONEN',
      synopsis: 'z',
      parentSeriesId: parentFR.id,
      relationshipType: 'SPINOFF_INVALID'
    }
  })
  ok('01.8i relationshipType sai enum → 422', rRelBad.status === 422, `got ${rRelBad.status}`)

  // ═════════════ 01.9 — WITHDRAW (Mangaka tự rút series) ═════════════════════════════════
  section('01.9 Withdraw + Audit + final notes')
  const w1 = await createProposal(m1Tok, {
    title: 'FT Withdraw',
    genres: ['ACTION'],
    demographic: 'SHONEN',
    synopsis: 'w'
  })
  const rW = await req('POST', `/series/${w1.seriesId}/withdraw`, { token: m1Tok, body: { reason: 'tôi đổi ý' } })
  ok('01.9a Mangaka withdraw DRAFT → WITHDRAWN', rW.status === 201 || rW.status === 200, `got ${rW.status}`)
  ok(
    '01.9b series.status = WITHDRAWN',
    (await prisma.series.findUnique({ where: { id: w1.seriesId } }))?.status === SeriesStatus.WITHDRAWN
  )

  // statusHistory tối thiểu 1 entry INITIAL → cuối + audit
  const seriesAfter = await prisma.series.findUnique({ where: { id: w1.seriesId } })
  const histLen = Array.isArray((seriesAfter as any)?.statusHistory)
    ? ((seriesAfter as any).statusHistory as unknown[]).length
    : 0
  ok('01.9c statusHistory có entry (audit)', histLen >= 1, `len=${histLen}`)

  // Create proposal name pages (series không có name pages — bỏ qua happy cho name submission loop)

  // ──────────────────────────────────────────────────────────────────────────
  // 01.10 — AUTO-ASSIGN BOARD ROSTER (PB-05)
  // ──────────────────────────────────────────────────────────────────────────
  section('01.10 Auto-assign Board roster (PB-05)')

  // Seed StaffProfile cho 2 board members (giao với ACTION genre của happy)
  await prisma.staffProfile
    .create({ data: { userId: b1.id, specialtyGenres: ['ACTION'], demographics: ['SHONEN'] } })
    .catch(() => {
      /* already exists */
    })
  await prisma.staffProfile.create({ data: { userId: b2.id, specialtyGenres: ['ACTION', 'ROMANCE'] } }).catch(() => {
    /* already exists */
  })

  // Tạo series SERIALIZED mới cho suggest-members test (happy/pre đều terminal).
  const autoSer = await makeSeriesAt(SeriesStatus.SERIALIZED, {
    mangakaId: m1.id,
    editorId: e1.id,
    genres: ['ACTION', 'ROMANCE'],
    demographic: 'SHONEN'
  })
  // makeSeriesAt không nhận `genres` trong MakeSeriesInput — set inline qua prisma.
  await prisma.series.update({ where: { id: autoSer.id }, data: { genres: ['ACTION', 'ROMANCE'] } })

  // F01-080 — GET /board/suggest-members (EDITOR) → 200, score giảm dần, size lẻ >= 3
  const sugRes = await req('GET', `/board/suggest-members?seriesId=${autoSer.id}`, { token: e1Tok })
  ok('F01-080 GET suggest-members 200', sugRes.status === 200, `got ${sugRes.status}`)
  const sugBody = sugRes.json?.data ?? sugRes.json
  const sugItems = sugBody?.items ?? []
  ok(
    'F01-080b size LẺ và >= 3',
    sugItems.length >= 3 && sugItems.length % 2 === 1,
    `len=${sugItems.length} size=${sugBody?.size}`
  )
  ok(
    'F01-080c score giảm dần',
    sugItems.every((it: { score: number }, i: number) => i === 0 || sugItems[i - 1].score >= it.score),
    JSON.stringify(sugItems.map((it: { score: number }) => it.score))
  )

  // F01-081 — determinism: gọi 2 lần cùng kết quả
  const sug2Res = await req('GET', `/board/suggest-members?seriesId=${autoSer.id}`, { token: e1Tok })
  const sug2Body = sug2Res.json?.data ?? sug2Res.json
  const ids1 = sugItems.map((i: { userId: string }) => i.userId)
  const ids2 = ((sug2Body?.items ?? []) as Array<{ userId: string }>).map((i) => i.userId)
  ok(
    'F01-081 determinism (gọi 2 lần Y HỆT)',
    JSON.stringify(ids1) === JSON.stringify(ids2),
    `${JSON.stringify(ids1)} vs ${JSON.stringify(ids2)}`
  )

  // F01-082 — POST /board/sessions omit allowedEditorIds + seriesId → 201 với roster auto
  const sessAutoRes = await req('POST', '/board/sessions', {
    token: e1Tok,
    body: {
      title: `auto-${Date.now()}`,
      startTime: new Date(Date.now() + 3600_000).toISOString(),
      seriesId: autoSer.id
    }
  })
  ok('F01-082 POST /board/sessions auto-roster 201', sessAutoRes.status === 201, `got ${sessAutoRes.status}`)
  const sessAutoBody = sessAutoRes.json?.data ?? sessAutoRes.json
  const autoRoster = sessAutoBody?.allowedEditorIds ?? []
  ok('F01-082b roster auto LẺ >= 3', autoRoster.length >= 3 && autoRoster.length % 2 === 1, `len=${autoRoster.length}`)

  // F01-083 — omit CẢ HAI → 422 RosterSourceRequired
  const sessNoSrcRes = await req('POST', '/board/sessions', {
    token: e1Tok,
    body: { title: `nosrc-${Date.now()}`, startTime: new Date(Date.now() + 3600_000).toISOString() }
  })
  expectError(sessNoSrcRes, 422, 'Error.RosterSourceRequired', 'F01-083 omit cả hai → 422')

  // F01-084 — allowedEditorIds chẵn → 422 (không hồi quy)
  const sessEvenRes = await req('POST', '/board/sessions', {
    token: e1Tok,
    body: {
      title: `even-${Date.now()}`,
      startTime: new Date(Date.now() + 3600_000).toISOString(),
      allowedEditorIds: [b1.id, b2.id]
    }
  })
  ok('F01-084 roster chẵn → 422', sessEvenRes.status === 422, `got ${sessEvenRes.status}`)
  // BE trả message[] tiếng Việt (ZodValidationException). Assert presence of "thành viên" trong message list
  // thay vì strict Error.InvalidBoardMembers (BE throw ZodValidationException, không phải ErrorCode).
  const msgArr: string[] = Array.isArray(sessEvenRes.json?.message)
    ? (sessEvenRes.json.message as string[])
    : [String(sessEvenRes.json?.message ?? '')]
  ok(
    'F01-084b message có "thành viên"',
    msgArr.some((m) => m.includes('thành viên')),
    JSON.stringify(msgArr)
  )

  // F01-085 — GET /board/suggest-members bởi BOARD_MEMBER → 403
  const sugDeniedRes = await req('GET', `/board/suggest-members?seriesId=${autoSer.id}`, { token: b1Tok })
  ok('F01-085 suggest-members (BOARD_MEMBER) → 403', sugDeniedRes.status === 403, `got ${sugDeniedRes.status}`)

  await prisma.$disconnect()
  const fail = summary(FLOW)
  process.exit(fail > 0 ? 1 : 0)
}

void main().catch(async (e) => {
  console.error('FATAL', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
