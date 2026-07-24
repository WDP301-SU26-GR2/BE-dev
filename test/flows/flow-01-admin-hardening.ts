/**
 * FLOW 01 supplement — admin user commitment guard and Board roster cap.
 *
 * Uses the real API and the flowtest MongoDB.  The direct Prisma writes only
 * establish prerequisite domain state; every behaviour under test is invoked
 * through its public HTTP endpoint.
 */
import { BoardDecisionResult, DecisionType, RoleCode, SeriesStatus, TaskStatus, UserStatus } from '@prisma/client'
import {
  makeBoardDecision,
  makeBoardSession,
  makeChapterAt,
  makePageAt,
  makeSeriesAt,
  makeTaskAt,
  makeUser,
  prisma,
  seedRolesAndAdmin,
  setBoardConfig,
  wipeDb
} from './lib/seed.js'
import { clearTokenCache, login } from './lib/auth.js'
import { expectError, ok, req, resetCounters, section, summary } from './lib/http.js'

const FLOW = 'flow-01-admin-hardening'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@flowtest.local'

const userIsSoftDeleted = async (id: string) => {
  const row = await prisma.user.findUnique({ where: { id }, select: { deletedAt: true } })
  return row?.deletedAt instanceof Date
}

const listContainsUser = (json: unknown, userId: string) => {
  if (!json || typeof json !== 'object') return false
  const data = (json as { data?: unknown }).data
  if (!data || typeof data !== 'object') return false
  const items = (data as { items?: unknown }).items
  return (
    Array.isArray(items) &&
    items.some((item) => item && typeof item === 'object' && (item as { id?: unknown }).id === userId)
  )
}

