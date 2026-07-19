// Spec 22 smoke against a real local/flowtest MongoDB, API, and Redis.
// Prerequisite: built server already running at SMOKE_API (default http://localhost:4100).
// Safety: this script refuses every write unless DATABASE_URL is both localhost and a dedicated flowtest database.
import 'dotenv/config'
import { MongoClient, ObjectId } from 'mongodb'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const API = (process.env.SMOKE_API ?? 'http://localhost:4100').replace(/\/+$/, '')
const PASSWORD = 'Test@123456'
const TAG_PREFIX = 'spec22smoke'
const TAG = `${TAG_PREFIX}-${process.pid}-${Date.now()}`
const DATABASE_URL = process.env.DATABASE_URL
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

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
  const safe = LOCAL_HOSTS.has(host) && databaseName.toLowerCase().includes('flowtest')
  if (!safe) {
    throw new Error(
      `SAFETY GUARD: refusing writes unless Mongo is localhost and its database contains flowtest (host=${host}, database=${databaseName || '<none>'})`
    )
  }
  return { host, databaseName }
}

function assertLocalApi() {
  const host = new URL(API).hostname.toLowerCase()
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`SAFETY GUARD: SMOKE_API must be localhost (received host=${host})`)
  }
}

const safeTarget = assertSafeWriteTarget()
assertLocalApi()
const prisma = new PrismaClient()
const mongo = new MongoClient(DATABASE_URL)
const known = {
  userIds: new Set(),
  emails: new Set(),
  seriesIds: new Set(),
  nameIds: new Set(),
  sessionIds: new Set(),
  decisionIds: new Set()
}

let pass = 0
let fail = 0
const flat = (value) => JSON.stringify(value ?? {})
const hasVietnamese = (value) => /[\u00c0-\u024f\u1e00-\u1effĐđ]/u.test(String(value ?? ''))

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
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000)
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {}
  return { status: response.status, json, text }
}

async function expectStatus(label, method, path, expectedStatus, options) {
  const response = await request(method, path, options)
  requireCheck(label, response.status === expectedStatus, `${response.status} ${flat(response.json ?? response.text)}`)
  return response.json?.data
}

async function login(label, email) {
  const response = await request('POST', '/auth/login', { body: { email, password: PASSWORD } })
  const token = response.json?.data?.accessToken
  requireCheck(label, response.status === 201 && typeof token === 'string', `${response.status} ${flat(response.json)}`)
  return token
}

async function taggedIds() {
  const users = await prisma.user.findMany({
    where: { email: { contains: TAG_PREFIX } },
    select: { id: true, email: true }
  })
  const userIds = [...new Set([...known.userIds, ...users.map(({ id }) => id)])]
  const series = await prisma.series.findMany({
    where: { title: { contains: TAG_PREFIX } },
    select: { id: true }
  })
  const seriesIds = [...new Set([...known.seriesIds, ...series.map(({ id }) => id)])]
  const names = await prisma.name.findMany({ where: { seriesId: { in: seriesIds } }, select: { id: true } })
  const nameIds = [...new Set([...known.nameIds, ...names.map(({ id }) => id)])]
  const sessions = await prisma.boardSession.findMany({
    where: { OR: [{ title: { contains: TAG_PREFIX } }, { creatorId: { in: userIds } }] },
    select: { id: true }
  })
  const sessionIds = [...new Set([...known.sessionIds, ...sessions.map(({ id }) => id)])]
  const decisions = await prisma.boardDecision.findMany({
    where: { OR: [{ targetSeriesId: { in: seriesIds } }, { boardSessionId: { in: sessionIds } }] },
    select: { id: true }
  })
  return {
    userIds,
    emails: [...new Set([...known.emails, ...users.map(({ email }) => email)])],
    seriesIds,
    nameIds,
    sessionIds,
    decisionIds: [...new Set([...known.decisionIds, ...decisions.map(({ id }) => id)])]
  }
}

