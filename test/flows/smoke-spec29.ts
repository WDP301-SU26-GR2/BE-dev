// Smoke Spec 29 — Chuẩn hoá message tiếng Việt + Notification title.
// Dùng API THẬT (cổng 4100) + DB THẬT. Không mock.
import {
  makeChapterAt,
  makePageAt,
  makeSeriesAt,
  makeStudioAssignment,
  makeUser,
  prisma,
  seedRolesAndAdmin,
  wipeDb
} from './lib/seed.js'
import { clearTokenCache, login } from './lib/auth.js'
import { ok, req, section, summary } from './lib/http.js'

const FLOW = 'smoke-spec29'
const asExtra = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value ?? {}))

// Từ tiếng Anh KHÔNG được xuất hiện trong bất kỳ chữ nào trả về cho người dùng.
const FORBIDDEN = [
  /\bseries\b/i,
  /\bmangaka\b/i,
  /\bdeadline\b/i,
  /\beditor\b/i,
  /\btask\b/i,
  /\bstoryboard\b/i,
  /\bboard\b/i
]
const OBJECT_ID = /[0-9a-fA-F]{24}/
const hasVietnamese = (value: string) =>
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(value)
const forbiddenIn = (value: string) => FORBIDDEN.filter((regex) => regex.test(value)).map(String)
const stringContent = (value: unknown): string => (typeof value === 'string' ? value : '')

