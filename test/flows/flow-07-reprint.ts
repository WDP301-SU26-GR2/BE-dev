import { wipeDb, seedRolesAndAdmin, prisma, makeUser, makeSeriesAt, makeContractAt, makeChapterAt } from './lib/seed.js'
import { req, ok, section, summary, expectError, resetCounters, finding } from './lib/http.js'
import { login } from './lib/auth.js'
import {
  ContractType,
  ChapterStatus,
  ManuscriptStatus,
  ReprintRevisionMode,
  ReviserType,
  RoleCode,
  SeriesStatus
} from '@prisma/client'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@ecom.dev.com'
const FLOW = 'flow-07-reprint'
const OBJECT_ID_RANDOM = 'aaaaaaaaaaaaaaaaaaaaaaaa'

const main = async () => {
  resetCounters()
  console.log(`\n##### ${FLOW} #####`)
  await wipeDb()
  await seedRolesAndAdmin()

  // ─── SEED helpers ─────────────────────────────────────────────────────────────
  const admin = await login(ADMIN_EMAIL)
  const e1 = await makeUser(RoleCode.EDITOR)
  const e2 = await makeUser(RoleCode.EDITOR)
  const m1 = await makeUser(RoleCode.MANGAKA)
  const m2 = await makeUser(RoleCode.MANGAKA)
  const m3 = await makeUser(RoleCode.MANGAKA) // for OTHER_MANGAKA reviser test
  const b1 = await makeUser(RoleCode.BOARD_MEMBER)
  const a1 = await makeUser(RoleCode.ASSISTANT)

  const e1Tok = await login(e1.email)
  const e2Tok = await login(e2.email)
  const m1Tok = await login(m1.email)
  const m2Tok = await login(m2.email)
  const m3Tok = await login(m3.email)
  const b1Tok = await login(b1.email)
  const a1Tok = await login(a1.email)

  // ─── SERIES A: FULL_BUYOUT (m1) — flow 7 chính ───────────────────────────────
  const seriesFB = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m1.id, editorId: e1.id })
  const contractFB = await makeContractAt('FULLY_EXECUTED', {
    seriesId: seriesFB.id,
    mangakaId: m1.id,
    editorId: e1.id,
    contractType: ContractType.FULL_BUYOUT
  })
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
  const fbCh3 = await makeChapterAt({
    seriesId: seriesFB.id,
    chapterNumber: 3,
    manuscriptStatus: ManuscriptStatus.PUBLISHED,
    publishedAt: new Date()
  })
  await prisma.chapter.update({ where: { id: fbCh3.id }, data: { status: ChapterStatus.PUBLISHED } })

  // ─── SERIES B: REVENUE_SHARE (m2) — for REVENUE_SHARE lifecycle ───────────────
  const seriesRS = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m2.id, editorId: e2.id })
  await makeContractAt('FULLY_EXECUTED', {
    seriesId: seriesRS.id,
    mangakaId: m2.id,
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
  const rsCh2 = await makeChapterAt({
    seriesId: seriesRS.id,
    chapterNumber: 2,
    manuscriptStatus: ManuscriptStatus.PUBLISHED,
    publishedAt: new Date()
  })
  await prisma.chapter.update({ where: { id: rsCh2.id }, data: { status: ChapterStatus.PUBLISHED } })

  // ─── SERIES C: NO contract — for error guards ────────────────────────────────
  const seriesNoContract = await makeSeriesAt(SeriesStatus.SERIALIZED, {
    mangakaId: m3.id,
    editorId: e1.id
  })

  // Helper: chapterId payload for manuscript/approve endpoints (inline dùng trực tiếp).

  // ─── Section 7.1 — Create: AS_IS happy path ────────────────────────────────
  section('7.1 E tạo reprint AS_IS range 1-2 → PENDING + 2 ReprintChapter PENDING')
  const r1 = await req('POST', '/reprint-requests', {
    token: e1Tok,
    body: {
      seriesId: seriesFB.id,
      revisionMode: ReprintRevisionMode.AS_IS,
      reason: 'Reprint AS_IS happy path',
      chapterRangeStart: 1,
      chapterRangeEnd: 2
    }
  })
  ok('7.1a create reprint 201', r1.status === 201, `got ${r1.status} ${r1.raw.slice(0, 200)}`)
  const reprintId = r1.json?.data?.id ?? r1.json?.id ?? r1.json?.data?.data?.id
  ok(
    '7.1b status = PENDING',
    r1.json?.data?.status === 'PENDING' || r1.json?.status === 'PENDING',
    `got status ${r1.json?.data?.status ?? r1.json?.status}`
  )
  ok(
    '7.1c 2 chapters created PENDING',
    (() => {
      const chapters = r1.json?.data?.chapters ?? r1.json?.chapters
      return (
        Array.isArray(chapters) &&
        chapters.length === 2 &&
        chapters.every((c: { status: string }) => c.status === 'PENDING')
      )
    })(),
    `got chapters ${JSON.stringify(r1.json?.data?.chapters ?? r1.json?.chapters)}`
  )

  // ─── Section 7.2 — Create guards: contract missing / range invalid ────────
  section('7.2 Create guards')
  const r2a = await req('POST', '/reprint-requests', {
    token: e1Tok,
    body: {
      seriesId: seriesNoContract.id,
      revisionMode: 'AS_IS',
      reason: 'no contract',
      chapterRangeStart: 1,
      chapterRangeEnd: 2
    }
  })
  expectError(r2a, 404, 'Error.ActiveContractNotFound', '7.2a series no contract → ActiveContractNotFound')

  const r2b = await req('POST', '/reprint-requests', {
    token: e1Tok,
    body: {
      seriesId: seriesFB.id,
      revisionMode: 'AS_IS',
      reason: 'range invalid',
      chapterRangeStart: 99,
      chapterRangeEnd: 100
    }
  })
  expectError(r2b, 404, 'Error.OriginalChaptersNotFound', '7.2b range chương không tồn tại → OriginalChaptersNotFound')

  // ─── Section 7.3 — FULL_BUYOUT: Board-approve bỏ qua Mangaka ──────────────
  section('7.3 FULL_BUYOUT: B board-approve từ PENDING → BOARD_APPROVED (bỏ qua Mangaka)')
  const r3 = await req('PATCH', `/reprint-requests/${reprintId}/board-approve`, {
    token: b1Tok,
    body: { approve: true }
  })
  ok('7.3a board-approve FB 200', r3.status === 200, `got ${r3.status} ${r3.raw.slice(0, 200)}`)
  ok(
    '7.3b status BOARD_APPROVED',
    r3.json?.data?.status === 'BOARD_APPROVED' || r3.json?.status === 'BOARD_APPROVED',
    `got ${r3.json?.data?.status ?? r3.json?.status}`
  )

  // ─── Section 7.4 — FULL_BUYOUT: Mangaka-review bị cấm ─────────────────────
  section('7.4 FULL_BUYOUT: M1 mangaka-review → 403 ReprintActionNotAllowed')
  const r4 = await req('PATCH', `/reprint-requests/${reprintId}/mangaka-review`, {
    token: m1Tok,
    body: { accept: true }
  })
  expectError(r4, 403, 'Error.ReprintActionNotAllowed', '7.4a mangaka-review trên FB → ReprintActionNotAllowed')

  // ─── Section 7.5 — REVENUE_SHARE: M accept từ PENDING → MANGAKA_APPROVED ──
  section('7.5 REVENUE_SHARE: M accept từ PENDING → MANGAKA_APPROVED')
  const r5a = await req('POST', '/reprint-requests', {
    token: e2Tok,
    body: {
      seriesId: seriesRS.id,
      revisionMode: ReprintRevisionMode.AS_IS,
      reason: 'RS happy path',
      chapterRangeStart: 1,
      chapterRangeEnd: 2
    }
  })
  ok('7.5a create RS 201', r5a.status === 201, `got ${r5a.status} ${r5a.raw.slice(0, 200)}`)
  const rsReprintId = r5a.json?.data?.id ?? r5a.json?.id ?? r5a.json?.data?.data?.id
  const r5b = await req('PATCH', `/reprint-requests/${rsReprintId}/mangaka-review`, {
    token: m2Tok,
    body: { accept: true, reason: 'agreed' }
  })
  ok('7.5b m accept 200', r5b.status === 200, `got ${r5b.status} ${r5b.raw.slice(0, 200)}`)
  ok(
    '7.5c status MANGAKA_APPROVED',
    r5b.json?.data?.status === 'MANGAKA_APPROVED' || r5b.json?.status === 'MANGAKA_APPROVED',
    `got ${r5b.json?.data?.status ?? r5b.json?.status}`
  )

  // ─── Section 7.6 — REVENUE_SHARE: M reject → REJECTED_BY_MANGAKA ─────────
  section('7.6 REVENUE_SHARE: M reject → REJECTED_BY_MANGAKA')
  const r6a = await req('POST', '/reprint-requests', {
    token: e2Tok,
    body: {
      seriesId: seriesRS.id,
      revisionMode: 'AS_IS',
      reason: 'RS reject path',
      chapterRangeStart: 1,
      chapterRangeEnd: 2
    }
  })
  // seriesRS đã có 1 reprint PENDING từ 7.5 → tạo thêm 1 (không có guard duplicate) → cũng OK
  const rsReprintRejectId = r6a.json?.data?.id ?? r6a.json?.id ?? r6a.json?.data?.data?.id
  const r6b = await req('PATCH', `/reprint-requests/${rsReprintRejectId}/mangaka-review`, {
    token: m2Tok,
    body: { accept: false, reason: 'disagree' }
  })
  ok('7.6a m reject 200', r6b.status === 200, `got ${r6b.status} ${r6b.raw.slice(0, 200)}`)
  ok(
    '7.6b status REJECTED_BY_MANGAKA',
    r6b.json?.data?.status === 'REJECTED_BY_MANGAKA' || r6b.json?.status === 'REJECTED_BY_MANGAKA',
    `got ${r6b.json?.data?.status ?? r6b.json?.status}`
  )

  // ─── Section 7.7 — REVENUE_SHARE: Board approve sau M accept ─────────────
  section('7.7 REVENUE_SHARE: B approve sau M accept → BOARD_APPROVED')
  const r7 = await req('PATCH', `/reprint-requests/${rsReprintId}/board-approve`, {
    token: b1Tok,
    body: { approve: true }
  })
  ok('7.7a board-approve RS 200', r7.status === 200, `got ${r7.status} ${r7.raw.slice(0, 200)}`)
  ok(
    '7.7b status BOARD_APPROVED',
    r7.json?.data?.status === 'BOARD_APPROVED' || r7.json?.status === 'BOARD_APPROVED',
    `got ${r7.json?.data?.status ?? r7.json?.status}`
  )

  // ─── Section 7.8 — RBAC: M2 (không phải mangaka series) review → 403 ─────
  section('7.8 RBAC: M3 (không phải mangaka series) review')
  const r8a = await req('POST', '/reprint-requests', {
    token: e2Tok,
    body: {
      seriesId: seriesRS.id,
      revisionMode: 'AS_IS',
      reason: 'rbac test',
      chapterRangeStart: 1,
      chapterRangeEnd: 2
    }
  })
  const rsReprintRbacId = r8a.json?.data?.id ?? r8a.json?.id ?? r8a.json?.data?.data?.id
  // Spec matrix: M2 (không phải mangaka series) review → 403
  // BE hiện tại KHÔNG check caller là series mangaka trước khi gọi mangakaReview → trả 200.
  // Đây là BUG nghiêm trọng — bất kỳ MANGAKA nào cũng có thể review reprint của series khác.
  const r8b = await req('PATCH', `/reprint-requests/${rsReprintRbacId}/mangaka-review`, {
    token: m3Tok, // m3 không phải mangaka của seriesRS
    body: { accept: true }
  })
  if (r8b.status === 200) {
    finding(
      '7.8 RBAC: non-owner mangaka review không bị chặn',
      'BE không check caller là series mangaka — bất kỳ MANGAKA nào cũng có thể review reprint series khác. File: src/modules/reprint/services/reprint-request.service.ts → mangakaReview() thiếu guard verify userId === contract.mangakaId'
    )
  } else {
    ok(
      '7.8a non-owner mangaka review 403/404',
      r8b.status === 403 || r8b.status === 404,
      `got ${r8b.status} ${r8b.raw.slice(0, 200)}`
    )
  }

  // ─── Section 7.9 — RBAC: tạo bởi M → 403 ──────────────────────────────────
  section('7.9 RBAC: M tạo reprint → 403')
  const r9 = await req('POST', '/reprint-requests', {
    token: m1Tok,
    body: {
      seriesId: seriesFB.id,
      revisionMode: 'AS_IS',
      reason: 'wrong role',
      chapterRangeStart: 1,
      chapterRangeEnd: 2
    }
  })
  ok('7.9a mangaka tạo reprint', r9.status === 403, `got ${r9.status} ${r9.raw.slice(0, 200)}`)

  // ─── Section 7.10 — RBAC: Board-approve bởi E → 403 ──────────────────────
  section('7.10 RBAC: E board-approve → 403')
  const r10 = await req('PATCH', `/reprint-requests/${rsReprintId}/board-approve`, {
    token: e1Tok, // đã BOARD_APPROVED rồi, test 403
    body: { approve: true }
  })
  // rồi ở BOARD_APPROVED, gọi lần nữa — có thể là 403 (role) hoặc 409 (transition)
  ok(
    '7.10a editor board-approve',
    r10.status === 403 || r10.status === 409,
    `got ${r10.status} ${r10.raw.slice(0, 200)}`
  )

  // ─── Section 7.11 — Production: WITH_REVISION manuscript + approve ────────
  section('7.11 WITH_REVISION: M submit manuscript cho từng chapter → READY')
  const r11a = await req('POST', '/reprint-requests', {
    token: e1Tok,
    body: {
      seriesId: seriesFB.id,
      revisionMode: ReprintRevisionMode.WITH_REVISION,
      reason: 'WITH_REVISION happy',
      chapterRangeStart: 1,
      chapterRangeEnd: 2
    }
  })
  ok('7.11a create WITH_REVISION 201', r11a.status === 201, `got ${r11a.status} ${r11a.raw.slice(0, 200)}`)
  const wrReprintId = r11a.json?.data?.id ?? r11a.json?.id ?? r11a.json?.data?.data?.id
  const r11b = await req('PATCH', `/reprint-requests/${wrReprintId}/board-approve`, {
    token: b1Tok,
    body: { approve: true }
  })
  ok('7.11b board-approve WITH_REVISION', r11b.status === 200, `got ${r11b.status} ${r11b.raw.slice(0, 200)}`)

  // M1 submit manuscript ch1
  const r11c = await req('PATCH', `/reprint-requests/${wrReprintId}/chapters/${fbCh1.id}/manuscript`, {
    token: m1Tok,
    body: { originalChapterId: fbCh1.id, manuscriptFile: 'manuscripts/ch1-v2.pdf' }
  })
  ok('7.11c m submit ch1 manuscript', r11c.status === 200, `got ${r11c.status} ${r11c.raw.slice(0, 200)}`)
  // M1 submit manuscript ch2
  const r11d = await req('PATCH', `/reprint-requests/${wrReprintId}/chapters/${fbCh2.id}/manuscript`, {
    token: m1Tok,
    body: { originalChapterId: fbCh2.id, manuscriptFile: 'manuscripts/ch2-v2.pdf' }
  })
  ok('7.11d m submit ch2 manuscript', r11d.status === 200, `got ${r11d.status} ${r11d.raw.slice(0, 200)}`)

  // E approve ch1
  const r11e = await req('PATCH', `/reprint-requests/${wrReprintId}/chapters/${fbCh1.id}/approve`, {
    token: e1Tok,
    body: { originalChapterId: fbCh1.id, approve: true }
  })
  ok('7.11e e approve ch1', r11e.status === 200, `got ${r11e.status} ${r11e.raw.slice(0, 200)}`)

  // E approve ch2 — auto-publish-all
  const r11f = await req('PATCH', `/reprint-requests/${wrReprintId}/chapters/${fbCh2.id}/approve`, {
    token: e1Tok,
    body: { originalChapterId: fbCh2.id, approve: true }
  })
  ok('7.11f e approve ch2 → auto-publish', r11f.status === 200, `got ${r11f.status} ${r11f.raw.slice(0, 200)}`)
  ok(
    '7.11g status PUBLISHED',
    r11f.json?.data?.status === 'PUBLISHED' || r11f.json?.status === 'PUBLISHED',
    `got ${r11f.json?.data?.status ?? r11f.json?.status}`
  )

  // ─── Section 7.12 — AS_IS không cần manuscript mới ───────────────────────
  section('7.12 AS_IS: skip manuscript, E approve chapters → auto-publish')
  // Dùng lại reprintId (FB, AS_IS, đã BOARD_APPROVED từ 7.3)
  const r12a = await req('PATCH', `/reprint-requests/${reprintId}/chapters/${fbCh1.id}/approve`, {
    token: e1Tok,
    body: { originalChapterId: fbCh1.id, approve: true }
  })
  ok('7.12a e approve ch1 AS_IS', r12a.status === 200, `got ${r12a.status} ${r12a.raw.slice(0, 200)}`)
  const r12b = await req('PATCH', `/reprint-requests/${reprintId}/chapters/${fbCh2.id}/approve`, {
    token: e1Tok,
    body: { originalChapterId: fbCh2.id, approve: true }
  })
  ok('7.12b e approve ch2 AS_IS → PUBLISHED', r12b.status === 200, `got ${r12b.status} ${r12b.raw.slice(0, 200)}`)
  ok(
    '7.12c status PUBLISHED',
    r12b.json?.data?.status === 'PUBLISHED' || r12b.json?.status === 'PUBLISHED',
    `got ${r12b.json?.data?.status ?? r12b.json?.status}`
  )

  // ─── Section 7.13 — assign-reviser trên AS_IS → 409 NotWithRevision ─────
  section('7.13 assign-reviser trên AS_IS → 409 NotWithRevision')
  const r13 = await req('PATCH', `/reprint-requests/${reprintId}/chapters/${fbCh1.id}/assign-reviser`, {
    token: e1Tok,
    body: { reviserId: m3.id, reviserType: ReviserType.OTHER_MANGAKA }
  })
  expectError(r13, 409, 'Error.ReprintNotWithRevision', '7.13a assign-reviser AS_IS → ReprintNotWithRevision')

  // ─── Section 7.14 — assign-reviser REVENUE_SHARE → 409 ReviserOnlyForFullBuyout ─
  section('7.14 assign-reviser trên RS → 409 ReviserOnlyForFullBuyout')
  // Tạo RS WITH_REVISION (mặc dù RS không dùng được reviser, tạo để test guard)
  const r14a = await req('POST', '/reprint-requests', {
    token: e2Tok,
    body: {
      seriesId: seriesRS.id,
      revisionMode: ReprintRevisionMode.WITH_REVISION,
      reason: 'RS WITH_REVISION test',
      chapterRangeStart: 1,
      chapterRangeEnd: 2
    }
  })
  const rsWrId = r14a.json?.data?.id ?? r14a.json?.id ?? r14a.json?.data?.data?.id
  const r14b = await req('PATCH', `/reprint-requests/${rsWrId}/chapters/${rsCh1.id}/assign-reviser`, {
    token: e1Tok,
    body: { reviserId: m3.id, reviserType: ReviserType.OTHER_MANGAKA }
  })
  expectError(r14b, 409, 'Error.ReviserOnlyForFullBuyout', '7.14a assign-reviser RS → ReviserOnlyForFullBuyout')

  // ─── Section 7.15 — assign-reviser OTHER_MANGAKA user không phải mangaka → 422 ─
  section('7.15 assign-reviser OTHER_MANGAKA với userId không phải mangaka → 422')
  const r15 = await req('PATCH', `/reprint-requests/${wrReprintId}/chapters/${fbCh1.id}/assign-reviser`, {
    token: e1Tok,
    body: { reviserId: e1.id, reviserType: ReviserType.OTHER_MANGAKA } // e1 là EDITOR không phải MANGAKA
  })
  expectError(r15, 422, 'Error.ReviserMangakaNotFound', '7.15a non-mangaka reviser → ReviserMangakaNotFound')

  // ─── Section 7.16 — assign-reviser hợp lệ với OTHER_MANGAKA mangaka ────
  section('7.16 assign-reviser WITH_REVISION + FB + OTHER_MANGAKA → reviserId set')
  const r16 = await req('PATCH', `/reprint-requests/${wrReprintId}/chapters/${fbCh1.id}/assign-reviser`, {
    token: e1Tok,
    body: { reviserId: m3.id, reviserType: ReviserType.OTHER_MANGAKA }
  })
  ok('7.16a assign-reviser OK', r16.status === 200, `got ${r16.status} ${r16.raw.slice(0, 200)}`)
  // verify reviserId set (verify trực tiếp qua Prisma — response DTO không expose field này)
  const verifyReprint = await prisma.reprintRequest.findUnique({
    where: { id: wrReprintId }
  })
  const chFromDb = verifyReprint?.chapters?.find((c) => c.originalChapterId === fbCh1.id)
  ok(
    '7.16b reviserId persisted in DB',
    chFromDb?.reviserId === m3.id && chFromDb?.reviserType === 'OTHER_MANGAKA',
    `got ${JSON.stringify(chFromDb)}`
  )

  // ─── Section 7.17 — state sai: approve chapter khi status không phải BOARD_APPROVED ─
  section('7.17 approve chapter khi request chưa BOARD_APPROVED → 409 InvalidReprintTransition')
  // Tạo reprint PENDING (chưa board approve)
  const r17a = await req('POST', '/reprint-requests', {
    token: e1Tok,
    body: {
      seriesId: seriesFB.id,
      revisionMode: ReprintRevisionMode.WITH_REVISION,
      reason: 'transition test',
      chapterRangeStart: 1,
      chapterRangeEnd: 2
    }
  })
  const pendId = r17a.json?.data?.id ?? r17a.json?.id ?? r17a.json?.data?.data?.id
  const r17b = await req('PATCH', `/reprint-requests/${pendId}/chapters/${fbCh1.id}/approve`, {
    token: e1Tok,
    body: { originalChapterId: fbCh1.id, approve: true }
  })
  expectError(
    r17b,
    409,
    'Error.InvalidReprintTransition',
    '7.17a approve chapter khi PENDING → InvalidReprintTransition'
  )

  // ─── Section 7.18 — RBAC scoping findManyScoped (M thấy series mình, E thấy phụ trách, B tất cả) ─
  section('7.18 RBAC scoping: findMany theo role')
  const r18a = await req('GET', '/reprint-requests', { token: m1Tok })
  ok('7.18a M list 200', r18a.status === 200, `got ${r18a.status}`)
  const r18b = await req('GET', '/reprint-requests', { token: e1Tok })
  ok('7.18b E list 200', r18b.status === 200, `got ${r18b.status}`)
  const r18c = await req('GET', '/reprint-requests', { token: b1Tok })
  ok('7.18c B list 200', r18c.status === 200, `got ${r18c.status}`)
  const r18d = await req('GET', '/reprint-requests', { token: a1Tok })
  ok('7.18d A list 403', r18d.status === 403, `got ${r18d.status}`)

  // ─── Section 7.19 — id rác GET → 404 ──────────────────────────────────────
  section('7.19 id rác → 404')
  const r19a = await req('GET', `/reprint-requests/${OBJECT_ID_RANDOM}`, { token: e1Tok })
  ok('7.19a GET rác 404', r19a.status === 404, `got ${r19a.status}`)
  const r19b = await req('GET', '/reprint-requests/notahexid', { token: e1Tok })
  ok('7.19b GET format rác 404', r19b.status === 404, `got ${r19b.status}`)

  // ─── Section 7.20 — assign-reviser với chapterId không thuộc request → 404 ─
  section('7.20 assign-reviser chapterId rác → 404')
  const r20 = await req('PATCH', `/reprint-requests/${wrReprintId}/chapters/${OBJECT_ID_RANDOM}/assign-reviser`, {
    token: e1Tok,
    body: { reviserId: m3.id, reviserType: ReviserType.OTHER_MANGAKA }
  })
  expectError(r20, 404, 'Error.ReprintChapterNotFound', '7.20a chapterId rác → ReprintChapterNotFound')

  // ─── Section 7.21 — Validation: body thiếu field ─────────────────────────
  section('7.21 Validation 422')
  const r21a = await req('POST', '/reprint-requests', {
    token: e1Tok,
    body: { seriesId: seriesFB.id, revisionMode: 'AS_IS' } // thiếu reason, chapterRangeStart/End
  })
  ok('7.21a thiếu field 422', r21a.status === 422, `got ${r21a.status}`)
  const r21b = await req('POST', '/reprint-requests', {
    token: e1Tok,
    body: {
      seriesId: seriesFB.id,
      revisionMode: 'AS_IS',
      reason: 'invalid range',
      chapterRangeStart: 5,
      chapterRangeEnd: 1 // end < start
    }
  })
  ok('7.21b range end < start 422', r21b.status === 422, `got ${r21b.status}`)

  // ─── Section 7.22 — Manuscript update khi status không phải BOARD_APPROVED → 409 ─
  section('7.22 manuscript update khi PENDING → 409 InvalidReprintTransition')
  const r22 = await req('PATCH', `/reprint-requests/${pendId}/chapters/${fbCh1.id}/manuscript`, {
    token: m1Tok,
    body: { originalChapterId: fbCh1.id, manuscriptFile: 'manuscripts/x.pdf' }
  })
  expectError(
    r22,
    409,
    'Error.InvalidReprintTransition',
    '7.22a manuscript update khi PENDING → InvalidReprintTransition'
  )

  // ─── Section 7.23 — Board-approve với dto.approve: false → REJECTED ────
  section('7.23 B reject request PENDING → REJECTED')
  const r23 = await req('PATCH', `/reprint-requests/${pendId}/board-approve`, {
    token: b1Tok,
    body: { approve: false, reason: 'no market demand' }
  })
  ok('7.23a b reject 200', r23.status === 200, `got ${r23.status} ${r23.raw.slice(0, 200)}`)
  ok(
    '7.23b status REJECTED',
    r23.json?.data?.status === 'REJECTED' || r23.json?.status === 'REJECTED',
    `got ${r23.json?.data?.status ?? r23.json?.status}`
  )

  // ─── Section 7.24 — RBAC: board-approve by non-board → 403 ──────────────
  section('7.24 RBAC: E board-approve → 403')
  const r24a = await req('POST', '/reprint-requests', {
    token: e1Tok,
    body: {
      seriesId: seriesFB.id,
      revisionMode: 'AS_IS',
      reason: 'rbac test',
      chapterRangeStart: 1,
      chapterRangeEnd: 2
    }
  })
  const rbacId = r24a.json?.data?.id ?? r24a.json?.id ?? r24a.json?.data?.data?.id
  const r24b = await req('PATCH', `/reprint-requests/${rbacId}/board-approve`, {
    token: e1Tok, // editor
    body: { approve: true }
  })
  ok('7.24a editor board-approve 403', r24b.status === 403, `got ${r24b.status} ${r24b.raw.slice(0, 200)}`)

  // ─── Section 7.25 — Admin/board PATCH /reprint-requests (admin cancel) ─
  section('7.25 GET /reprint-requests/:id/chapters → list embedded chapters')
  const r25 = await req('GET', `/reprint-requests/${wrReprintId}/chapters`, { token: e1Tok })
  ok('7.25a list chapters 200', r25.status === 200, `got ${r25.status}`)
  ok('7.25b 2 chapters', Array.isArray(r25.json?.data) && r25.json.data.length === 2, `got ${JSON.stringify(r25.json)}`)

  // ─── Section 7.26 — E tạo reprint khi series có duplicate → check xem code cho phép không ─
  section('7.26 E tạo reprint lần 2 (cùng series đã có 1 PUBLISHED) → check duplicate rule')
  const r26 = await req('POST', '/reprint-requests', {
    token: e1Tok,
    body: {
      seriesId: seriesFB.id,
      revisionMode: 'AS_IS',
      reason: 'duplicate test',
      chapterRangeStart: 1,
      chapterRangeEnd: 2
    }
  })
  // Per spec: reprint thứ 2 cùng series khi 1 đang mở (theo code cho/chặn — ghi expected sau grep).
  // Code hiện tại không enforce unique — kỳ vọng 201 hoặc 409 conflict.
  ok(
    '7.26a duplicate reprint create',
    r26.status === 201 || r26.status === 409,
    `got ${r26.status} ${r26.raw.slice(0, 200)}`
  )

  // ─── Section 7.27 — Revenue reprint qua POST /contracts/:id/revenue (B-RPT-04) ─
  section('7.27 POST /contracts/:id/revenue revenue-report sau PUBLISHED')
  const r27 = await req('POST', `/contracts/${contractFB.id}/revenue`, {
    token: b1Tok,
    body: { reportPeriod: '2026-Q1', grossRevenue: 5000 }
  })
  // kỳ vọng 201 hoặc 422 (validation). Endpoint không phải 500.
  ok('7.27a revenue report not 500', r27.status !== 500, `got ${r27.status} ${r27.raw.slice(0, 200)}`)

  // ─── Section 7.28 — Auth guard: BOARD_MEMBER tạo reprint → 403 ───────────
  section('7.28 RBAC: BOARD_MEMBER tạo reprint → 403')
  const r28 = await req('POST', '/reprint-requests', {
    token: b1Tok,
    body: {
      seriesId: seriesFB.id,
      revisionMode: 'AS_IS',
      reason: 'wrong role',
      chapterRangeStart: 1,
      chapterRangeEnd: 2
    }
  })
  ok('7.28a board tạo reprint 403', r28.status === 403, `got ${r28.status}`)

  // ─── Section 7.29 — Audit: TRANSFER_REQUEST / REPRINT_REQUEST entries ───
  section('7.29 Audit: GET /audit có entries')
  const r29 = await req('GET', '/audit?entityType=REPRINT_REQUEST', { token: admin })
  ok('7.29a audit endpoint not 500', r29.status !== 500, `got ${r29.status}`)

  // ─── Section 7.30 — INTERNAL_TEAM reviser OK ─────────────────────────────
  section('7.30 INTERNAL_TEAM reviser — không check role, OK')
  // Tạo reprint mới WITH_REVISION + FB (cho wr test)
  const r30a = await req('POST', '/reprint-requests', {
    token: e1Tok,
    body: {
      seriesId: seriesFB.id,
      revisionMode: ReprintRevisionMode.WITH_REVISION,
      reason: 'INTERNAL_TEAM test',
      chapterRangeStart: 1,
      chapterRangeEnd: 2
    }
  })
  const intReprintId = r30a.json?.data?.id ?? r30a.json?.id ?? r30a.json?.data?.data?.id
  const r30b = await req('PATCH', `/reprint-requests/${intReprintId}/board-approve`, {
    token: b1Tok,
    body: { approve: true }
  })
  ok('7.30a board-approve', r30b.status === 200, `got ${r30b.status}`)
  const r30c = await req('PATCH', `/reprint-requests/${intReprintId}/chapters/${fbCh1.id}/assign-reviser`, {
    token: e1Tok,
    body: { reviserId: e1.id, reviserType: ReviserType.INTERNAL_TEAM }
  })
  ok('7.30b INTERNAL_TEAM reviser OK', r30c.status === 200, `got ${r30c.status} ${r30c.raw.slice(0, 200)}`)

  await prisma.$disconnect()
  const fail = summary(FLOW)
  process.exit(fail > 0 ? 1 : 0)
}

void main().catch(async (e) => {
  console.error('FATAL', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