async function cleanup({ print = false } = {}) {
  assertSafeWriteTarget()
  const ids = await taggedIds()
  const entityIds = [...ids.seriesIds, ...ids.nameIds, ...ids.sessionIds, ...ids.decisionIds]

  await prisma.notification.deleteMany({
    where: {
      OR: [
        { recipientId: { in: ids.userIds } },
        { referenceId: { in: [...ids.seriesIds, ...ids.nameIds] } }
      ]
    }
  })
  await prisma.revisionRequest.deleteMany({
    where: {
      OR: [
        { seriesId: { in: ids.seriesIds } },
        { targetId: { in: [...ids.seriesIds, ...ids.nameIds] } },
        { requestedBy: { in: ids.userIds } },
        { recipientId: { in: ids.userIds } }
      ]
    }
  })
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: ids.userIds } }, { entityId: { in: entityIds } }] }
  })
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids.userIds } } })
  await prisma.otpRequest.deleteMany({ where: { email: { in: ids.emails } } })
  await prisma.seriesReport.deleteMany({
    where: { OR: [{ seriesId: { in: ids.seriesIds } }, { boardDecisionId: { in: ids.decisionIds } }] }
  })
  await prisma.boardMessage.deleteMany({ where: { sessionId: { in: ids.sessionIds } } })
  await prisma.boardDecision.deleteMany({ where: { id: { in: ids.decisionIds } } })
  await prisma.boardSession.deleteMany({ where: { id: { in: ids.sessionIds } } })
  await prisma.name.deleteMany({ where: { id: { in: ids.nameIds } } })
  await prisma.series.deleteMany({ where: { id: { in: ids.seriesIds } } })
  await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } })

  const remaining = {
    User: await prisma.user.count({ where: { id: { in: ids.userIds } } }),
    Series: await prisma.series.count({ where: { id: { in: ids.seriesIds } } }),
    Name: await prisma.name.count({ where: { id: { in: ids.nameIds } } }),
    Notification: await prisma.notification.count({
      where: {
        OR: [
          { recipientId: { in: ids.userIds } },
          { referenceId: { in: [...ids.seriesIds, ...ids.nameIds] } }
        ]
      }
    }),
    RevisionRequest: await prisma.revisionRequest.count({
      where: { OR: [{ seriesId: { in: ids.seriesIds } }, { requestedBy: { in: ids.userIds } }] }
    }),
    AuditLog: await prisma.auditLog.count({
      where: { OR: [{ actorId: { in: ids.userIds } }, { entityId: { in: entityIds } }] }
    }),
    BoardDecision: await prisma.boardDecision.count({ where: { id: { in: ids.decisionIds } } }),
    BoardSession: await prisma.boardSession.count({ where: { id: { in: ids.sessionIds } } }),
    RefreshToken: await prisma.refreshToken.count({ where: { userId: { in: ids.userIds } } })
  }
  if (print) {
    console.log('Cleanup counts:')
    for (const [collection, count] of Object.entries(remaining)) console.log(`  ${collection}: ${count}`)
  }
  return remaining
}

async function seedUsers() {
  assertSafeWriteTarget()
  const roleCodes = ['MANGAKA', 'EDITOR']
  const roles = await prisma.role.findMany({
    where: { code: { in: roleCodes } },
    select: { id: true, code: true }
  })
  if (roles.length !== roleCodes.length) throw new Error('Missing seeded MANGAKA/EDITOR roles; run pnpm seed first')
  const roleIds = Object.fromEntries(roles.map(({ code, id }) => [code, id]))
  const password = await bcrypt.hash(PASSWORD, 10)
  const phoneBase = Number(String(Date.now()).slice(-6))
  const createUser = (role, label, offset) =>
    prisma.user.create({
      data: {
        email: `${TAG}-${label}@test.local`,
        name: `${TAG} ${label}`,
        displayName: `Spec22 ${label}`,
        password,
        phoneNumber: `+84923${String((phoneBase + offset) % 1_000_000).padStart(6, '0')}`,
        roleId: roleIds[role],
        status: 'ACTIVE',
        emailVerified: true,
        registrationType: 'SELF_REGISTERED',
        mustChangePassword: false
      }
    })
  const [mangaka, editor1, editor2] = await Promise.all([
    createUser('MANGAKA', 'mangaka', 1),
    createUser('EDITOR', 'editor1', 2),
    createUser('EDITOR', 'editor2', 3)
  ])
  for (const user of [mangaka, editor1, editor2]) {
    known.userIds.add(user.id)
    known.emails.add(user.email)
  }
  return { mangaka, editor1, editor2 }
}