const main = async () => {
  resetCounters()
  console.log(`\n##### ${FLOW} #####`)
  await wipeDb()
  await seedRolesAndAdmin()
  clearTokenCache()
  const adminToken = await login(ADMIN_EMAIL)

  section('F01-DEL — commitment guard and trash view')
  const mangaka = await makeUser(RoleCode.MANGAKA)
  const editor = await makeUser(RoleCode.EDITOR)
  const activeSeries = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: mangaka.id, editorId: editor.id })

  const deleteActiveMangaka = await req('DELETE', `/admin/users/${mangaka.id}`, { token: adminToken })
  expectError(deleteActiveMangaka, 409, 'Error.UserHasActiveCommitments', 'F01-DEL01 active mangaka DELETE is blocked')
  ok('F01-DEL01a blocked DELETE does not soft-delete the user', !(await userIsSoftDeleted(mangaka.id)))

  const banActiveMangaka = await req('PATCH', `/admin/users/${mangaka.id}/status`, {
    token: adminToken,
    body: { status: 'BANNED', reason: 'flowtest' }
  })
  expectError(banActiveMangaka, 409, 'Error.UserHasActiveCommitments', 'F01-DEL02 active mangaka BAN is blocked')
  const mangakaAfterBan = await prisma.user.findUnique({ where: { id: mangaka.id }, select: { status: true } })
  ok('F01-DEL02a blocked BAN leaves status ACTIVE', mangakaAfterBan?.status === UserStatus.ACTIVE)

  await prisma.series.update({ where: { id: activeSeries.id }, data: { status: SeriesStatus.COMPLETED } })
  const deleteResolvedMangaka = await req('DELETE', `/admin/users/${mangaka.id}`, { token: adminToken })
  ok('F01-DEL03 completed series opens DELETE gate', deleteResolvedMangaka.status === 200, deleteResolvedMangaka.raw)
  ok('F01-DEL03a successful DELETE sets deletedAt', await userIsSoftDeleted(mangaka.id))

  const trash = await req('GET', `/admin/users?onlyDeleted=true&search=${encodeURIComponent(mangaka.email)}`, {
    token: adminToken
  })
  const defaultList = await req('GET', `/admin/users?search=${encodeURIComponent(mangaka.email)}`, {
    token: adminToken
  })
  ok(
    'F01-DEL07 trash view contains the soft-deleted user',
    trash.status === 200 && listContainsUser(trash.json, mangaka.id),
    trash.raw
  )
  ok(
    'F01-DEL07a default view excludes the soft-deleted user',
    defaultList.status === 200 && !listContainsUser(defaultList.json, mangaka.id),
    defaultList.raw
  )
  const restore = await req('POST', `/admin/users/${mangaka.id}/restore`, { token: adminToken })
  const trashAfterRestore = await req(
    'GET',
    `/admin/users?onlyDeleted=true&search=${encodeURIComponent(mangaka.email)}`,
    { token: adminToken }
  )
  ok(
    'F01-DEL07b restore removes user from trash',
    restore.status === 201 && !listContainsUser(trashAfterRestore.json, mangaka.id),
    restore.raw
  )

  const editorCommitmentMangaka = await makeUser(RoleCode.MANGAKA)
  await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: editorCommitmentMangaka.id, editorId: editor.id })
  const deleteEditor = await req('DELETE', `/admin/users/${editor.id}`, { token: adminToken })
  expectError(deleteEditor, 409, 'Error.UserHasActiveCommitments', 'F01-DEL04 active-series editor DELETE is blocked')

  const assistant = await makeUser(RoleCode.ASSISTANT)
  const taskSeries = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: mangaka.id })
  const chapter = await makeChapterAt({ seriesId: taskSeries.id, chapterNumber: 1 })
  const page = await makePageAt({ chapterId: chapter.id, pageNumber: 1 })
  const task = await makeTaskAt({ pageId: page.id, assistantId: assistant.id, status: TaskStatus.IN_PROGRESS })
  const deleteAssistant = await req('DELETE', `/admin/users/${assistant.id}`, { token: adminToken })
  const banAssistant = await req('PATCH', `/admin/users/${assistant.id}/status`, {
    token: adminToken,
    body: { status: 'BANNED', reason: 'flowtest' }
  })
  expectError(
    deleteAssistant,
    409,
    'Error.UserHasActiveCommitments',
    'F01-DEL05 assistant with open task DELETE is blocked'
  )
  expectError(banAssistant, 409, 'Error.UserHasActiveCommitments', 'F01-DEL05a assistant with open task BAN is blocked')
  await prisma.task.update({ where: { id: task.id }, data: { status: TaskStatus.CANCELLED } })
  const deleteAssistantResolved = await req('DELETE', `/admin/users/${assistant.id}`, { token: adminToken })
  ok(
    'F01-DEL05b cancelled task opens assistant DELETE gate',
    deleteAssistantResolved.status === 200,
    deleteAssistantResolved.raw
  )

  const boardMember = await makeUser(RoleCode.BOARD_MEMBER)
  const boardSession = await makeBoardSession({ creatorId: editor.id, allowedEditorIds: [boardMember.id] })
  await makeBoardDecision({
    sessionId: boardSession.id,
    decisionType: DecisionType.SERIALIZATION,
    result: BoardDecisionResult.PENDING
  })
  const banBoardMember = await req('PATCH', `/admin/users/${boardMember.id}/status`, {
    token: adminToken,
    body: { status: 'BANNED', reason: 'flowtest' }
  })
  expectError(
    banBoardMember,
    409,
    'Error.UserHasActiveCommitments',
    'F01-DEL06 board member with pending decision BAN is blocked'
  )

  const reactivated = await makeUser(RoleCode.EDITOR, { status: UserStatus.BANNED })
  await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: mangaka.id, editorId: reactivated.id })
  const reactivate = await req('PATCH', `/admin/users/${reactivated.id}/status`, {
    token: adminToken,
    body: { status: 'ACTIVE', reason: 'reactivate' }
  })
  ok('F01-DEL08 reactivation is not blocked by existing commitments', reactivate.status === 200, reactivate.raw)

  section('ROSTER — hard maximum before odd-size normalization')
  await setBoardConfig({ boardTotalMembers: 5, quorumMin: 3 })
  for (let i = 0; i < 5; i += 1) await makeUser(RoleCode.BOARD_MEMBER)
  const rosterSeries = await makeSeriesAt(SeriesStatus.READY_TO_PITCH, { mangakaId: mangaka.id })
  const oversizedRoster = await req('GET', `/board/suggest-members?seriesId=${rosterSeries.id}&size=7`, {
    token: adminToken
  })
  expectError(oversizedRoster, 422, 'Error.RosterSizeTooLarge', 'ROSTER01 size above min(config, 9) is rejected')
  const oddRoster = await req('GET', `/board/suggest-members?seriesId=${rosterSeries.id}&size=3`, { token: adminToken })
  const oddItems = oddRoster.json?.data?.items
  ok(
    'ROSTER02 legal size returns an odd roster of at least three',
    oddRoster.status === 200 && Array.isArray(oddItems) && oddItems.length >= 3 && oddItems.length % 2 === 1,
    oddRoster.raw
  )
  const normalizedRoster = await req('GET', `/board/suggest-members?seriesId=${rosterSeries.id}&size=4`, {
    token: adminToken
  })
  const normalizedItems = normalizedRoster.json?.data?.items
  ok(
    'ROSTER03 even request is normalized to an odd roster',
    normalizedRoster.status === 200 && Array.isArray(normalizedItems) && normalizedItems.length % 2 === 1,
    normalizedRoster.raw
  )

  // Leave this flow as clean as it started. Role is intentionally retained by
  // wipeDb because the long-running server caches its ObjectIds.
  await wipeDb()
  const leftovers = await Promise.all([
    prisma.user.count(),
    prisma.series.count(),
    prisma.contract.count(),
    prisma.task.count(),
    prisma.studioAssignment.count(),
    prisma.boardDecision.count(),
    prisma.boardSession.count(),
    prisma.chapter.count(),
    prisma.page.count(),
    prisma.manuscript.count()
  ])
  ok(
    'AH-CLEAN all smoke-created domain collections are empty',
    leftovers.every((count) => count === 0),
    leftovers.join(',')
  )

  process.exitCode = summary(FLOW)
}

void main().catch((error) => {
  console.error(`[${FLOW}] FATAL`, error)
  process.exit(2)
})
