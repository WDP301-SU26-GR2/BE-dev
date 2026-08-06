/**
 * Smoke test cho Spec 2026-08-06.
 * Chạy với server đang lên, Mongo + Redis thật:
 *   NODE_ENV=test PORT=4100 pnpm exec tsx test/flows/smoke-spec-2026-08-06.ts
 *
 * Bao phủ:
 *   - Danh mục tạp chí (CRUD)
 *   - Gate tạo quyết định Hội đồng (C1/C2/C3)
 *   - Báo cáo Hội đồng (C4)
 *   - Guard xoá tạp chí
 *   - Sửa slot bộ truyện
 *   - Huỷ hợp đồng nháp
 *   - Message response
 */
import { ContractStatus, SeriesStatus } from '@prisma/client'
import { login } from './lib/auth.js'
import { makeSeriesAt, makeUser, prisma, seedRolesAndAdmin, wipeDb } from './lib/seed.js'
import { expectError, ok, req, resetCounters, section, summary } from './lib/http.js'

const FLOW = 'smoke-spec-2026-08-06'

const main = async () => {
  resetCounters()
  console.log(`\n##### ${FLOW} #####`)
  await wipeDb()
  await seedRolesAndAdmin()

  const admin = await makeUser('SUPER_ADMIN')
  const editor = await makeUser('EDITOR')
  const board = await makeUser('BOARD_MEMBER')
  const mangaka = await makeUser('MANGAKA')
  const adminTok = await login(admin.email)
  const editorTok = await login(editor.email)
  const boardTok = await login(board.email)

  // ───────── 1. Danh mục tạp chí ─────────
  section('1. Danh mục tạp chí')

  // FT Jump đã có sẵn từ seed, thử thêm tạp chí khác
  const created = await req('POST', '/admin/magazines', {
    token: adminTok,
    body: { name: '  Test Mag  ', publicationTypes: ['WEEKLY', 'MONTHLY'] }
  })
  ok('S1-01 Super Admin thêm tạp chí mới → 201', created.status === 201, `status=${created.status}`)

  const listed = await req('GET', '/admin/magazines', { token: adminTok })
  const items = (listed.json?.data?.items ?? []) as { name: string; publicationTypes: string[] }[]
  ok(
    'S1-02 tên đã được chuẩn hoá khoảng trắng khi lưu',
    items.some((m) => m.name === 'Test Mag'),
    `items=${JSON.stringify(items)}`
  )

  // FT Jump đã có từ seed, thử thêm trùng
  const dup = await req('POST', '/admin/magazines', {
    token: adminTok,
    body: { name: 'FT Jump', publicationTypes: ['WEEKLY'] }
  })
  expectError(dup, 409, 'Error.MagazineAlreadyExists', 'S1-03 trùng tên → 409')

  const editorAdd = await req('POST', '/admin/magazines', {
    token: editorTok,
    body: { name: 'Tạp Chí Lậu', publicationTypes: ['WEEKLY'] }
  })
  ok('S1-04 biên tập viên KHÔNG được thêm tạp chí → 403', editorAdd.status === 403, `status=${editorAdd.status}`)

  // ───────── 2. Gate khi tạo quyết định ─────────
  section('2. Gate tạo quyết định Hội đồng')

  // Tạo session + chuyển sang VOTING phase
  const board2 = await makeUser('BOARD_MEMBER')
  const board3 = await makeUser('BOARD_MEMBER')
  const sessionResp = await req('POST', '/board/sessions', {
    token: editorTok,
    body: {
      title: `Smoke ${Date.now()}`,
      startTime: new Date(Date.now() + 60000).toISOString(),
      allowedEditorIds: [board.id, board2.id, board3.id]
    }
  })
  if (sessionResp.status !== 201) {
    console.log('DEBUG sessionResp:', JSON.stringify(sessionResp))
  }
  const sessionId = sessionResp.json?.data?.id as string

  // Chuyển sang ACTIVE và VOTING phase
  await req('PATCH', `/board/sessions/${sessionId}/start`, { token: editorTok })
  await req('PATCH', `/board/sessions/${sessionId}/phase`, { token: editorTok, body: { phase: 'VOTING' } })

  // S2-01: tạp chí ngoài danh mục
  const series1 = await makeSeriesAt(SeriesStatus.PITCHED, { mangakaId: mangaka.id, editorId: editor.id })
  const badMagazine = await req('POST', '/board/decisions', {
    token: editorTok,
    body: {
      boardSessionId: sessionId,
      targetSeriesId: series1.id,
      decisionType: 'SERIALIZATION',
      details: { magazine: 'NonExistent', startIssueNumber: 1, publicationType: 'WEEKLY' }
    }
  })
  expectError(badMagazine, 422, 'Error.MagazineNotRegistered', 'S2-01 tạp chí ngoài danh mục → 422')

  // S2-02: nhịp tạp chí không chấp nhận - dùng series khác để tránh state
  // BIMONTHLY không phải enum hợp lệ nên Zod sẽ catch trước → 422
  const series2 = await makeSeriesAt(SeriesStatus.PITCHED, { mangakaId: mangaka.id, editorId: editor.id })
  const badCadence = await req('POST', '/board/decisions', {
    token: editorTok,
    body: {
      boardSessionId: sessionId,
      targetSeriesId: series2.id,
      decisionType: 'SERIALIZATION',
      details: { magazine: 'FT Jump', startIssueNumber: 1, publicationType: 'BIMONTHLY' }
    }
  })
  // Zod validation sẽ catch trước vì BIMONTHLY không phải enum hợp lệ
  ok('S2-02 publicationType không hợp lệ → 422', badCadence.status === 422, `status=${badCadence.status}`)

  // S2-03: CONTINUE đã xoá
  const series3 = await makeSeriesAt(SeriesStatus.PITCHED, { mangakaId: mangaka.id, editorId: editor.id })
  const deadType = await req('POST', '/board/decisions', {
    token: editorTok,
    body: { boardSessionId: sessionId, targetSeriesId: series3.id, decisionType: 'CONTINUE', details: null }
  })
  ok('S2-03 decisionType CONTINUE đã xoá → 422', deadType.status === 422, `status=${deadType.status}`)

  // S2-04: CANCELLATION khi PITCHED
  const series4 = await makeSeriesAt(SeriesStatus.PITCHED, { mangakaId: mangaka.id, editorId: editor.id })
  const wrongStatus = await req('POST', '/board/decisions', {
    token: editorTok,
    body: { boardSessionId: sessionId, targetSeriesId: series4.id, decisionType: 'CANCELLATION', details: null }
  })
  expectError(
    wrongStatus,
    409,
    'Error.DecisionTypeNotAllowedForSeriesStatus',
    'S2-04 CANCELLATION khi bộ truyện mới PITCHED → 409'
  )

  // S2-05: targetSeriesId không tồn tại
  const ghost = await req('POST', '/board/decisions', {
    token: editorTok,
    body: {
      boardSessionId: sessionId,
      targetSeriesId: '507f1f77bcf86cd799439011',
      decisionType: 'SERIALIZATION',
      details: { magazine: 'FT Jump', startIssueNumber: 1, publicationType: 'WEEKLY' }
    }
  })
  ok('S2-05 targetSeriesId không tồn tại → 404', ghost.status === 404, `status=${ghost.status}`)

  // S2-06: quyết định hợp lệ - dùng series5
  const series5 = await makeSeriesAt(SeriesStatus.PITCHED, { mangakaId: mangaka.id, editorId: editor.id })
  const first = await req('POST', '/board/decisions', {
    token: editorTok,
    body: {
      boardSessionId: sessionId,
      targetSeriesId: series5.id,
      decisionType: 'SERIALIZATION',
      details: { magazine: 'FT Jump', startIssueNumber: 1, publicationType: 'WEEKLY' }
    }
  })
  ok('S2-06 quyết định hợp lệ → 201', first.status === 201, `status=${first.status}`)

  // S2-07: quyết định thứ 2 cùng bộ truyện
  const second = await req('POST', '/board/decisions', {
    token: editorTok,
    body: {
      boardSessionId: sessionId,
      targetSeriesId: series5.id,
      decisionType: 'SERIALIZATION',
      details: { magazine: 'FT Jump', startIssueNumber: 1, publicationType: 'WEEKLY' }
    }
  })
  expectError(second, 409, 'Error.OpenBoardDecisionExists', 'S2-07 quyết định thứ 2 cùng bộ truyện → 409')

  // ───────── 3. Báo cáo 1:1 ─────────
  section('3. Báo cáo Hội đồng')

  // Tạo session khác để test báo cáo
  const board4 = await makeUser('BOARD_MEMBER')
  const board5 = await makeUser('BOARD_MEMBER')
  const session2Resp = await req('POST', '/board/sessions', {
    token: editorTok,
    body: {
      title: `Smoke2 ${Date.now()}`,
      startTime: new Date(Date.now() + 60000).toISOString(),
      allowedEditorIds: [board.id, board4.id, board5.id]
    }
  })
  const session2Id = session2Resp.json?.data?.id as string
  await req('PATCH', `/board/sessions/${session2Id}/start`, { token: editorTok })
  await req('PATCH', `/board/sessions/${session2Id}/phase`, { token: editorTok, body: { phase: 'VOTING' } })

  // Tạo decision mới trong session 2
  const series6 = await makeSeriesAt(SeriesStatus.PITCHED, { mangakaId: mangaka.id, editorId: editor.id })
  const dec2Resp = await req('POST', '/board/decisions', {
    token: editorTok,
    body: {
      boardSessionId: session2Id,
      targetSeriesId: series6.id,
      decisionType: 'SERIALIZATION',
      details: { magazine: 'FT Jump', startIssueNumber: 1, publicationType: 'WEEKLY' }
    }
  })
  const decision2Id = String(dec2Resp.json?.data?.id)

  const rep1 = await req('POST', '/board/reports', {
    token: editorTok,
    body: {
      seriesId: series6.id,
      boardDecisionId: decision2Id,
      reportType: 'hồ sơ bảo vệ',
      content: 'Số liệu xu hướng quý 3',
      attachments: []
    }
  })
  ok('S3-01 báo cáo đầu tiên → 201', rep1.status === 201, `status=${rep1.status}`)

  const rep2 = await req('POST', '/board/reports', {
    token: editorTok,
    body: {
      seriesId: series6.id,
      boardDecisionId: decision2Id,
      reportType: 'phân tích xếp hạng',
      content: 'Bản thứ hai',
      attachments: []
    }
  })
  expectError(rep2, 409, 'Error.BoardReportAlreadyExists', 'S3-02 báo cáo thứ 2 cho cùng quyết định → 409')

  // ───────── 4. Xoá tạp chí có ràng buộc ─────────
  section('4. Guard xoá tạp chí')

  const serialized = await makeSeriesAt(SeriesStatus.SERIALIZED, {
    mangakaId: mangaka.id,
    editorId: editor.id,
    magazine: 'FT Jump'
  })
  const delUsed = await req('DELETE', '/admin/magazines/FT Jump', { token: adminTok })
  expectError(delUsed, 409, 'Error.MagazineInUse', 'S4-01 xoá tạp chí đang có bộ truyện dùng → 409')

  const narrow = await req('PUT', '/admin/magazines/FT Jump', {
    token: adminTok,
    body: { publicationTypes: ['MONTHLY'] }
  })
  expectError(narrow, 409, 'Error.PublicationTypeInUse', 'S4-02 bỏ nhịp đang có bộ truyện dùng → 409')

  // Xoá tạp chí Test Mag (không có series nào dùng)
  const delNew = await req('DELETE', '/admin/magazines/Test Mag', { token: adminTok })
  ok('S4-03 xoá tạp chí mới → 200', delNew.status === 200, `status=${delNew.status}`)

  // ───────── 5. Sửa slot bộ truyện ─────────
  section('5. Sửa suất phát hành')

  // Sửa series đang serialized với magazine không hợp lệ
  await prisma.series.update({ where: { id: serialized.id }, data: { magazine: 'NonExistent' } })

  // Test với Super Admin đăng nhập đúng
  const fix = await req('PATCH', `/admin/series/${serialized.id}/slot`, {
    token: adminTok,
    body: { magazine: 'Jump' } // Dùng Jump thay vì FT Jump để tránh conflict
  })
  ok('S5-01 Super Admin sửa tạp chí sai → 200', fix.status === 200, `status=${fix.status}`)

  const afterFix = await prisma.series.findUnique({ where: { id: serialized.id } })
  ok('S5-02 giá trị trong DB ĐÃ đổi thật', afterFix?.magazine === 'Jump', `magazine=${afterFix?.magazine}`)

  const draft = await makeSeriesAt(SeriesStatus.DRAFT, { mangakaId: mangaka.id })
  const fixDraft = await req('PATCH', `/admin/series/${draft.id}/slot`, {
    token: adminTok,
    body: { magazine: 'Jump' }
  })
  expectError(fixDraft, 409, 'Error.SeriesSlotNotEditable', 'S5-03 bộ truyện chưa serial hoá → 409')

  // ───────── 6. Huỷ hợp đồng nháp ─────────
  section('6. Huỷ hợp đồng nháp')

  const contract = await prisma.contract.create({
    data: {
      seriesId: serialized.id,
      mangakaId: mangaka.id,
      editorId: editor.id,
      status: ContractStatus.DRAFT,
      contractType: 'FULL_BUYOUT',
      valuationAmount: 100_000_000,
      publisherOwnershipPct: 100,
      mangakaOwnershipPct: 0,
      contractStart: new Date(),
      contractEnd: new Date(Date.now() + 86_400_000)
    }
  })
  const voided = await req('POST', `/contracts/${contract.id}/void`, {
    token: editorTok,
    body: { reason: 'soạn nhầm điều khoản' }
  })
  ok('S6-01 huỷ hợp đồng nháp → 201', voided.status === 201, `status=${voided.status}`)

  const afterVoid = await prisma.contract.findUnique({ where: { id: contract.id } })
  ok('S6-02 trạng thái trong DB là VOIDED', afterVoid?.status === ContractStatus.VOIDED, `status=${afterVoid?.status}`)

  const boardVoid = await req('POST', `/contracts/${contract.id}/void`, {
    token: boardTok,
    body: { reason: 'thử' }
  })
  ok('S6-03 Hội đồng KHÔNG được huỷ hợp đồng → 403', boardVoid.status === 403, `status=${boardVoid.status}`)

  // ───────── 7. Message phân biệt hành động ─────────
  section('7. Message response')

  ok(
    'S7-01 message huỷ hợp đồng khác "Success"',
    typeof voided.json?.message === 'string' && voided.json.message !== 'Success',
    `message=${String(voided.json?.message)}`
  )

  process.exitCode = summary(FLOW) > 0 ? 1 : 0
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  process.exitCode = 1
  await prisma.$disconnect()
})
