// Spec 24 smoke — Contract PDF export against a REAL API + MongoDB + Cloudflare R2.
//
// Vì sao script này tồn tại: jest map `@react-pdf/renderer` sang mock toàn cục
// (`moduleNameMapper` trong package.json) nên `pdf-render.service.spec.ts` KHÔNG hề chạy renderer
// thật — assertion `%PDF-` ở đó khớp với buffer giả của mock. Chỉ có script này (và flow-06)
// chứng minh: renderer thật chạy được, font tiếng Việt nạp được từ dist, file thật nằm trên R2,
// và key idempotent theo phiên bản nội dung.
//
// Prerequisite: server đã build đang chạy ở SMOKE_API (mặc định http://localhost:4100),
// R2 credentials thật trong .env.flowtest.
// Safety: từ chối mọi write trừ khi DATABASE_URL là localhost + database flow-test chuyên dụng.
//
// ⚠ Object PDF trên R2 KHÔNG bị xoá khi cleanup (infra chưa có deleteObject — ngoài scope Spec 24).
// Cron orphan-asset sẽ dọn Asset record; object R2 để lại là vết có chủ đích.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const API = (process.env.SMOKE_API ?? 'http://localhost:4100').replace(/\/+$/, '')
const PASSWORD = 'Test@123456'
const TAG_PREFIX = 'spec24smoke'
const TAG = `${TAG_PREFIX}-${process.pid}-${Date.now()}`
const DATABASE_URL = process.env.DATABASE_URL
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const FLOW_TEST_DATABASE = /flow[_-]?test$/i

function assertSafeWriteTarget() {
  if (!DATABASE_URL) throw new Error('SAFETY GUARD: DATABASE_URL is missing; refusing all writes')
  let parsed
  try {
    parsed = new URL(DATABASE_URL)
  } catch {
    throw new Error('SAFETY GUARD: DATABASE_URL is invalid; refusing all writes')
  }
  const host = parsed.hostname.toLowerCase()
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, '').split('/')[0] ?? '')
  if (!(LOCAL_HOSTS.has(host) && FLOW_TEST_DATABASE.test(databaseName))) {
    throw new Error(
      `SAFETY GUARD: refusing writes unless Mongo is localhost and database ends in flowtest, flow_test, or flow-test (host=${host}, database=${databaseName || '<none>'})`
    )
  }
}

function assertLocalApi() {
  const host = new URL(API).hostname.toLowerCase()
  if (!LOCAL_HOSTS.has(host)) throw new Error(`SAFETY GUARD: SMOKE_API must be localhost (host=${host})`)
}

assertSafeWriteTarget()
assertLocalApi()

const prisma = new PrismaClient()
const known = { userIds: new Set(), seriesIds: new Set(), contractIds: new Set(), sessionIds: new Set() }

let pass = 0
let fail = 0
const flat = (value) => JSON.stringify(value ?? {})

function check(name, condition, detail = '') {
  if (condition) {
    pass += 1
    console.log(`PASS ${name}`)
    return true
  }
  fail += 1
  console.error(`FAIL ${name}${detail ? ` | ${detail}` : ''}`)
  return false
}

function requireCheck(name, condition, detail = '') {
  if (!check(name, condition, detail)) throw new Error(`${name}: ${detail || 'assertion failed'}`)
}

