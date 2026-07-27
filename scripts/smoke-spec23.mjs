// Spec 23 smoke — Redis read-cache against a REAL API + MongoDB + Redis.
//
// Vì sao script này tồn tại: unit test của CacheService chạy trên Redis mock, và 7 service tiêu thụ
// cache đều được test bằng double. Không có gì trong unit test chứng minh: (a) key thật sinh đúng
// định dạng version-key, (b) cache thật sự phục vụ lần đọc thứ 2, (c) bumpVersion thật sự được gọi
// từ đường nghiệp vụ, (d) Redis chết thì route vẫn 200 (fail-open). Đó là 4 thứ script này đo.
//
// Prerequisite: server đã build đang chạy ở SMOKE_API (mặc định http://localhost:4100) với
// .env.flowtest (READ_CACHE_ENABLED không set = true).
// Safety: từ chối mọi write trừ khi DATABASE_URL là localhost + database flow-test chuyên dụng.
//
// Fail-open phase cần dừng Redis. Mặc định BỎ QUA (không tự ý đụng container của máy dev).
// Bật bằng:  SMOKE_REDIS_CONTAINER=<tên container> node scripts/smoke-spec23.mjs
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import Redis from 'ioredis'
import bcrypt from 'bcrypt'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const API = (process.env.SMOKE_API ?? 'http://localhost:4100').replace(/\/+$/, '')
const PASSWORD = 'Test@123456'
const TAG_PREFIX = 'spec23smoke'
const TAG = `${TAG_PREFIX}-${process.pid}-${Date.now()}`
const DATABASE_URL = process.env.DATABASE_URL
const REDIS_URL = process.env.REDIS_URL
const REDIS_CONTAINER = process.env.SMOKE_REDIS_CONTAINER ?? ''
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
if (!REDIS_URL) throw new Error('SAFETY GUARD: REDIS_URL is missing')

const prisma = new PrismaClient()
const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true })
const known = { userIds: new Set(), emails: new Set(), seriesIds: new Set() }

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

