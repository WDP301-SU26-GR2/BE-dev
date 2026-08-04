// Smoke Spec 30 — SeriesRequest (tác giả xin rút / tạm ngưng / kết thúc sớm) + cascade HIATUS.
// API THẬT (cổng 4100) + DB THẬT. Không mock.
import { ChapterHoldSource, SeriesRequestStatus, SeriesStatus, TaskStatus } from '@prisma/client'
import {
  makeChapterAt,
  makePageAt,
  makeSeriesAt,
  makeStudioAssignment,
  makeTaskAt,
  makeUser,
  prisma,
  seedRolesAndAdmin,
  wipeDb
} from './lib/seed.js'
import { clearTokenCache, login } from './lib/auth.js'
import { ok, req, section, summary } from './lib/http.js'
import { waitUntil } from './lib/cron.js'

const FLOW = 'smoke-spec30'
const asExtra = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v ?? {}))

async function main() {
  section('Setup')
  await wipeDb()
  await seedRolesAndAdmin()
  clearTokenCache()
  const mangaka = await makeUser('MANGAKA')
  const editor = await makeUser('EDITOR')
  const assistant = await makeUser('ASSISTANT')
  const otherEditor = await makeUser('EDITOR')
  const mTok = await login(mangaka.email)
  const eTok = await login(editor.email)
  const weTok = await login(otherEditor.email)
  ok('00 login OK', mTok.length > 50 && eTok.length > 50)

  // ── 1. Case 1: rút ở READY_TO_PITCH phải qua yêu cầu chính thức ────────────
  section('1. Case 1 — rút hồ sơ ở READY_TO_PITCH')
  const ready = await makeSeriesAt(SeriesStatus.READY_TO_PITCH, { mangakaId: mangaka.id, editorId: editor.id })

  const direct = await req('POST', `/series/${ready.id}/withdraw`, { token: mTok, body: { reason: 'đổi ý' } })
  ok('01 rút trực tiếp → 409', direct.status === 409, asExtra(direct.json?.message))
  ok('02 mã lỗi đúng', direct.json?.code === 'Error.SeriesRequestRequired', asExtra(direct.json?.code))

  const created = await req('POST', '/series-requests', {
    token: mTok,
    body: { seriesId: ready.id, requestType: 'WITHDRAW', reason: 'tôi muốn rút hồ sơ' }
  })
  ok('03 tạo yêu cầu → 201', created.status === 201, asExtra(created.json))
  const reqId = created.json?.data?.id as string
  ok(
    '04 trạng thái PENDING',
    created.json?.data?.status === SeriesRequestStatus.PENDING,
    asExtra(created.json?.data?.status)
  )

  ok(
    '05 biên tập viên nhận thông báo',
    await waitUntil(
      async () =>
        (await prisma.notification.count({
          where: { recipientId: editor.id, referenceType: 'SERIES_REQUEST_CREATED', referenceId: ready.id }
        })) > 0,
      15_000,
      500
    )
  )

  const dup = await req('POST', '/series-requests', {
    token: mTok,
    body: { seriesId: ready.id, requestType: 'WITHDRAW', reason: 'lần hai' }
  })
  ok('06 yêu cầu thứ hai → 409', dup.status === 409, asExtra(dup.json?.code))

  const notMine = await req('POST', `/series-requests/${reqId}/accept`, { token: weTok, body: {} })
  ok('07 biên tập viên khác accept → 403', notMine.status === 403, asExtra(notMine.status))

  const noReason = await req('POST', `/series-requests/${reqId}/reject`, { token: eTok, body: {} })
  ok('08 từ chối thiếu lý do → 422', noReason.status === 422, asExtra(noReason.status))

  const accepted = await req('POST', `/series-requests/${reqId}/accept`, { token: eTok, body: { note: 'đồng ý' } })
  ok('09 chấp nhận → 201', accepted.status === 201, asExtra(accepted.json))

  const afterWithdraw = await prisma.series.findUnique({ where: { id: ready.id } })
  ok('10 bộ truyện → WITHDRAWN', afterWithdraw?.status === SeriesStatus.WITHDRAWN, asExtra(afterWithdraw?.status))

  const twice = await req('POST', `/series-requests/${reqId}/accept`, { token: eTok, body: {} })
  ok('11 accept lần hai → 409', twice.status === 409, asExtra(twice.json?.code))

  // ── 2. Case 2 nhánh HIATUS + cascade đóng băng ─────────────────────────────
  section('2. Case 2 — xin tạm ngưng, cascade đóng băng chương')
  const live = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: mangaka.id, editorId: editor.id })
  const chapter = await makeChapterAt({ seriesId: live.id, chapterNumber: 1 })
  const page = await makePageAt({ chapterId: chapter.id, pageNumber: 1 })
  await makeStudioAssignment({ mangakaId: mangaka.id, assistantId: assistant.id, seriesId: live.id })
  await makeTaskAt({ pageId: page.id, assistantId: assistant.id, status: TaskStatus.ASSIGNED })

  // Một chương bị biên tập viên hold TAY từ trước — resume KHÔNG được đụng tới.
  const manualChapter = await makeChapterAt({
    seriesId: live.id,
    chapterNumber: 2,
    holdComposite: true,
    heldBy: editor.id
  })

  const hiatusReq = await req('POST', '/series-requests', {
    token: mTok,
    body: {
      seriesId: live.id,
      requestType: 'HIATUS',
      reason: 'tôi kiệt sức cần nghỉ',
      expectedReturnDate: '2026-12-01T00:00:00.000Z'
    }
  })
  ok('12 tạo yêu cầu tạm ngưng → 201', hiatusReq.status === 201, asExtra(hiatusReq.json))
  const hiatusId = hiatusReq.json?.data?.id as string

  const accHiatus = await req('POST', `/series-requests/${hiatusId}/accept`, { token: eTok, body: {} })
  ok('13 chấp nhận tạm ngưng → 201', accHiatus.status === 201, asExtra(accHiatus.json))

  const sAfter = await prisma.series.findUnique({ where: { id: live.id } })
  ok('14 bộ truyện → HIATUS', sAfter?.status === SeriesStatus.HIATUS, asExtra(sAfter?.status))
  ok(
    '15 hiatusExpectedReturnDate là FIELD thật',
    sAfter?.hiatusExpectedReturnDate != null,
    asExtra(sAfter?.hiatusExpectedReturnDate)
  )
  ok(
    '16 lý do KHÔNG bị nối chuỗi ngày quay lại',
    !String(sAfter?.statusReason ?? '').includes('expected return'),
    asExtra(sAfter?.statusReason)
  )

  const c1 = await prisma.chapter.findUnique({ where: { id: chapter.id } })
  ok('17 chương bị đóng băng', c1?.hold != null, asExtra(c1?.hold))
  ok('18 nguồn hold = SERIES_HIATUS', c1?.hold?.source === ChapterHoldSource.SERIES_HIATUS, asExtra(c1?.hold?.source))

  ok(
    '19 trợ lý được báo tạm ngưng',
    await waitUntil(
      async () =>
        (await prisma.notification.count({
          where: { recipientId: assistant.id, referenceType: 'SERIES_HIATUS_STARTED' }
        })) > 0,
      15_000,
      500
    )
  )

  // ── 3. Resume: gỡ băng + dời hạn nộp ──────────────────────────────────────
  section('3. Resume — gỡ băng và dời hạn nộp')
  const threeDays = 3 * 86_400_000
  await prisma.series.update({
    where: { id: live.id },
    data: { hiatusStartedAt: new Date(Date.now() - threeDays) }
  })
  const before = await prisma.schedule.findUnique({ where: { chapterId: chapter.id } })
  const beforeDeadline = before?.currentDeadline ? before.currentDeadline.getTime() : null

  const resumed = await req('POST', `/series/${live.id}/resume`, { token: eTok })
  ok('20 resume → 2xx', resumed.status === 200 || resumed.status === 201, asExtra(resumed.status))

  const c1After = await prisma.chapter.findUnique({ where: { id: chapter.id } })
  ok('21 chương được gỡ băng', c1After?.hold == null, asExtra(c1After?.hold))

  const manualAfter = await prisma.chapter.findUnique({ where: { id: manualChapter.id } })
  ok('22 hold THỦ CÔNG vẫn giữ nguyên', manualAfter?.hold != null, asExtra(manualAfter?.hold))
  ok(
    '23 nguồn vẫn là MANUAL',
    manualAfter?.hold?.source === ChapterHoldSource.MANUAL,
    asExtra(manualAfter?.hold?.source)
  )

  if (beforeDeadline !== null) {
    const after = await prisma.schedule.findUnique({ where: { chapterId: chapter.id } })
    const afterDeadline = after?.currentDeadline?.getTime() ?? 0
    const shifted = afterDeadline - beforeDeadline
    ok('24 hạn nộp được dời ~3 ngày', Math.abs(shifted - threeDays) < 120_000, `dời ${shifted}ms`)
    ok('25 đánh dấu đã gia hạn', after?.extended === true, asExtra(after?.extended))
  } else {
    ok('24 hạn nộp được dời ~3 ngày', false, 'schedule không có currentDeadline — kiểm tra makeChapterAt')
    ok('25 đánh dấu đã gia hạn', false, 'bỏ qua do thiếu deadline')
  }

  // ── 4. COMPLETION — chấp nhận nhưng CHƯA đổi trạng thái ────────────────────
  section('4. COMPLETION chỉ ghi nhận, chờ Hội đồng')
  const compReq = await req('POST', '/series-requests', {
    token: mTok,
    body: {
      seriesId: live.id,
      requestType: 'COMPLETION',
      reason: 'tôi muốn kết thúc câu chuyện',
      proposedEndingChapters: 3
    }
  })
  ok('26 tạo yêu cầu kết thúc → 201', compReq.status === 201, asExtra(compReq.json))
  const compId = compReq.json?.data?.id as string

  const accComp = await req('POST', `/series-requests/${compId}/accept`, { token: eTok, body: {} })
  ok('27 chấp nhận → 201', accComp.status === 201, asExtra(accComp.json))

  const sComp = await prisma.series.findUnique({ where: { id: live.id } })
  ok('28 bộ truyện VẪN SERIALIZED (chờ Hội đồng)', sComp?.status === SeriesStatus.SERIALIZED, asExtra(sComp?.status))

  // ── 5. Từ chối ────────────────────────────────────────────────────────────
  section('5. Từ chối yêu cầu')
  const live2 = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: mangaka.id, editorId: editor.id })
  const r5 = await req('POST', '/series-requests', {
    token: mTok,
    body: { seriesId: live2.id, requestType: 'HIATUS', reason: 'mệt' }
  })
  const r5Id = r5.json?.data?.id as string
  const rej = await req('POST', `/series-requests/${r5Id}/reject`, {
    token: eTok,
    body: { reason: 'sắp tới có sự kiện lớn, mong bạn cố gắng' }
  })
  ok('29 từ chối → 201', rej.status === 201, asExtra(rej.json))
  ok('30 lưu lý do từ chối', typeof rej.json?.data?.rejectReason === 'string', asExtra(rej.json?.data?.rejectReason))

  const s5 = await prisma.series.findUnique({ where: { id: live2.id } })
  ok('31 bộ truyện giữ nguyên SERIALIZED', s5?.status === SeriesStatus.SERIALIZED, asExtra(s5?.status))

  ok(
    '32 tác giả nhận thông báo kèm lý do',
    await waitUntil(
      async () =>
        (await prisma.notification.count({
          where: {
            recipientId: mangaka.id,
            referenceType: 'SERIES_REQUEST_REJECTED',
            content: { contains: 'sự kiện lớn' }
          }
        })) > 0,
      15_000,
      500
    )
  )

  // ── 6. Tác giả tự huỷ + id rác ────────────────────────────────────────────
  section('6. Huỷ yêu cầu và id rác')
  const r6 = await req('POST', '/series-requests', {
    token: mTok,
    body: { seriesId: live2.id, requestType: 'COMPLETION', reason: 'nghĩ lại rồi' }
  })
  const r6Id = r6.json?.data?.id as string
  const cancelled = await req('POST', `/series-requests/${r6Id}/cancel`, { token: mTok })
  ok('33 tác giả tự huỷ → 201', cancelled.status === 201, asExtra(cancelled.json))
  ok(
    '34 trạng thái CANCELLED',
    cancelled.json?.data?.status === SeriesRequestStatus.CANCELLED,
    asExtra(cancelled.json?.data?.status)
  )

  const afterCancel = await req('POST', '/series-requests', {
    token: mTok,
    body: { seriesId: live2.id, requestType: 'HIATUS', reason: 'huỷ rồi thì tạo lại được' }
  })
  ok('35 huỷ xong tạo lại được → 201', afterCancel.status === 201, asExtra(afterCancel.status))

  const junk = await req('GET', '/series-requests/khong-phai-objectid', { token: mTok })
  ok('36 id rác → 404 (không phải 500)', junk.status === 404, asExtra(junk.status))

  // ── 7. Phạm vi đọc ────────────────────────────────────────────────────────
  section('7. Phạm vi đọc theo vai trò')
  const listMangaka = await req('GET', '/series-requests', { token: mTok })
  ok('37 tác giả xem được danh sách của mình', listMangaka.status === 200, asExtra(listMangaka.status))
  ok(
    '38 danh sách bọc phân trang',
    typeof listMangaka.json?.data?.total === 'number' && Array.isArray(listMangaka.json?.data?.items),
    asExtra(listMangaka.json?.data)
  )

  const otherMangaka = await makeUser('MANGAKA')
  const omTok = await login(otherMangaka.email)
  const listOther = await req('GET', '/series-requests', { token: omTok })
  ok(
    '39 tác giả khác không thấy yêu cầu người ta',
    listOther.json?.data?.total === 0,
    asExtra(listOther.json?.data?.total)
  )

  const detailOther = await req('GET', `/series-requests/${r6Id}`, { token: omTok })
  ok('40 xem chi tiết ngoài phạm vi → 403', detailOther.status === 403, asExtra(detailOther.status))

  process.exit(summary(FLOW))
}

void main()
