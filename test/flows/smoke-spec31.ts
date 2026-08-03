// Smoke Spec 31 — auto-huỷ công việc quá hạn, cảnh báo theo nhịp phát hành, chặn tiền quá lớn.
// API THẬT (cổng 4100) + DB THẬT + CRON THẬT. Không mock.
import { PublicationType, SeriesStatus, TaskStatus } from '@prisma/client'
import {
  makeChapterAt,
  makePageAt,
  makeSeriesAt,
  makeStudioAssignment,
  makeTaskAt,
  makeUser,
  prisma,
  seedRolesAndAdmin,
  setAppConfig,
  wipeDb
} from './lib/seed.js'
import { clearTokenCache, login } from './lib/auth.js'
import { ok, req, section, summary } from './lib/http.js'
import { clearCronLocks, waitUntil, withCronContext } from './lib/cron.js'

const FLOW = 'smoke-spec31'
const asExtra = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v ?? {}))
const HOUR = 3_600_000

async function main() {
  section('Setup')
  await wipeDb()
  await seedRolesAndAdmin()
  clearTokenCache()
  const mangaka = await makeUser('MANGAKA')
  const editor = await makeUser('EDITOR')
  const assistant = await makeUser('ASSISTANT')
  const mTok = await login(mangaka.email)
  ok('00 login OK', mTok.length > 50)
  await setAppConfig({ taskOverdueGraceHours: 24 })

  const series = await makeSeriesAt(SeriesStatus.SERIALIZED, {
    mangakaId: mangaka.id,
    editorId: editor.id,
    publicationType: PublicationType.WEEKLY
  })
  const chapter = await makeChapterAt({ seriesId: series.id, chapterNumber: 1 })
  const page = await makePageAt({ chapterId: chapter.id, pageNumber: 1 })
  await makeStudioAssignment({ mangakaId: mangaka.id, assistantId: assistant.id, seriesId: series.id })

  section('1. Auto-huỷ công việc quá hạn')

  // Quá hạn 2 giờ — CÒN trong ân hạn 24h → phải GIỮ.
  const inGrace = await makeTaskAt({
    pageId: page.id,
    assistantId: assistant.id,
    status: TaskStatus.IN_PROGRESS,
    deadline: new Date(Date.now() - 2 * HOUR)
  })
  // Quá hạn 30 giờ — VƯỢT ân hạn → phải HUỶ.
  const overGrace = await makeTaskAt({
    pageId: page.id,
    assistantId: assistant.id,
    status: TaskStatus.ASSIGNED,
    deadline: new Date(Date.now() - 30 * HOUR)
  })
  // Đã nộp, chờ tác giả duyệt — KHÔNG được huỷ dù quá hạn (lỗi ở khâu duyệt).
  const submitted = await makeTaskAt({
    pageId: page.id,
    assistantId: assistant.id,
    status: TaskStatus.SUBMITTED,
    deadline: new Date(Date.now() - 30 * HOUR)
  })
  // Đang treo chờ giao lại — KHÔNG huỷ.
  const onHold = await makeTaskAt({
    pageId: page.id,
    assistantId: assistant.id,
    status: TaskStatus.ON_HOLD,
    deadline: new Date(Date.now() - 30 * HOUR)
  })
  // Không có hạn nộp — KHÔNG huỷ.
  const noDeadline = await makeTaskAt({
    pageId: page.id,
    assistantId: assistant.id,
    status: TaskStatus.ASSIGNED,
    deadline: null
  })

  await clearCronLocks()
  await withCronContext(async (ctx) => {
    await ctx.getByName<{ run: () => Promise<void> }>('TaskOverdueCancelCron').run()
  })

  const after = async (id: string) => (await prisma.task.findUnique({ where: { id } }))?.status
  ok(
    '01 quá ân hạn → CANCELLED',
    (await after(overGrace.id)) === TaskStatus.CANCELLED,
    asExtra(await after(overGrace.id))
  )
  ok(
    '02 còn trong ân hạn → GIỮ NGUYÊN',
    (await after(inGrace.id)) === TaskStatus.IN_PROGRESS,
    asExtra(await after(inGrace.id))
  )
  ok(
    '03 đã nộp chờ duyệt → KHÔNG huỷ',
    (await after(submitted.id)) === TaskStatus.SUBMITTED,
    asExtra(await after(submitted.id))
  )
  ok('04 đang treo → KHÔNG huỷ', (await after(onHold.id)) === TaskStatus.ON_HOLD, asExtra(await after(onHold.id)))
  ok(
    '05 không có hạn nộp → KHÔNG huỷ',
    (await after(noDeadline.id)) === TaskStatus.ASSIGNED,
    asExtra(await after(noDeadline.id))
  )

  const cancelled = await prisma.task.findUnique({ where: { id: overGrace.id } })
  ok(
    '06 có ghi lý do huỷ',
    typeof cancelled?.statusReason === 'string' && cancelled.statusReason.length > 0,
    asExtra(cancelled?.statusReason)
  )

  // Thông báo đi qua hàng đợi BullMQ (bất đồng bộ) — phải CHỜ, đọc ngay sẽ flaky.
  const notifiedTo = async (recipientId: string) =>
    (await prisma.notification.count({ where: { recipientId, referenceType: 'TASK_AUTO_CANCELLED' } })) > 0
  ok('07 trợ lý được báo', await waitUntil(() => notifiedTo(assistant.id), 15_000, 500))
  ok('08 tác giả được báo', await waitUntil(() => notifiedTo(mangaka.id), 15_000, 500))

  const auditRow = await prisma.auditLog.findFirst({
    where: { entityType: 'TASK', entityId: overGrace.id, action: 'TRANSITION' }
  })
  ok('09 có ghi nhật ký kiểm toán', auditRow !== null)
  ok('10 actor là hệ thống (null)', auditRow?.actorId == null, asExtra(auditRow?.actorId))

  section('2. Cảnh báo hạn nộp phân biệt tuần/tháng')

  // WEEKLY còn 20 giờ, tiến độ 0% → RED.
  await prisma.schedule.update({
    where: { chapterId: chapter.id },
    data: { currentDeadline: new Date(Date.now() + 20 * HOUR) }
  })
  await clearCronLocks()
  await withCronContext(async (ctx) => {
    await ctx.getByName<{ run: () => Promise<void> }>('DeadlineWarningCron').run()
  })
  const redNoti = await prisma.notification.findFirst({
    where: { recipientId: mangaka.id, referenceType: { startsWith: 'DEADLINE_WARNING:RED:' } }
  })
  ok('11 WEEKLY còn 20h, chưa xong → cảnh báo mức RED', redNoti !== null)
  ok(
    '12 nội dung KHÔNG chứa số biến thiên (chống spam do dedupeKey băm content)',
    !/\d+%/.test(String(redNoti?.content ?? '')),
    asExtra(redNoti?.content)
  )

  section('3. Chặn số tiền phi lý')
  const editorUser = await makeUser('EDITOR')
  const editorTok = await login(editorUser.email)
  const contractBody = (valuation: number) => ({
    seriesId: series.id,
    boardDecisionId: '507f1f77bcf86cd799439099',
    contractType: 'FULL_BUYOUT',
    valuationAmount: valuation,
    publisherOwnershipPct: 100,
    mangakaOwnershipPct: 0,
    terminationClause: 'điều khoản chấm dứt',
    contractStart: '2026-01-01T00:00:00.000Z',
    contractEnd: '2027-01-01T00:00:00.000Z'
  })

  const huge = await req('POST', '/contracts', { token: editorTok, body: contractBody(999_999_999_999_999) })
  ok('13 định giá vượt trần → 422', huge.status === 422, asExtra(huge.status))

  const fractional = await req('POST', '/contracts', { token: editorTok, body: contractBody(1000.5) })
  ok('14 định giá có phần thập phân → 422', fractional.status === 422, asExtra(fractional.status))

  const negative = await req('POST', '/contracts', { token: editorTok, body: contractBody(-5) })
  ok('15 định giá âm → 422', negative.status === 422, asExtra(negative.status))

  ok(
    '16 thông báo lỗi là tiếng Việt',
    /[àáạảãâầấậèéẹẽêềếệìíịòóọôồốộơờớợùúụưừứựỳýỵđ]/i.test(String(huge.json?.message ?? '')),
    asExtra(huge.json?.message)
  )

  section('4. AppConfig key mới')
  const admin = await login(process.env.ADMIN_EMAIL ?? 'admin@flowtest.local')
  const cfg = await req('GET', '/admin/app-config', { token: admin })
  ok(
    '17 GET trả taskOverdueGraceHours',
    typeof cfg.json?.data?.taskOverdueGraceHours === 'number',
    asExtra(cfg.json?.data)
  )

  const patched = await req('PATCH', '/admin/app-config', { token: admin, body: { taskOverdueGraceHours: 48 } })
  ok(
    '18 PATCH lưu được',
    patched.json?.data?.taskOverdueGraceHours === 48,
    asExtra(patched.json?.data?.taskOverdueGraceHours)
  )

  const tooBig = await req('PATCH', '/admin/app-config', { token: admin, body: { taskOverdueGraceHours: 999 } })
  ok('19 vượt trần 168 giờ → 422', tooBig.status === 422, asExtra(tooBig.status))

  process.exit(summary(FLOW))
}

void main()