async function main() {
  section('Setup — wipe + seed')
  await wipeDb()
  await seedRolesAndAdmin()
  clearTokenCache()
  const mangaka = await makeUser('MANGAKA')
  const other = await makeUser('MANGAKA')
  const assistant = await makeUser('ASSISTANT')
  const mTok = await login(mangaka.email)
  const oTok = await login(other.email)
  const aTok = await login(assistant.email)
  ok('00. login 3 user OK', mTok.length > 50 && oTok.length > 50 && aTok.length > 50)

  // ── 1. Thông điệp LỖI qua API thật ────────────────────────────────────────
  section('1. Message lỗi phải là tiếng Việt, code giữ nguyên Error.*')

  const notFound = await req('GET', '/series/000000000000000000000000', { token: mTok })
  ok('01. id không tồn tại → 404', notFound.status === 404, asExtra({ status: notFound.status }))
  ok('02. message là tiếng Việt', hasVietnamese(String(notFound.json?.message)), asExtra(notFound.json?.message))
  ok(
    '03. message KHÔNG chứa từ tiếng Anh cấm',
    forbiddenIn(String(notFound.json?.message)).length === 0,
    asExtra(notFound.json?.message)
  )
  ok(
    '04. code vẫn dạng Error.PascalCase',
    /^Error\.[A-Z][A-Za-z0-9]*$/.test(String(notFound.json?.code)),
    asExtra(notFound.json?.code)
  )

  const noAuth = await req('GET', '/notifications')
  ok('05. thiếu token → 401', noAuth.status === 401, asExtra({ status: noAuth.status }))
  ok(
    '06. message 401 tiếng Việt, không có chữ "token"',
    hasVietnamese(String(noAuth.json?.message)) && !/\btoken\b/i.test(String(noAuth.json?.message)),
    asExtra(noAuth.json?.message)
  )

  const series = await makeSeriesAt('DRAFT', { mangakaId: mangaka.id })
  const forbidden = await req('GET', `/series/${series.id}`, { token: oTok })
  ok(
    '07. Mangaka khác → 403/404',
    forbidden.status === 403 || forbidden.status === 404,
    asExtra({ status: forbidden.status })
  )
  ok(
    '08. message tiếng Việt, không từ cấm',
    hasVietnamese(String(forbidden.json?.message)) && forbiddenIn(String(forbidden.json?.message)).length === 0,
    asExtra(forbidden.json?.message)
  )

  const badBody = await req('POST', '/series/proposals', { token: mTok, body: { title: '' } })
  ok('09. body sai → 422', badBody.status === 422, asExtra({ status: badBody.status }))
  ok('10. lỗi validate có errors[]', Array.isArray(badBody.json?.errors), asExtra(badBody.json?.errors?.slice?.(0, 2)))

  // ── 2. Notification title qua API thật ────────────────────────────────────
  section('2. Notification có title tiếng Việt (referenceType giữ nguyên)')

  const serialized = await makeSeriesAt('SERIALIZED', {
    mangakaId: mangaka.id,
    title: 'Bến Cảng Vô Danh'
  })
  const chapter = await makeChapterAt({ seriesId: serialized.id, chapterNumber: 12 })
  const page = await makePageAt({ chapterId: chapter.id, pageNumber: 5, originalFile: 'smoke29/p5.png' })
  await makeStudioAssignment({ mangakaId: mangaka.id, assistantId: assistant.id, seriesId: serialized.id })

  const created = await req('POST', '/tasks', {
    token: mTok,
    body: { pageId: page.id, regionIds: [], assistantId: assistant.id, taskType: 'BACKGROUND', priority: 1 }
  })
  ok(
    '11. POST /tasks → 201',
    created.status === 201,
    asExtra({ status: created.status, body: created.raw.slice(0, 300) })
  )

  const notis = await req('GET', '/notifications', { token: aTok })
  ok('12. GET /notifications → 200', notis.status === 200)
  const items = (notis.json?.data?.items ?? []) as Array<Record<string, unknown>>
  ok('13. trợ lý nhận được ít nhất 1 thông báo', items.length >= 1, asExtra({ count: items.length }))

  const taskNoti = items.find((notification) => notification.referenceType === 'TASK_ASSIGNED')
  ok('14. có notification TASK_ASSIGNED', !!taskNoti, asExtra(items.map((notification) => notification.referenceType)))
  ok(
    '15. có field title',
    typeof taskNoti?.title === 'string' && String(taskNoti.title).length > 0,
    asExtra(taskNoti?.title)
  )
  ok('16. title đúng = "Công việc mới"', taskNoti?.title === 'Công việc mới', asExtra(taskNoti?.title))
  ok('17. content là tiếng Việt', hasVietnamese(String(taskNoti?.content)), asExtra(taskNoti?.content))
  ok('18. referenceType KHÔNG bị dịch (mã máy đọc)', taskNoti?.referenceType === 'TASK_ASSIGNED')
  ok('19. referenceId vẫn là ObjectId (deep-link còn dùng được)', OBJECT_ID.test(String(taskNoti?.referenceId)))

  // ── 3. Notification cũ / referenceType lạ vẫn có title ───────────────────
  section('3. Fallback title cho referenceType lạ (bản ghi cũ trong DB)')

  await prisma.notification.create({
    data: {
      recipientId: assistant.id,
      type: 'CONTRACT',
      referenceId: serialized.id,
      referenceType: 'MOT_MA_LA_KHONG_AI_MAP',
      content: 'Bản ghi cũ dùng để kiểm tra fallback',
      dedupeKey: `smoke29-${Date.now()}`
    }
  })
  const notis2 = await req('GET', '/notifications', { token: aTok })
  const legacy = ((notis2.json?.data?.items ?? []) as Array<Record<string, unknown>>).find(
    (notification) => notification.referenceType === 'MOT_MA_LA_KHONG_AI_MAP'
  )
  ok('20. bản ghi referenceType lạ vẫn trả về', !!legacy)
  ok('21. có title fallback theo type = "Hợp đồng"', legacy?.title === 'Hợp đồng', asExtra(legacy?.title))

  // ── 4. Quét TOÀN BỘ chữ trả về cho người dùng ─────────────────────────────
  section('4. Quét sạch — không chữ tiếng Anh, không ObjectId lọt vào nội dung')

  const allNotis = (notis2.json?.data?.items ?? []) as Array<Record<string, unknown>>
  const badTitle = allNotis.filter((notification) => forbiddenIn(String(notification.title)).length > 0)
  ok(
    '22. không title nào chứa từ tiếng Anh cấm',
    badTitle.length === 0,
    asExtra(badTitle.map((notification) => notification.title))
  )
  const badContent = allNotis.filter((notification) => forbiddenIn(stringContent(notification.content)).length > 0)
  ok(
    '23. không content nào chứa từ tiếng Anh cấm',
    badContent.length === 0,
    asExtra(badContent.map((notification) => notification.content))
  )
  const leakId = allNotis.filter((notification) => OBJECT_ID.test(stringContent(notification.content)))
  ok(
    '24. không content nào lộ ObjectId',
    leakId.length === 0,
    asExtra(leakId.map((notification) => notification.content))
  )

  // ── 5. Kiểm tra thẳng DB ────────────────────────────────────────────────────
  section('5. Verify DB — Notification không có cột title (title là dẫn xuất)')

  const dbNoti = await prisma.notification.findFirst({ where: { recipientId: assistant.id } })
  ok('25. bản ghi DB tồn tại', !!dbNoti)
  ok(
    '26. DB KHÔNG lưu title (đúng thiết kế — không migrate)',
    !('title' in (dbNoti ?? {})),
    asExtra(Object.keys(dbNoti ?? {}))
  )

  const fail = summary(FLOW)
  await prisma.$disconnect()
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(async (error) => {
  console.error('[smoke-spec29] FATAL', error)
  await prisma.$disconnect().catch(() => undefined)
  process.exit(1)
})