function proposalBody(label) {
  return {
    title: `${TAG_PREFIX} ${TAG} ${label}`,
    genres: ['ACTION'],
    demographic: 'SHONEN',
    publicationType: 'WEEKLY',
    synopsis: `${TAG} synopsis ${label}`,
    characterDesigns: [`${TAG}/character-${label}.png`],
    estimatedLength: 12,
    namePages: [{ pageNumber: 1, fileUrl: `${TAG}/name-${label}-1.png` }]
  }
}

async function waitForSeriesStatus(seriesId, token, expected, label) {
  let last
  for (let attempt = 0; attempt < 30; attempt += 1) {
    last = await request('GET', `/series/${seriesId}`, { token })
    if (last.status === 200 && last.json?.data?.status === expected) {
      check(label, true)
      return last.json.data
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  requireCheck(label, false, flat(last?.json))
}

async function rawSeries(seriesId) {
  const database = mongo.db(safeTarget.databaseName)
  return await database.collection('Series').findOne({ _id: new ObjectId(seriesId) })
}

async function simulateBoardReject(seriesId, reason) {
  assertSafeWriteTarget()
  console.log(`[seed-direct] series ${seriesId} → REJECTED (${reason})`)
  return await prisma.series.update({
    where: { id: seriesId },
    data: { status: 'REJECTED', statusReason: reason }
  })
}

async function createRejectedSeries(label, tokens, phaseStepStart) {
  const phaseLabel = (offset) => `S22-P6-${String(phaseStepStart + offset).padStart(2, '0')}`
  const created = await expectStatus(
    `${phaseLabel(0)} create ${label} proposal via API`,
    'POST',
    '/series/proposals',
    201,
    { token: tokens.mangaka, body: proposalBody(label) }
  )
  const seriesId = created.series.id
  const nameId = created.name.id
  known.seriesIds.add(seriesId)
  known.nameIds.add(nameId)
  await expectStatus(`${phaseLabel(1)} submit ${label} via API`, 'POST', `/series/${seriesId}/submit`, 201, {
    token: tokens.mangaka
  })
  await expectStatus(`${phaseLabel(2)} claim ${label} via API`, 'POST', `/series/${seriesId}/claim`, 201, {
    token: tokens.editor2
  })
  await expectStatus(
    `${phaseLabel(3)} approve ${label} proposal via API`,
    'POST',
    `/series/${seriesId}/proposal/approve`,
    201,
    { token: tokens.editor2 }
  )
  await expectStatus(
    `${phaseLabel(4)} approve ${label} Name via API`,
    'POST',
    `/series/${seriesId}/names/${nameId}/approve`,
    201,
    { token: tokens.editor2 }
  )
  await waitForSeriesStatus(seriesId, tokens.mangaka, 'READY_TO_PITCH', `${phaseLabel(5)} ${label} READY_TO_PITCH`)
  await expectStatus(`${phaseLabel(6)} pitch ${label} via API`, 'POST', `/series/${seriesId}/pitch`, 201, {
    token: tokens.editor2
  })
  await simulateBoardReject(seriesId, `${TAG} board reject ${label}`)
  const rejected = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } })
  requireCheck(
    `${phaseLabel(7)} ${label} ground truth REJECTED/PITCHED`,
    rejected.status === 'REJECTED' && rejected.proposal?.status === 'PITCHED',
    flat({ status: rejected.status, proposalStatus: rejected.proposal?.status })
  )
  return { seriesId, nameId }
}