async function request(method, path, { token, body, timeoutMs = 15_000 } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
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

async function seedMangakaAndSeries() {
  assertSafeWriteTarget()
  const role = await prisma.role.findFirst({ where: { code: 'MANGAKA' }, select: { id: true } })
  if (!role) throw new Error('Missing seeded MANGAKA role; run pnpm seed first')
  const password = await bcrypt.hash(PASSWORD, 10)
  const phoneBase = Number(String(Date.now()).slice(-6))
  const mangaka = await prisma.user.create({
    data: {
      email: `${TAG}-mangaka@test.local`,
      name: `${TAG} mangaka`,
      displayName: 'Spec23 Mangaka',
      password,
      phoneNumber: `+84924${String(phoneBase % 1_000_000).padStart(6, '0')}`,
      roleId: role.id,
      status: 'ACTIVE',
      emailVerified: true,
      registrationType: 'SELF_REGISTERED',
      mustChangePassword: false
    }
  })
  known.userIds.add(mangaka.id)
  known.emails.add(mangaka.email)
  const series = await prisma.series.create({
    data: { title: `${TAG} Series`, mangakaId: mangaka.id, status: 'SERIALIZED', genres: [], statusHistory: [] }
  })
  known.seriesIds.add(series.id)
  return { mangaka, series }
}

async function cleanup({ print = false } = {}) {
  assertSafeWriteTarget()
  const users = await prisma.user.findMany({ where: { email: { contains: TAG_PREFIX } }, select: { id: true } })
  const userIds = [...new Set([...known.userIds, ...users.map(({ id }) => id)])]
  const seriesRows = await prisma.series.findMany({ where: { title: { contains: TAG_PREFIX } }, select: { id: true } })
  const seriesIds = [...new Set([...known.seriesIds, ...seriesRows.map(({ id }) => id)])]
  if (seriesIds.length) await prisma.series.deleteMany({ where: { id: { in: seriesIds } } })
  if (userIds.length) {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  }
  const remaining = {
    users: await prisma.user.count({ where: { email: { contains: TAG_PREFIX } } }),
    series: await prisma.series.count({ where: { title: { contains: TAG_PREFIX } } })
  }
  if (print) console.log('cleanup remaining:', flat(remaining))
  return remaining
}

const cacheKeys = () => redis.keys('cache:pubseries:*')

async function main() {
  console.log(`\n##### smoke-spec23 (read-cache) — API ${API} #####`)
  await redis.connect()
  requireCheck('S23-P0-01 Redis reachable', (await redis.ping()) === 'PONG')

  // ── Phase 1: cache MISS → key sinh đúng định dạng version-key ─────────────────────────
  await redis.del('cache:ver:pubseries')
  for (const key of await cacheKeys()) await redis.del(key)
  const first = await request('GET', '/public/series')
  requireCheck('S23-P1-01 GET /public/series → 200', first.status === 200, flat(first.json))
  const keysAfterFirst = await cacheKeys()
  requireCheck(
    'S23-P1-02 cache key sinh ra đúng dạng cache:pubseries:v0:list:*',
    keysAfterFirst.some((key) => key.startsWith('cache:pubseries:v0:list:')),
    flat(keysAfterFirst)
  )

  // ── Phase 2: cache HIT → lần 2 trả hệt lần 1, không sinh thêm key ────────────────────
  const second = await request('GET', '/public/series')
  requireCheck('S23-P2-01 GET lần 2 → 200', second.status === 200)
  requireCheck(
    'S23-P2-02 payload lần 2 giống hệt lần 1 (cache không phá shape)',
    JSON.stringify(second.json?.data) === JSON.stringify(first.json?.data),
    'payload mismatch'
  )
  requireCheck(
    'S23-P2-03 không sinh thêm key cho cùng query',
    (await cacheKeys()).length === keysAfterFirst.length,
    flat(await cacheKeys())
  )

  // ── Phase 3: offset > 0 KHÔNG được cache (chống key-explosion) ───────────────────────
  const beforeOffset = (await cacheKeys()).length
  const offsetResponse = await request('GET', '/public/series?offset=20')
  requireCheck('S23-P3-01 GET ?offset=20 → 200', offsetResponse.status === 200)
  requireCheck(
    'S23-P3-02 offset>0 không tạo key cache',
    (await cacheKeys()).length === beforeOffset,
    flat(await cacheKeys())
  )

  // ── Phase 4: invalidation THẬT qua đường nghiệp vụ ──────────────────────────────────
  // PATCH /series/:id đi qua SeriesMetadataService → bumpVersion('pubseries').
  // Đây là phần quan trọng nhất: chứng minh CacheService thật được DI inject (không phải stub)
  // và bump chảy tới Redis thật.
  const { mangaka, series } = await seedMangakaAndSeries()
  const token = await login('S23-P4-00 mangaka login', mangaka.email)
  const versionBefore = Number((await redis.get('cache:ver:pubseries')) ?? '0')
  await request('GET', '/public/series') // đảm bảo có key ở version hiện tại
  const newTitle = `${TAG} Series Renamed`
  const patched = await request('PATCH', `/series/${series.id}`, { token, body: { title: newTitle } })
  requireCheck('S23-P4-01 PATCH /series/:id → 200', patched.status === 200, flat(patched.json))
  const versionAfter = Number((await redis.get('cache:ver:pubseries')) ?? '0')
  requireCheck(
    'S23-P4-02 bumpVersion CHẠY THẬT (cache:ver:pubseries tăng)',
    versionAfter > versionBefore,
    `before=${versionBefore} after=${versionAfter}`
  )
  const afterBump = await request('GET', '/public/series?limit=50')
  const titles = (afterBump.json?.data?.items ?? []).map((item) => item.title)
  requireCheck(
    'S23-P4-03 catalog trả title MỚI ngay sau bump (không chờ hết TTL)',
    titles.includes(newTitle),
    flat(titles.filter((title) => String(title).includes(TAG_PREFIX)))
  )
  requireCheck(
    'S23-P4-04 key mới nằm ở version sau bump',
    (await cacheKeys()).some((key) => key.startsWith(`cache:pubseries:v${versionAfter}:`)),
    flat(await cacheKeys())
  )

  // ── Phase 5: KHÔNG cache signed URL ─────────────────────────────────────────────────
  // Signed URL TTL 900s nhưng cache TTL 120s → nếu cache nhầm URL đã ký thì 2 lần đọc sẽ
  // trả URL giống hệt. Chữ ký phải khác nhau giữa 2 request (ký lại mỗi lần).
  const withCover = (await request('GET', '/public/series?limit=50')).json?.data?.items ?? []
  const covered = withCover.find((item) => typeof item.coverImageUrl === 'string' && item.coverImageUrl.length > 0)
  if (covered) {
    const again = (await request('GET', '/public/series?limit=50')).json?.data?.items ?? []
    const same = again.find((item) => item.id === covered.id)
    check(
      'S23-P5-01 coverImageUrl được ký lại mỗi request (không cache signed URL)',
      same?.coverImageUrl !== covered.coverImageUrl,
      'signed URL giống hệt giữa 2 request — nghi cache nhầm URL đã ký'
    )
  } else {
    console.log('SKIP S23-P5-01 — không có series nào kèm coverImage để so chữ ký')
  }

  // ── Phase 6: fail-open khi Redis chết (opt-in) ──────────────────────────────────────
  if (REDIS_CONTAINER) {
    await execFileAsync('docker', ['stop', REDIS_CONTAINER])
    try {
      const degraded = await request('GET', '/public/series', { timeoutMs: 25_000 })
      requireCheck('S23-P6-01 Redis chết → /public/series vẫn 200 (fail-open)', degraded.status === 200)
      const degradedVote = await request('GET', '/vote/context', { timeoutMs: 25_000 })
      requireCheck('S23-P6-02 Redis chết → /vote/context vẫn 200 (fail-open)', degradedVote.status === 200)
    } finally {
      await execFileAsync('docker', ['start', REDIS_CONTAINER])
      await new Promise((resolve) => setTimeout(resolve, 4_000))
    }
    const recovered = await request('GET', '/public/series')
    requireCheck('S23-P6-03 Redis sống lại → 200', recovered.status === 200)
  } else {
    console.log('SKIP S23-P6 fail-open — set SMOKE_REDIS_CONTAINER=<container> để bật phase này')
  }

  // ── Phase 7: cleanup ────────────────────────────────────────────────────────────────
  const remaining = await cleanup({ print: true })
  requireCheck(
    'S23-P7-01 cleanup không sót row nào',
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
    await Promise.allSettled([prisma.$disconnect(), redis.quit()])
    if (fail > 0) console.error(`FAIL ${pass}/${pass + fail}`)
    process.exit(fail > 0 ? 1 : 0)
  })