async function request(method, path, { token, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {}
  return { status: response.status, json, text }
}

async function login(label, email) {
  const response = await request('POST', '/auth/login', { body: { email, password: PASSWORD } })
  const token = response.json?.data?.accessToken
  requireCheck(label, response.status === 201 && typeof token === 'string', `${response.status} ${flat(response.json)}`)
  return token
}

async function seed() {
  assertSafeWriteTarget()
  const roleCodes = ['MANGAKA', 'EDITOR', 'BOARD_MEMBER']
  const roles = await prisma.role.findMany({ where: { code: { in: roleCodes } }, select: { id: true, code: true } })
  if (roles.length !== roleCodes.length) throw new Error('Missing seeded roles; run pnpm seed first')
  const roleIds = Object.fromEntries(roles.map(({ code, id }) => [code, id]))
  const password = await bcrypt.hash(PASSWORD, 10)
  const phoneBase = Number(String(Date.now()).slice(-6))
  const createUser = (role, label, offset) =>
    prisma.user.create({
      data: {
        email: `${TAG}-${label}@test.local`,
        name: `${TAG} ${label}`,
        // Tên có dấu: chứng minh font Roboto nạp được, không vỡ glyph tiếng Việt.
        displayName: `Nguyễn Đặng ${label}`,
        password,
        phoneNumber: `+84925${String((phoneBase + offset) % 1_000_000).padStart(6, '0')}`,
        roleId: roleIds[role],
        status: 'ACTIVE',
        emailVerified: true,
        registrationType: 'SELF_REGISTERED',
        mustChangePassword: false
      }
    })
  const [mangaka, outsiderMangaka, editor, board] = await Promise.all([
    createUser('MANGAKA', 'mangaka', 1),
    createUser('MANGAKA', 'outsider', 2),
    createUser('EDITOR', 'editor', 3),
    createUser('BOARD_MEMBER', 'board', 4)
  ])
  for (const user of [mangaka, outsiderMangaka, editor, board]) known.userIds.add(user.id)

  const series = await prisma.series.create({
    data: {
      title: `${TAG} Kiếm Sĩ Cà Chua`,
      mangakaId: mangaka.id,
      editorId: editor.id,
      status: 'SERIALIZED',
      magazine: 'Tuần San NOVA',
      genres: [],
      statusHistory: []
    }
  })
  known.seriesIds.add(series.id)

  const session = await prisma.boardSession.create({
    data: {
      creatorId: board.id,
      status: 'CONCLUDED',
      allowedEditorIds: [board.id],
      title: `${TAG} Phiên serial hoá`,
      startTime: new Date(Date.now() - 60_000),
      endTime: new Date()
    }
  })
  known.sessionIds.add(session.id)
  const decision = await prisma.boardDecision.create({
    data: {
      boardSessionId: session.id,
      targetSeriesId: series.id,
      decisionType: 'SERIALIZATION',
      result: 'APPROVED',
      allowedEditorIds: [board.id],
      totalVotes: 1,
      approveCount: 1,
      rejectCount: 0,
      quorumMet: true,
      decidedAt: new Date()
    }
  })

  const baseContract = (status) => ({
    seriesId: series.id,
    mangakaId: mangaka.id,
    editorId: editor.id,
    boardDecisionId: decision.id,
    contractType: 'REVENUE_SHARE',
    valuationAmount: 120_000_000,
    publisherOwnershipPct: 70,
    mangakaOwnershipPct: 30,
    terminationClause: 'Bồi thường 10% giá trị định giá nếu NXB đơn phương chấm dứt.',
    contractStart: new Date(),
    contractEnd: new Date(Date.now() + 365 * 86_400_000),
    status
  })
  const executed = await prisma.contract.create({
    data: { ...baseContract('FULLY_EXECUTED'), mangakaSignedAt: new Date(), boardSignedAt: new Date() }
  })
  const draft = await prisma.contract.create({ data: baseContract('DRAFT') })
  known.contractIds.add(executed.id)
  known.contractIds.add(draft.id)

  await prisma.contractVersion.create({
    data: {
      contractId: executed.id,
      versionNumber: 1,
      valuationAmount: 120_000_000,
      publisherOwnershipPct: 70,
      mangakaOwnershipPct: 30,
      terminationClause: 'Bồi thường 10%',
      editedById: editor.id,
      createdAt: new Date()
    }
  })
  await prisma.contractSignature.create({
    data: { contractId: executed.id, userId: board.id, role: 'BOARD_EDITOR', signedAt: new Date() }
  })
  await prisma.paymentCondition.create({
    data: {
      contractId: executed.id,
      conditionType: 'RECURRING_CHAPTER',
      thresholdConfig: { everyNChapters: 5 },
      payoutAmount: 5_000_000,
      isRecurring: true,
      status: 'PENDING'
    }
  })

  return { mangaka, outsiderMangaka, editor, board, executed, draft }
}

async function cleanup({ print = false } = {}) {
  assertSafeWriteTarget()
  const users = await prisma.user.findMany({ where: { email: { contains: TAG_PREFIX } }, select: { id: true } })
  const userIds = [...new Set([...known.userIds, ...users.map(({ id }) => id)])]
  const seriesRows = await prisma.series.findMany({ where: { title: { contains: TAG_PREFIX } }, select: { id: true } })
  const seriesIds = [...new Set([...known.seriesIds, ...seriesRows.map(({ id }) => id)])]
  const contracts = await prisma.contract.findMany({ where: { seriesId: { in: seriesIds } }, select: { id: true } })
  const contractIds = [...new Set([...known.contractIds, ...contracts.map(({ id }) => id)])]
  const sessions = await prisma.boardSession.findMany({
    where: { OR: [{ title: { contains: TAG_PREFIX } }, { creatorId: { in: userIds } }] },
    select: { id: true }
  })
  const sessionIds = [...new Set([...known.sessionIds, ...sessions.map(({ id }) => id)])]

  if (contractIds.length) {
    await prisma.contractSignature.deleteMany({ where: { contractId: { in: contractIds } } })
    await prisma.contractVersion.deleteMany({ where: { contractId: { in: contractIds } } })
    await prisma.paymentCondition.deleteMany({ where: { contractId: { in: contractIds } } })
    await prisma.contract.deleteMany({ where: { id: { in: contractIds } } })
  }
  if (sessionIds.length) {
    await prisma.boardDecision.deleteMany({ where: { boardSessionId: { in: sessionIds } } })
    await prisma.boardSession.deleteMany({ where: { id: { in: sessionIds } } })
  }
  if (seriesIds.length) await prisma.series.deleteMany({ where: { id: { in: seriesIds } } })
  if (userIds.length) {
    await prisma.asset.deleteMany({ where: { uploadedBy: { in: userIds } } })
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  }
  const remaining = {
    users: await prisma.user.count({ where: { email: { contains: TAG_PREFIX } } }),
    series: await prisma.series.count({ where: { title: { contains: TAG_PREFIX } } }),
    contracts: await prisma.contract.count({ where: { id: { in: contractIds } } }),
    assets: await prisma.asset.count({ where: { uploadedBy: { in: userIds } } })
  }
  if (print) console.log('cleanup remaining:', flat(remaining))
  return remaining
}

async function main() {
  console.log(`\n##### smoke-spec24 (contract PDF) — API ${API} #####`)
  const { mangaka, outsiderMangaka, editor, board, executed, draft } = await seed()
  const editorToken = await login('S24-P0-01 editor login', editor.email)
  const mangakaToken = await login('S24-P0-02 mangaka login', mangaka.email)
  const outsiderToken = await login('S24-P0-03 outsider mangaka login', outsiderMangaka.email)
  const boardToken = await login('S24-P0-04 board login', board.email)

  // ── Phase 1: export lần đầu → render thật + upload R2 ───────────────────────────────
  const first = await request('GET', `/contracts/${executed.id}/pdf`, { token: editorToken })
  requireCheck('S24-P1-01 Editor export PDF → 200', first.status === 200, `${first.status} ${flat(first.json)}`)
  const firstKey = first.json?.data?.key
  requireCheck(
    'S24-P1-02 response có downloadUrl + key định danh theo phiên bản nội dung',
    typeof first.json?.data?.downloadUrl === 'string' && firstKey === `contracts/${executed.id}/contract-v1-a0.pdf`,
    flat(first.json?.data)
  )

  // ── Phase 2: file THẬT trên R2 — đây là phần jest mock không bao giờ chứng minh được ─
  const downloaded = await fetch(first.json.data.downloadUrl, { signal: AbortSignal.timeout(30_000) })
  const bytes = Buffer.from(await downloaded.arrayBuffer())
  requireCheck('S24-P2-01 presigned URL tải được → 200', downloaded.status === 200, `${downloaded.status}`)
  requireCheck(
    'S24-P2-02 content-type là application/pdf',
    (downloaded.headers.get('content-type') ?? '').includes('application/pdf'),
    `${downloaded.headers.get('content-type')}`
  )
  requireCheck(
    'S24-P2-03 magic bytes %PDF- (renderer THẬT chạy, không phải mock jest)',
    bytes.subarray(0, 5).toString() === '%PDF-',
    bytes.subarray(0, 16).toString('hex')
  )
  requireCheck('S24-P2-04 file có kích thước hợp lý (>3KB, font đã nhúng)', bytes.length > 3_000, `${bytes.length} bytes`)

  // ── Phase 3: idempotent — lần 2 cùng key, KHÔNG tạo Asset trùng ─────────────────────
  const assetsBefore = await prisma.asset.count({ where: { filePath: firstKey } })
  const second = await request('GET', `/contracts/${executed.id}/pdf`, { token: editorToken })
  requireCheck('S24-P3-01 export lần 2 → 200', second.status === 200)
  requireCheck('S24-P3-02 cùng key (không sinh phiên bản mới)', second.json?.data?.key === firstKey, flat(second.json?.data))
  const assetsAfter = await prisma.asset.count({ where: { filePath: firstKey } })
  requireCheck(
    'S24-P3-03 KHÔNG tạo Asset trùng khi cache-hit key',
    assetsAfter === assetsBefore && assetsAfter === 1,
    `before=${assetsBefore} after=${assetsAfter}`
  )
  requireCheck(
    'S24-P3-04 Asset ghi assetType=DOCUMENT',
    (await prisma.asset.findFirst({ where: { filePath: firstKey }, select: { assetType: true } }))?.assetType ===
      'DOCUMENT'
  )

  // ── Phase 4: RBAC — đúng người trong cuộc mới tải được ──────────────────────────────
  requireCheck(
    'S24-P4-01 Mangaka của hợp đồng tải được',
    (await request('GET', `/contracts/${executed.id}/pdf`, { token: mangakaToken })).status === 200
  )
  requireCheck(
    'S24-P4-02 BOARD_MEMBER tải được',
    (await request('GET', `/contracts/${executed.id}/pdf`, { token: boardToken })).status === 200
  )
  const outsider = await request('GET', `/contracts/${executed.id}/pdf`, { token: outsiderToken })
  requireCheck(
    'S24-P4-03 Mangaka ngoài cuộc → 403',
    outsider.status === 403,
    `${outsider.status} ${flat(outsider.json)}`
  )

  // ── Phase 5: gate trạng thái — chỉ FULLY_EXECUTED trở đi ────────────────────────────
  const draftExport = await request('GET', `/contracts/${draft.id}/pdf`, { token: editorToken })
  requireCheck(
    'S24-P5-01 contract DRAFT → 409 Error.ContractNotExecutedForPdf',
    draftExport.status === 409 && draftExport.json?.code === 'Error.ContractNotExecutedForPdf',
    `${draftExport.status} ${flat(draftExport.json)}`
  )
  requireCheck(
    'S24-P5-02 message lỗi là tiếng Việt (registry Spec 21)',
    /[À-ɏḀ-ỿĐđ]/u.test(String(draftExport.json?.message ?? '')),
    flat(draftExport.json?.message)
  )
  const badId = await request('GET', '/contracts/not-an-objectid/pdf', { token: editorToken })
  requireCheck('S24-P5-03 id rác → 404 (không phải 500 P2023)', badId.status === 404, `${badId.status}`)

  // ── Phase 6: cleanup ────────────────────────────────────────────────────────────────
  const remaining = await cleanup({ print: true })
  requireCheck(
    'S24-P6-01 cleanup không sót row nào',
    Object.values(remaining).every((count) => count === 0),
    flat(remaining)
  )
  console.log(`PASS ${pass}/${pass + fail}`)
}

main()
  .catch((error) => {
    console.error('ERR', error)
    if (fail === 0) fail += 1
  })
  .finally(async () => {
    await cleanup({ print: fail > 0 }).catch((error) => console.error('cleanup error', error))
    await prisma.$disconnect()
    if (fail > 0) console.error(`FAIL ${pass}/${pass + fail}`)
    process.exit(fail > 0 ? 1 : 0)
  })