async function main() {
  console.log(
    `Spec 22 smoke target accepted: host=${safeTarget.host}, database=${safeTarget.databaseName}, api=${API}`
  )
  await cleanup()

  // Phase 1: only initial users are seeded directly; authentication is exercised through the API.
  const users = await seedUsers()
  const tokens = {
    mangaka: await login('S22-P1-01 Mangaka login returns accessToken', users.mangaka.email),
    editor1: await login('S22-P1-02 Editor 1 login returns accessToken', users.editor1.email),
    editor2: await login('S22-P1-03 Editor 2 login returns accessToken', users.editor2.email)
  }

  // Phase 2: create -> submit -> claim -> editor reject, entirely through HTTP.
  const created = await expectStatus('S22-P2-01 create proposal via API', 'POST', '/series/proposals', 201, {
    token: tokens.mangaka,
    body: proposalBody('primary')
  })
  const seriesId = created.series.id
  const nameId = created.name.id
  known.seriesIds.add(seriesId)
  known.nameIds.add(nameId)
  await expectStatus('S22-P2-02 submit proposal via API', 'POST', `/series/${seriesId}/submit`, 201, {
    token: tokens.mangaka
  })
  await expectStatus('S22-P2-03 Editor 1 claims via API', 'POST', `/series/${seriesId}/claim`, 201, {
    token: tokens.editor1
  })
  await expectStatus('S22-P2-04 Editor 1 rejects via API', 'POST', `/series/${seriesId}/reject`, 201, {
    token: tokens.editor1,
    body: { reason: `${TAG} initial editorial reject` }
  })
  const abandoned = await request('GET', `/series/${seriesId}`, { token: tokens.mangaka })
  requireCheck(
    'S22-P2-05 API detail is ABANDONED',
    abandoned.status === 200 && abandoned.json?.data?.status === 'ABANDONED',
    flat(abandoned.json)
  )
  const abandonedDb = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } })
  requireCheck(
    'S22-P2-06 DB proposal is REJECTED',
    abandonedDb.proposal?.status === 'REJECTED',
    flat(abandonedDb.proposal)
  )

  // Phase 3: reopen to a truly unassigned DRAFT, edit, resubmit, and let a different editor claim it.
  await expectStatus('S22-P3-01 Mangaka reopens ABANDONED series', 'POST', `/series/${seriesId}/reopen`, 201, {
    token: tokens.mangaka
  })
  const raw = await rawSeries(seriesId)
  const historyTail = raw?.statusHistory?.slice(-3).map(({ fromStatus, toStatus }) => `${fromStatus}->${toStatus}`)
  requireCheck(
    'S22-P3-02 raw Mongo truly unsets editorId and reviewStartedAt',
    raw != null &&
      !Object.prototype.hasOwnProperty.call(raw, 'editorId') &&
      !Object.prototype.hasOwnProperty.call(raw, 'reviewStartedAt'),
    flat(raw)
  )
  requireCheck('S22-P3-03 proposal reset to DRAFT without losing fields', raw?.proposal?.status === 'DRAFT' && raw?.proposal?.nameId != null, flat(raw?.proposal))
  const reopenedName = await prisma.name.findUniqueOrThrow({ where: { id: nameId } })
  requireCheck('S22-P3-04 proposal Name reset to DRAFT', reopenedName.status === 'DRAFT', flat(reopenedName))
  requireCheck(
    'S22-P3-05 history preserves DRAFT→IN_REVIEW→ABANDONED→DRAFT lifecycle',
    flat(historyTail) === flat(['DRAFT->IN_REVIEW', 'IN_REVIEW->ABANDONED', 'ABANDONED->DRAFT']),
    flat(historyTail)
  )
  await expectStatus('S22-P3-06 Mangaka edits reopened proposal', 'PUT', `/series/proposals/${seriesId}`, 200, {
    token: tokens.mangaka,
    body: { title: `${TAG_PREFIX} ${TAG} primary revised`, synopsis: `${TAG} revised synopsis` }
  })
  await expectStatus('S22-P3-07 Mangaka submits reopened proposal', 'POST', `/series/${seriesId}/submit`, 201, {
    token: tokens.mangaka
  })
  const queue = await request('GET', '/series', { token: tokens.editor2 })
  requireCheck(
    'S22-P3-08 Editor 2 sees reopened series in unassigned queue',
    queue.status === 200 && queue.json?.data?.items?.some(({ id }) => id === seriesId),
    flat(queue.json)
  )
  await expectStatus('S22-P3-09 Editor 2 claims reopened series', 'POST', `/series/${seriesId}/claim`, 201, {
    token: tokens.editor2
  })

  // Phase 4: finish review/pitch over HTTP; only the Board listener edge is simulated directly.
  await expectStatus('S22-P4-01 Editor 2 approves proposal', 'POST', `/series/${seriesId}/proposal/approve`, 201, {
    token: tokens.editor2
  })
  await expectStatus('S22-P4-02 Editor 2 approves proposal Name', 'POST', `/series/${seriesId}/names/${nameId}/approve`, 201, {
    token: tokens.editor2
  })
  await waitForSeriesStatus(seriesId, tokens.mangaka, 'READY_TO_PITCH', 'S22-P4-03 series becomes READY_TO_PITCH')
  await expectStatus('S22-P4-04 Editor 2 pitches series', 'POST', `/series/${seriesId}/pitch`, 201, {
    token: tokens.editor2
  })
  await simulateBoardReject(seriesId, `${TAG} board rejected serialization`)
  const boardRejected = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } })
  requireCheck(
    'S22-P4-05 Board ground truth is Series REJECTED + proposal PITCHED',
    boardRejected.status === 'REJECTED' && boardRejected.proposal?.status === 'PITCHED',
    flat({ status: boardRejected.status, proposalStatus: boardRejected.proposal?.status })
  )

  // Phase 5 + Phase 8 interleaved: reopen Board rework, reopen approved Name conditionally, then re-pitch.
  const reopenedReview = await expectStatus(
    'S22-P5-01 assigned Editor reopens Board-rejected review',
    'POST',
    `/series/${seriesId}/reopen-review`,
    201,
    { token: tokens.editor2, body: { reason: `${TAG} Board rework` } }
  )
  requireCheck(
    'S22-P5-02 reopen-review keeps editor and sets proposal revision',
    reopenedReview.status === 'IN_REVIEW' &&
      reopenedReview.editorId === users.editor2.id &&
      reopenedReview.proposal?.status === 'PROPOSAL_REVISION',
    flat(reopenedReview)
  )
  const reopenNotice = await prisma.notification.findFirst({
    where: {
      recipientId: users.mangaka.id,
      referenceId: seriesId,
      referenceType: 'SERIES_REOPENED_FOR_REVIEW'
    }
  })
  requireCheck('S22-P5-03 Mangaka receives reopen-review notification', Boolean(reopenNotice), flat(reopenNotice))

  await expectStatus(
    'S22-P8-01 Editor requests revision of previously APPROVED proposal Name',
    'POST',
    `/series/${seriesId}/names/${nameId}/request-revision`,
    201,
    { token: tokens.editor2, body: { reason: `${TAG} revise approved Name` } }
  )
  await expectStatus('S22-P8-02 Mangaka replaces Name pages', 'PUT', `/series/${seriesId}/names/${nameId}/pages`, 200, {
    token: tokens.mangaka,
    body: { pages: [{ pageNumber: 1, fileUrl: `${TAG}/name-primary-rework.png` }] }
  })
  await expectStatus('S22-P8-03 Mangaka resubmits Name', 'POST', `/series/${seriesId}/names/${nameId}/resubmit`, 201, {
    token: tokens.mangaka
  })
  const approvedAgain = await expectStatus(
    'S22-P8-04 Editor approves revised Name again',
    'POST',
    `/series/${seriesId}/names/${nameId}/approve`,
    201,
    { token: tokens.editor2 }
  )
  requireCheck('S22-P8-05 revised Name is APPROVED again', approvedAgain.status === 'APPROVED', flat(approvedAgain))

  await expectStatus('S22-P5-04 Mangaka edits proposal in rework', 'PUT', `/series/proposals/${seriesId}`, 200, {
    token: tokens.mangaka,
    body: { synopsis: `${TAG} Board rework synopsis`, characterDesigns: [`${TAG}/rework.png`] }
  })
  await expectStatus('S22-P5-05 Mangaka resubmits proposal', 'POST', `/series/${seriesId}/proposal/resubmit`, 201, {
    token: tokens.mangaka
  })
  await expectStatus('S22-P5-06 Editor approves revised proposal', 'POST', `/series/${seriesId}/proposal/approve`, 201, {
    token: tokens.editor2
  })
  await waitForSeriesStatus(seriesId, tokens.mangaka, 'READY_TO_PITCH', 'S22-P5-07 series returns READY_TO_PITCH')
  await expectStatus('S22-P5-08 Editor pitches series a second time', 'POST', `/series/${seriesId}/pitch`, 201, {
    token: tokens.editor2
  })

  // Phase 6: build two independent REJECTED fixtures through the API, then exercise both permanent exits.
  const withdrawFixture = await createRejectedSeries('withdraw', tokens, 1)
  await expectStatus(
    'S22-P6-09 REJECTED series can be permanently withdrawn',
    'POST',
    `/series/${withdrawFixture.seriesId}/withdraw`,
    201,
    { token: tokens.mangaka, body: { reason: `${TAG} Mangaka exits` } }
  )
  const withdrawNotice = await prisma.notification.findFirst({
    where: {
      recipientId: users.editor2.id,
      referenceId: withdrawFixture.seriesId,
      referenceType: 'SERIES_WITHDRAWN_AFTER_REJECT'
    }
  })
  requireCheck('S22-P6-10 assigned Editor receives withdraw-after-reject notification', Boolean(withdrawNotice), flat(withdrawNotice))

  const rejectFixture = await createRejectedSeries('editor-abandon', tokens, 11)
  const editorAbandoned = await expectStatus(
    'S22-P6-19 Editor can abandon a REJECTED series',
    'POST',
    `/series/${rejectFixture.seriesId}/reject`,
    201,
    { token: tokens.editor2, body: { reason: `${TAG} Editor exits` } }
  )
  requireCheck('S22-P6-20 Editor exit produces ABANDONED', editorAbandoned.status === 'ABANDONED', flat(editorAbandoned))

  // Phase 7: real API negatives, including role guards and translated Spec 21 error contract.
  const invalidReopen = await request('POST', `/series/${seriesId}/reopen`, { token: tokens.mangaka })
  requireCheck(
    'S22-P7-01 PITCHED cannot reopen to DRAFT',
    invalidReopen.status === 409 &&
      invalidReopen.json?.code === 'Error.InvalidSeriesTransition' &&
      hasVietnamese(invalidReopen.json?.message),
    flat(invalidReopen.json)
  )
  const editorCallsMangakaRoute = await request('POST', `/series/${seriesId}/reopen`, { token: tokens.editor2 })
  requireCheck(
    'S22-P7-02 Editor cannot call Mangaka reopen route',
    editorCallsMangakaRoute.status === 403,
    flat(editorCallsMangakaRoute.json)
  )
  const mangakaCallsEditorRoute = await request('POST', `/series/${seriesId}/reopen-review`, {
    token: tokens.mangaka,
    body: { reason: `${TAG} forbidden` }
  })
  requireCheck(
    'S22-P7-03 Mangaka cannot call Editor reopen-review route',
    mangakaCallsEditorRoute.status === 403,
    flat(mangakaCallsEditorRoute.json)
  )

  // Phase 9: cleanup every touched collection and prove no tagged/dependent rows remain.
  const remaining = await cleanup({ print: true })
  const remainingTotal = Object.values(remaining).reduce((sum, count) => sum + count, 0)
  requireCheck('S22-P9-01 cleanup leaves zero tagged/dependent rows', remainingTotal === 0, flat(remaining))
  console.log(`PASS ${pass}/${pass + fail}`)
}

main()
  .catch((error) => {
    console.error('ERR', error)
    if (fail === 0) fail += 1
  })
  .finally(async () => {
    await cleanup({ print: fail > 0 }).catch((error) => console.error('cleanup error', error))
    await Promise.allSettled([prisma.$disconnect(), mongo.close()])
    if (fail > 0) console.error(`FAIL ${pass}/${pass + fail}`)
    process.exit(fail > 0 ? 1 : 0)
  })
