import {
  wipeDb,
  seedRolesAndAdmin,
  prisma,
  makeUser,
  makeSeriesAt,
  makeChapterAt,
  makeDeadlineRequest
} from './lib/seed.js'
import { req, ok, section, summary, expectError, resetCounters, sleep } from './lib/http.js'
import { login } from './lib/auth.js'
import { SeriesStatus, DeadlineRequestStatus, ManuscriptStatus } from '@prisma/client'

const FLOW = 'flow-10-deadline'

// Grace hours = 48. Request phải trong vòng 48h thì affectsSlot=false.
const NEAR_DEADLINE = 24 * 60 * 60 * 1000 // 24h ahead → affectsSlot=false (trong grace 48h)

const main = async () => {
  resetCounters()
  console.log(`\n##### ${FLOW} #####`)
  await wipeDb()
  await seedRolesAndAdmin()

  const m1 = await makeUser('MANGAKA')
  const e1 = await makeUser('EDITOR')
  const b1 = await makeUser('BOARD_MEMBER')
  const mTok = await login(m1.email)
  const eTok = await login(e1.email)
  const bTok = await login(b1.email)

  // Setup: schedule có currentDeadline NOW + NEAR_DEADLINE (24h từ now → ảnh hưởng 24h ahead = false)
  const series = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m1.id, editorId: e1.id })
  const now = Date.now()

  // Chapter 1 — DRAFT manuscript
  const ch1 = await makeChapterAt({
    seriesId: series.id,
    chapterNumber: 1,
    manuscriptStatus: ManuscriptStatus.DRAFT
  })
  // Cập nhật schedule.currentDeadline = now + NEAR_DEADLINE để request +24h ahead → affectsSlot=false
  await prisma.schedule.updateMany({
    where: { chapterId: ch1.id },
    data: { currentDeadline: new Date(now + NEAR_DEADLINE), originalDeadline: new Date(now + NEAR_DEADLINE) }
  })

  section('DL1 Create deadline request — mangaka')
  // Schema CHỈ chấp nhận: chapterId, requestedDeadline, reason (strict mode)
  const r1 = await req('POST', '/deadline-requests', {
    token: mTok,
    body: {
      chapterId: ch1.id,
      requestedDeadline: new Date(now + NEAR_DEADLINE).toISOString(), // 24h ahead → affectsSlot=false
      reason: 'need extra week'
    }
  })
  ok('DL1.1 create 201', r1.status === 201, `got ${r1.status} ${r1.raw.slice(0, 200)}`)
  const dr = (r1.json?.data ?? r1.json) as {
    id: string
    status: DeadlineRequestStatus
    affectsSlot: boolean
    lastProposedBy: string
  }
  ok('DL1.1b status=PROPOSED', dr?.status === DeadlineRequestStatus.PROPOSED)
  ok('DL1.1c affectsSlot=false (within grace)', dr?.affectsSlot === false)
  ok('DL1.1d lastProposedBy=MANGAKA', dr?.lastProposedBy === 'MANGAKA')
  const r1Detail = await req('GET', `/deadline-requests/${dr.id}`, { token: mTok })
  ok(
    'F10-EMB deadline detail embeds chapter context',
    r1Detail.status === 200 && r1Detail.json?.data?.chapter?.chapterNumber === 1,
    `got ${r1Detail.status} ${r1Detail.raw.slice(0, 200)}`
  )

  section('DL2 Counter-propose flow')
  // Counter schema: requestedDeadline + reason (strict)
  // E là counterparty của dr → OK
  const r2 = await req('POST', `/deadline-requests/${dr.id}/counter`, {
    token: eTok,
    body: {
      requestedDeadline: new Date(now + NEAR_DEADLINE + 1 * 3600_000).toISOString(),
      reason: 'editor counter'
    }
  })
  ok('DL2.1 counter 201', r2.status === 201, `got ${r2.status} ${r2.raw.slice(0, 200)}`)
  const dr2 = await prisma.deadlineRequest.findUnique({ where: { id: dr.id } })
  ok('DL2.1b status=COUNTER_PROPOSED', dr2?.status === DeadlineRequestStatus.COUNTER_PROPOSED, `got ${dr2?.status}`)
  ok('DL2.1c lastProposedBy=EDITOR', dr2?.lastProposedBy === 'EDITOR')

  section('DL3 M agree → AGREED_BY_PARTIES (M là counterparty)')
  // Sau DL2: lastProposedBy=EDITOR. Vậy M là counterparty → M agree OK
  const r3 = await req('POST', `/deadline-requests/${dr.id}/agree`, { token: mTok })
  ok('DL3.1 mangaka agree 201', r3.status === 201, `got ${r3.status} ${r3.raw.slice(0, 200)}`)
  const dr3 = await prisma.deadlineRequest.findUnique({ where: { id: dr.id } })
  ok('DL3.1b status=AGREED_BY_PARTIES', dr3?.status === DeadlineRequestStatus.AGREED_BY_PARTIES, `got ${dr3?.status}`)

  section('DL4 Editor finalize → APPROVED (affectsSlot=false → no BOARD_REVIEW)')
  // Editor finalize sau AGREED_BY_PARTIES với affectsSlot=false → APPROVED
  const r4 = await req('POST', `/deadline-requests/${dr.id}/finalize`, { token: eTok })
  ok('DL4.1 finalize 201', r4.status === 201, `got ${r4.status}`)
  const dr4 = await prisma.deadlineRequest.findUnique({ where: { id: dr.id } })
  ok('DL4.1b status=APPROVED', dr4?.status === DeadlineRequestStatus.APPROVED, `got ${dr4?.status}`)

  section('DL5 AffectsSlot=true → finalize → BOARD_REVIEW')
  // Tạo chapter mới + set schedule deadline xa → request xa hơn → affectsSlot=true
  const ch2 = await makeChapterAt({ seriesId: series.id, chapterNumber: 2, manuscriptStatus: ManuscriptStatus.DRAFT })
  await prisma.schedule.updateMany({
    where: { chapterId: ch2.id },
    data: { currentDeadline: new Date(now + NEAR_DEADLINE), originalDeadline: new Date(now + NEAR_DEADLINE) }
  })
  const r5a = await req('POST', '/deadline-requests', {
    token: mTok,
    body: {
      chapterId: ch2.id,
      requestedDeadline: new Date(now + 30 * 86_400_000).toISOString(), // 30 ngày → vượt grace 48h
      reason: 'big extension'
    }
  })
  ok('DL5.1 create 201', r5a.status === 201, `got ${r5a.status}`)
  const dr5 = (r5a.json?.data ?? r5a.json) as { id: string; affectsSlot: boolean }
  ok('DL5.1b affectsSlot=true', dr5?.affectsSlot === true)
  // E counter → COUNTER_PROPOSED
  await sleep(200)
  await req('POST', `/deadline-requests/${dr5.id}/counter`, {
    token: eTok,
    body: { requestedDeadline: new Date(now + 10 * 86_400_000).toISOString(), reason: 'less' }
  })
  // M agree
  await sleep(200)
  await req('POST', `/deadline-requests/${dr5.id}/agree`, { token: mTok })
  // Editor finalize → BOARD_REVIEW (vì affectsSlot=true)
  const r5b = await req('POST', `/deadline-requests/${dr5.id}/finalize`, { token: eTok })
  ok('DL5.2 finalize 201', r5b.status === 201, `got ${r5b.status}`)
  const dr5b = await prisma.deadlineRequest.findUnique({ where: { id: dr5.id } })
  ok('DL5.2b status=BOARD_REVIEW', dr5b?.status === DeadlineRequestStatus.BOARD_REVIEW, `got ${dr5b?.status}`)

  section('DL6 Board APPROVE BOARD_REVIEW → APPROVED')
  const r6 = await req('POST', `/deadline-requests/${dr5.id}/board-resolve`, {
    token: bTok,
    body: { decision: 'APPROVE' }
  })
  ok('DL6.1 board approve 201', r6.status === 201, `got ${r6.status}`)
  const dr6 = await prisma.deadlineRequest.findUnique({ where: { id: dr5.id } })
  ok('DL6.1b status=APPROVED', dr6?.status === DeadlineRequestStatus.APPROVED, `got ${dr6?.status}`)

  section('DL7 Open deadline guard — chỉ 1 open tại 1 chapter')
  const ch3 = await makeChapterAt({ seriesId: series.id, chapterNumber: 3, manuscriptStatus: ManuscriptStatus.DRAFT })
  await prisma.schedule.updateMany({
    where: { chapterId: ch3.id },
    data: { currentDeadline: new Date(now + NEAR_DEADLINE), originalDeadline: new Date(now + NEAR_DEADLINE) }
  })
  const r7a = await req('POST', '/deadline-requests', {
    token: mTok,
    body: { chapterId: ch3.id, requestedDeadline: new Date(now + NEAR_DEADLINE).toISOString(), reason: 'first' }
  })
  ok('DL7.1 first create 201', r7a.status === 201, `got ${r7a.status}`)
  await sleep(200)
  const r7b = await req('POST', '/deadline-requests', {
    token: mTok,
    body: { chapterId: ch3.id, requestedDeadline: new Date(now + NEAR_DEADLINE).toISOString(), reason: 'second' }
  })
  expectError(r7b, 409, 'Error.OpenDeadlineRequestExists', 'DL7.2 open guard')

  section('DL8 Withdraw by requester (PROPOSED → REJECTED)')
  const dr7id = (r7a.json?.data ?? r7a.json)?.id
  const r8 = await req('POST', `/deadline-requests/${dr7id}/withdraw`, { token: mTok })
  ok('DL8.1 withdraw 201', r8.status === 201, `got ${r8.status} ${r8.raw.slice(0, 200)}`)

  section('DL9 RBAC — wrong editor counter → NotCounterparty / AccessDenied')
  const ch4 = await makeChapterAt({ seriesId: series.id, chapterNumber: 4, manuscriptStatus: ManuscriptStatus.DRAFT })
  await prisma.schedule.updateMany({
    where: { chapterId: ch4.id },
    data: { currentDeadline: new Date(now + NEAR_DEADLINE), originalDeadline: new Date(now + NEAR_DEADLINE) }
  })
  const e2 = await makeUser('EDITOR')
  const e2Tok = await login(e2.email)
  const r9a = await req('POST', '/deadline-requests', {
    token: mTok,
    body: { chapterId: ch4.id, requestedDeadline: new Date(now + NEAR_DEADLINE).toISOString(), reason: 'rbac test' }
  })
  ok('DL9.0 setup request 201', r9a.status === 201, `got ${r9a.status}`)
  const dr9id = (r9a.json?.data ?? r9a.json)?.id
  await sleep(200)
  // E2 không phải assigned editor của series → access denied (resolveSide trả null)
  const r9 = await req('POST', `/deadline-requests/${dr9id}/counter`, {
    token: e2Tok,
    body: { requestedDeadline: new Date(now + NEAR_DEADLINE).toISOString(), reason: 'wrong' }
  })
  ok('DL9.1 wrong editor counter → 403', r9.status === 403 || r9.status === 404, `got ${r9.status}`)

  section('DL10 Counterparty validation')
  // Sau DL9.0: dr9 có lastProposedBy=MANGAKA. E (e1) là counterparty → OK
  await sleep(200)
  const r10a = await req('POST', `/deadline-requests/${dr9id}/counter`, {
    token: eTok,
    body: { requestedDeadline: new Date(now + NEAR_DEADLINE + 1 * 3600_000).toISOString(), reason: 'counter' }
  })
  ok('DL10.1 valid counter 201', r10a.status === 201, `got ${r10a.status}`)
  // Sau DL10.1: lastProposedBy=EDITOR. E (eTok) cùng side → 409 NotCounterparty
  await sleep(200)
  const r10b = await req('POST', `/deadline-requests/${dr9id}/counter`, {
    token: eTok,
    body: { requestedDeadline: new Date(now + NEAR_DEADLINE + 2 * 3600_000).toISOString(), reason: 'double counter' }
  })
  expectError(r10b, 403, 'Error.NotCounterparty', 'DL10.2 same side counter')

  section('DL11 Invalid transition — counter on APPROVED')
  // dr (DL1-4) đã APPROVED. lastProposedBy vẫn = EDITOR (từ DL2 counter).
  // mTok side=MANGAKA → khác EDITOR → counterparty OK → state machine throw InvalidDeadlineRequestTransition
  const r11 = await req('POST', `/deadline-requests/${dr.id}/counter`, {
    token: mTok,
    body: { requestedDeadline: new Date(now + NEAR_DEADLINE).toISOString(), reason: 'should fail' }
  })
  expectError(r11, 409, 'Error.InvalidDeadlineRequestTransition', 'DL11.1 counter on APPROVED')

  section('DL12 Not found — counter trên id rác')
  const r12 = await req('POST', '/deadline-requests/aaaaaaaaaaaaaaaaaaaaaaaa/counter', {
    token: eTok,
    body: { requestedDeadline: new Date(now + NEAR_DEADLINE).toISOString(), reason: 'not found' }
  })
  ok('DL12.1 NotFound', r12.status === 404, `got ${r12.status}`)

  section('DL13 Board REJECT path')
  const ch5 = await makeChapterAt({ seriesId: series.id, chapterNumber: 5, manuscriptStatus: ManuscriptStatus.DRAFT })
  await prisma.schedule.updateMany({
    where: { chapterId: ch5.id },
    data: { currentDeadline: new Date(now + NEAR_DEADLINE), originalDeadline: new Date(now + NEAR_DEADLINE) }
  })
  const sched5 = await prisma.schedule.findFirst({ where: { chapterId: ch5.id } })
  const dr13 = await makeDeadlineRequest({
    scheduleId: sched5!.id,
    chapterId: ch5.id,
    seriesId: series.id,
    requestedBy: 'MANGAKA',
    currentDeadline: new Date(now + NEAR_DEADLINE),
    requestedDeadline: new Date(now + 60 * 86_400_000),
    affectsSlot: true,
    status: DeadlineRequestStatus.BOARD_REVIEW,
    statusHistoryBy: m1.id
  })
  const r13 = await req('POST', `/deadline-requests/${dr13.id}/board-resolve`, {
    token: bTok,
    body: { decision: 'REJECT', note: 'too long' }
  })
  ok('DL13.1 board reject 201', r13.status === 201, `got ${r13.status}`)
  const dr13b = await prisma.deadlineRequest.findUnique({ where: { id: dr13.id } })
  ok('DL13.1b status=REJECTED', dr13b?.status === DeadlineRequestStatus.REJECTED, `got ${dr13b?.status}`)

  section('DL14 StatusHistory đủ entry')
  const dr14 = await prisma.deadlineRequest.findUnique({ where: { id: dr.id } })
  const histLen = (dr14?.statusHistory ?? []).length
  ok('DL14.1 statusHistory >= 3 (created + counter + agree + finalize)', histLen >= 3, `got ${histLen}`)

  await prisma.$disconnect()
  const fail = summary(FLOW)
  process.exit(fail > 0 ? 1 : 0)
}

void main().catch(async (e) => {
  console.error('FATAL', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
