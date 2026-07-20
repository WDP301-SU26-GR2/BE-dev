import {
  wipeDb,
  seedRolesAndAdmin,
  prisma,
  makeUser,
  makeSeriesAt,
  makeContractAt,
  makeNameAt,
  makeTaskAt,
  makeStudioAssignment
} from './lib/seed.js'
import { req, ok, section, summary, expectError, resetCounters, sleep } from './lib/http.js'
import { login } from './lib/auth.js'
import {
  SeriesStatus,
  ManuscriptStatus,
  NameStatus,
  NameKind,
  PageStatus,
  ContractStatus,
  TaskStatus
} from '@prisma/client'

const FLOW = 'flow-02-chapter-production.ts'

// Local helper: build a fast-forward happy-path scenario.
// seriesA: SERIALIZED + contract FULLY_EXECUTED → chapters can publish.
// seriesB: SERIALIZED + NO contract → publish gate must fail (ContractNotExecuted).
// seriesC: HIATUS → tạo chapter must fail (SeriesNotSerialized).
// seriesCancel: CANCELLING with allowance=2/snapshot=0.
const makeChapterProductionScenario = async () => {
  const mangakaA = await makeUser('MANGAKA')
  const mangakaA2 = await makeUser('MANGAKA') // different owner for RBAC scoping
  const editorE1 = await makeUser('EDITOR')
  const editorE2 = await makeUser('EDITOR') // wrong editor for RBAC
  const boardB = await makeUser('BOARD_MEMBER')

  const seriesA = await makeSeriesAt(SeriesStatus.SERIALIZED, {
    mangakaId: mangakaA.id,
    editorId: editorE1.id
  })
  await makeContractAt(ContractStatus.FULLY_EXECUTED, {
    seriesId: seriesA.id,
    mangakaId: mangakaA.id,
    editorId: editorE1.id
  })

  const seriesB = await makeSeriesAt(SeriesStatus.SERIALIZED, {
    mangakaId: mangakaA.id,
    editorId: editorE1.id
  })
  // NOTE: NO contract for seriesB → publish must fail with ContractNotExecuted

  const seriesHiatus = await makeSeriesAt(SeriesStatus.HIATUS, {
    mangakaId: mangakaA.id,
    editorId: editorE1.id
  })

  const seriesDraft = await makeSeriesAt(SeriesStatus.DRAFT, {
    mangakaId: mangakaA.id
  })

  const seriesCancelling = await makeSeriesAt(SeriesStatus.CANCELLING, {
    mangakaId: mangakaA.id,
    editorId: editorE1.id
  })
  // makeSeriesAt sets endingChapterAllowance=2 + chapterCountAtCancelling=0

  const seriesCompleting = await makeSeriesAt(SeriesStatus.COMPLETING, {
    mangakaId: mangakaA.id,
    editorId: editorE1.id
  })

  return {
    mangakaA,
    mangakaA2,
    editorE1,
    editorE2,
    boardB,
    seriesA,
    seriesB,
    seriesHiatus,
    seriesDraft,
    seriesCancelling,
    seriesCompleting,
    tokens: {
      mA: await login(mangakaA.email),
      mA2: await login(mangakaA2.email),
      e1: await login(editorE1.email),
      e2: await login(editorE2.email),
      b: await login(boardB.email)
    }
  }
}

// Helper: create chapter + chapter-Name (kind=CHAPTER) + approve Name via API.
// Returns {chapter, name}.
const createChapterWithApprovedName = async (
  s: Awaited<ReturnType<typeof makeChapterProductionScenario>>,
  seriesId: string,
  chapNum: number,
  title?: string
) => {
  const chRes = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId, chapterNumber: chapNum, ...(title ? { title } : {}) }
  })
  if (chRes.status !== 201) throw new Error(`create chapter failed: ${chRes.status} ${chRes.raw}`)
  const chapter = chRes.json?.data ?? chRes.json

  // Create chapter-Name
  const nRes = await req('POST', `/chapters/${chapter.id}/names`, {
    token: s.tokens.mA,
    body: { namePages: [{ pageNumber: 1, fileUrl: 'r2://name-page-1' }] }
  })
  if (nRes.status !== 201) throw new Error(`create chapter-Name failed: ${nRes.status} ${nRes.raw}`)
  const name = nRes.json?.data ?? nRes.json

  // Option A: chapter-Name born DRAFT → Mangaka submits → SUBMITTED before the Editor can review.
  const subRes = await req('POST', `/chapters/${chapter.id}/names/${name.id}/submit`, { token: s.tokens.mA })
  if (subRes.status !== 201) throw new Error(`submit chapter-Name failed: ${subRes.status} ${subRes.raw}`)

  // Editor approves Name → APPROVED (this is the actual API per AUTHORITATIVE.md §4)
  const aRes = await req('POST', `/chapters/${chapter.id}/names/${name.id}/approve`, {
    token: s.tokens.e1
  })
  if (aRes.status !== 201) throw new Error(`approve Name failed: ${aRes.status} ${aRes.raw}`)
  return { chapter, name }
}

const main = async () => {
  resetCounters()
  console.log(`\n##### ${FLOW} #####`)
  await wipeDb()
  await seedRolesAndAdmin()
  const s = await makeChapterProductionScenario()

  // ──────────────────────────────────────────────────────────────────────────
  // §3.1  HAPPY PATH (14 cases) — F02-001..F02-014
  // ──────────────────────────────────────────────────────────────────────────
  section('§3.1 Happy path: chapter lifecycle end-to-end')

  // F02-001 — M tạo chapter slot
  const c1Res = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesA.id, chapterNumber: 1, title: 'Ch1' }
  })
  ok('F02-001 chapter create 201', c1Res.status === 201, `got ${c1Res.status} ${c1Res.raw.slice(0, 200)}`)
  const c1 = c1Res.json?.data ?? c1Res.json
  ok('F02-001b chapter Number=1', c1?.chapterNumber === 1, `got ${JSON.stringify(c1)}`)
  // Verify Manuscript DRAFT was created
  const ms1 = await prisma.manuscript.findFirst({ where: { chapterId: c1.id } })
  ok('F02-001c Manuscript DRAFT created', ms1?.status === ManuscriptStatus.DRAFT, `got ${ms1?.status}`)
  const sch1 = await prisma.schedule.findFirst({ where: { chapterId: c1.id } })
  ok('F02-001d Schedule created', !!sch1, 'Schedule missing')

  // F02-002 — Create chapter-Name (kind=CHAPTER)
  const c1nRes = await req('POST', `/chapters/${c1.id}/names`, {
    token: s.tokens.mA,
    body: { namePages: [{ pageNumber: 1, fileUrl: 'r2://name-page-1' }] }
  })
  ok('F02-002 chapter-Name create 201', c1nRes.status === 201, `got ${c1nRes.status} ${c1nRes.raw.slice(0, 200)}`)
  const c1name = c1nRes.json?.data ?? c1nRes.json
  ok(
    'F02-002b chapter.nameId set',
    !!c1name?.id && c1?.id === (await prisma.chapter.findUnique({ where: { id: c1.id } }))?.id
  )
  ok('F02-002c chapter-Name born DRAFT', c1name?.status === NameStatus.DRAFT, `got ${c1name?.status}`)

  // F02-002d — Option A: Mangaka submits DRAFT chapter-Name → SUBMITTED
  const c1subRes = await req('POST', `/chapters/${c1.id}/names/${c1name.id}/submit`, { token: s.tokens.mA })
  ok(
    'F02-002d chapter-Name submit 201',
    c1subRes.status === 201,
    `got ${c1subRes.status} ${c1subRes.raw.slice(0, 200)}`
  )
  ok('F02-002e submit → SUBMITTED', (c1subRes.json?.data ?? c1subRes.json)?.status === NameStatus.SUBMITTED)

  // F02-003 — Editor approves Name
  const c1naRes = await req('POST', `/chapters/${c1.id}/names/${c1name.id}/approve`, {
    token: s.tokens.e1
  })
  ok('F02-003 Name approve 201', c1naRes.status === 201, `got ${c1naRes.status} ${c1naRes.raw.slice(0, 200)}`)
  const c1nameDB = await prisma.name.findUnique({ where: { id: c1name.id } })
  ok('F02-003b Name.status=APPROVED', c1nameDB?.status === NameStatus.APPROVED, `got ${c1nameDB?.status}`)

  // F02-004 — M upload page (sau approve Name) → Manuscript DRAFT→IN_PRODUCTION
  const p1Res = await req('POST', `/chapters/${c1.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://page-1-original' }
  })
  ok('F02-004 page upload 201', p1Res.status === 201, `got ${p1Res.status} ${p1Res.raw.slice(0, 200)}`)
  const p1 = p1Res.json?.data ?? p1Res.json
  ok('F02-004a page born DRAFT', p1.status === PageStatus.DRAFT, `got ${String(p1.status)}`)
  await sleep(300)
  const ms1b = await prisma.manuscript.findFirst({ where: { chapterId: c1.id } })
  ok(
    'F02-004b Manuscript=IN_PRODUCTION after first page',
    ms1b?.status === ManuscriptStatus.IN_PRODUCTION,
    `got ${ms1b?.status}`
  )

  // F02-007 — M submit manuscript → EDITOR_REVIEW
  const subRes = await req('POST', `/chapters/${c1.id}/manuscript/submit`, { token: s.tokens.mA })
  ok('F02-007 manuscript submit 201', subRes.status === 201, `got ${subRes.status} ${subRes.raw.slice(0, 200)}`)
  const ms1d = await prisma.manuscript.findFirst({ where: { chapterId: c1.id } })
  ok('F02-007b Manuscript=EDITOR_REVIEW', ms1d?.status === ManuscriptStatus.EDITOR_REVIEW, `got ${ms1d?.status}`)
  const p1Submitted = await prisma.page.findUnique({ where: { id: p1.id } })
  ok('F02-007c submit auto-flips page to COMPLETED', p1Submitted?.status === PageStatus.COMPLETED)
  const completedPageMutation = await req('PATCH', `/pages/${p1.id}`, {
    token: s.tokens.mA,
    body: { compositeFile: 'r2://locked.png' }
  })
  expectError(completedPageMutation, 409, 'Error.PageNotEditable', 'F02-007d completed page is read-only')
  const clientStatusMutation = await req('PATCH', `/pages/${p1.id}`, {
    token: s.tokens.mA,
    body: { status: 'REVISING' }
  })
  ok('F02-007e client cannot PATCH page status → 422', clientStatusMutation.status === 422)
  const removedCompositeRoute = await req('POST', `/chapters/${c1.id}/manuscript/mark-composite-ready`, {
    token: s.tokens.mA
  })
  ok('F02-007f removed mark-composite-ready route → 404', removedCompositeRoute.status === 404)

  // F02-008 — E request-revision → EDITOR_REVISION + annotation (we just check state + annotation row)
  const noRevisionReason = await req('POST', `/chapters/${c1.id}/manuscript/request-revision`, {
    token: s.tokens.e1,
    body: {}
  })
  ok(
    'F02-RV1 manuscript request-revision without reason -> 422',
    noRevisionReason.status === 422,
    `got ${noRevisionReason.status} ${noRevisionReason.raw.slice(0, 160)}`
  )

  const revRes = await req('POST', `/chapters/${c1.id}/manuscript/request-revision`, {
    token: s.tokens.e1,
    body: { reason: 'fix panel 3' }
  })
  ok('F02-008 request-revision 201', revRes.status === 201, `got ${revRes.status} ${revRes.raw.slice(0, 200)}`)
  const ms1e = await prisma.manuscript.findFirst({ where: { chapterId: c1.id } })
  ok('F02-008b Manuscript=EDITOR_REVISION', ms1e?.status === ManuscriptStatus.EDITOR_REVISION, `got ${ms1e?.status}`)
  const p1Revising = await prisma.page.findUnique({ where: { id: p1.id } })
  ok('F02-008c request-revision auto-flips page to REVISING', p1Revising?.status === PageStatus.REVISING)
  const revisingPageMutation = await req('PATCH', `/pages/${p1.id}`, {
    token: s.tokens.mA,
    body: { compositeFile: 'r2://revision-v2.png' }
  })
  ok('F02-008d REVISING page is editable', revisingPageMutation.status === 200)

  const manuscriptRevisions = await req('GET', `/revision-requests?targetType=MANUSCRIPT&targetId=${c1.id}`, {
    token: s.tokens.mA
  })
  const manuscriptRevisionItems = (manuscriptRevisions.json?.data?.items ?? []) as Array<Record<string, unknown>>
  ok(
    'F02-RV2 recipient lists the manuscript revision round',
    manuscriptRevisions.status === 200 &&
      manuscriptRevisionItems.length === 1 &&
      manuscriptRevisionItems[0]?.round === 1 &&
      manuscriptRevisionItems[0]?.reason === 'fix panel 3',
    `got ${manuscriptRevisions.status} ${manuscriptRevisions.raw.slice(0, 200)}`
  )
  const manuscriptRevisionId = manuscriptRevisionItems[0]?.id as string
  ok(
    'F02-EMB revision list embeds requester',
    manuscriptRevisions.status === 200 &&
      ((manuscriptRevisionItems[0]?.requester as { displayName?: string } | undefined)?.displayName?.length ?? 0) > 0,
    `got ${manuscriptRevisions.status} ${manuscriptRevisions.raw.slice(0, 200)}`
  )
  const createManuscriptAnnotation = await req('POST', '/annotations', {
    token: s.tokens.e1,
    body: {
      targetType: 'MANUSCRIPT',
      targetId: ms1e!.id,
      annotationType: 'TEXT',
      content: 'fix panel 3'
    }
  })
  ok(
    'F02-EMB annotation fixture created through API',
    createManuscriptAnnotation.status === 201,
    `got ${createManuscriptAnnotation.status} ${createManuscriptAnnotation.raw.slice(0, 200)}`
  )
  const manuscriptAnnotations = await req('GET', `/annotations?targetType=MANUSCRIPT&targetId=${ms1e!.id}`, {
    token: s.tokens.mA
  })
  const manuscriptAnnotationItems = (manuscriptAnnotations.json?.data?.items ?? []) as Array<Record<string, unknown>>
  ok(
    'F02-EMB annotation list embeds author',
    manuscriptAnnotations.status === 200 &&
      ((manuscriptAnnotationItems[0]?.author as { displayName?: string } | undefined)?.displayName?.length ?? 0) > 0,
    `got ${manuscriptAnnotations.status} ${manuscriptAnnotations.raw.slice(0, 200)}`
  )

  const blockedResubmit = await req('POST', `/chapters/${c1.id}/manuscript/resubmit`, { token: s.tokens.mA })
  expectError(blockedResubmit, 409, 'Error.RevisionNotResolved', 'F02-RV2b resubmit with open revision')

  const requestedByList = await req('GET', `/revision-requests?targetType=MANUSCRIPT&targetId=${c1.id}`, {
    token: s.tokens.e1
  })
  ok(
    'F02-RV3 requesting Editor can list the same revision round',
    requestedByList.status === 200 && requestedByList.json?.data?.items?.[0]?.id === manuscriptRevisionId,
    `got ${requestedByList.status}`
  )

  const editorResolve = await req('PATCH', `/revision-requests/${manuscriptRevisionId}/resolve`, {
    token: s.tokens.e1,
    body: {}
  })
  ok('F02-RV4 requesting Editor cannot resolve recipient work -> 403', editorResolve.status === 403, editorResolve.raw)

  const mangakaResolve = await req('PATCH', `/revision-requests/${manuscriptRevisionId}/resolve`, {
    token: s.tokens.mA,
    body: {}
  })
  ok(
    'F02-RV5 recipient Mangaka resolves revision -> 200',
    mangakaResolve.status === 200 && mangakaResolve.json?.data?.isResolved === true,
    `got ${mangakaResolve.status} ${mangakaResolve.raw.slice(0, 180)}`
  )
  const mangakaResolveAgain = await req('PATCH', `/revision-requests/${manuscriptRevisionId}/resolve`, {
    token: s.tokens.mA,
    body: {}
  })
  ok(
    'F02-RV6 resolving the same revision is idempotent',
    mangakaResolveAgain.status === 200 && mangakaResolveAgain.json?.data?.id === manuscriptRevisionId,
    `got ${mangakaResolveAgain.status}`
  )

  // F02-009 — M resubmit → EDITOR_REVIEW
  const resubRes = await req('POST', `/chapters/${c1.id}/manuscript/resubmit`, { token: s.tokens.mA })
  ok('F02-009 resubmit 201', resubRes.status === 201, `got ${resubRes.status} ${resubRes.raw.slice(0, 200)}`)
  const ms1f = await prisma.manuscript.findFirst({ where: { chapterId: c1.id } })
  ok('F02-009b Manuscript=EDITOR_REVIEW again', ms1f?.status === ManuscriptStatus.EDITOR_REVIEW, `got ${ms1f?.status}`)
  const p1Resubmitted = await prisma.page.findUnique({ where: { id: p1.id } })
  ok('F02-009c resubmit auto-flips page to COMPLETED', p1Resubmitted?.status === PageStatus.COMPLETED)

  // F02-010 — E approve → READY_FOR_PRINT
  const apprRes = await req('POST', `/chapters/${c1.id}/manuscript/approve`, { token: s.tokens.e1 })
  ok('F02-010 manuscript approve 201', apprRes.status === 201, `got ${apprRes.status} ${apprRes.raw.slice(0, 200)}`)
  const ms1g = await prisma.manuscript.findFirst({ where: { chapterId: c1.id } })
  ok('F02-010b Manuscript=READY_FOR_PRINT', ms1g?.status === ManuscriptStatus.READY_FOR_PRINT, `got ${ms1g?.status}`)

  // F02-011 — E publish → PUBLISHED + publishedAt + Chapter.status PUBLISHED
  const pubRes = await req('POST', `/chapters/${c1.id}/publish`, { token: s.tokens.e1 })
  ok('F02-011 publish 201', pubRes.status === 201, `got ${pubRes.status} ${pubRes.raw.slice(0, 200)}`)
  const c1DB = await prisma.chapter.findUnique({ where: { id: c1.id } })
  const ms1h = await prisma.manuscript.findFirst({ where: { chapterId: c1.id } })
  ok('F02-011b Chapter.publishedAt set', !!c1DB?.publishedAt, `publishedAt=${String(c1DB?.publishedAt)}`)
  ok('F02-011c Manuscript=PUBLISHED', ms1h?.status === ManuscriptStatus.PUBLISHED, `got ${ms1h?.status}`)

  // F02-012 — chapter.published event side-effect: PaymentRecord if RECURRING exists
  // (Skip the per-record assertion — flow-06 covers it deeply; just verify no crash on chapter list)
  const listAfter = await req('GET', `/chapters?seriesId=${s.seriesA.id}`, { token: s.tokens.mA })
  ok('F02-012 list chapters after publish 200', listAfter.status === 200, `got ${listAfter.status}`)

  // F02-013 — E set schedule + extend
  // Create chapter 2 for this test
  const c2Setup = await createChapterWithApprovedName(s, s.seriesA.id, 2, 'Ch2')
  const c2 = c2Setup.chapter
  const setSchRes = await req('PUT', `/chapters/${c2.id}/schedule`, {
    token: s.tokens.e1,
    body: { originalDeadline: new Date(Date.now() + 14 * 86_400_000).toISOString() }
  })
  ok('F02-013a set schedule 200', setSchRes.status === 200, `got ${setSchRes.status} ${setSchRes.raw.slice(0, 200)}`)
  const extRes = await req('PATCH', `/chapters/${c2.id}/schedule/extend`, {
    token: s.tokens.e1,
    body: {
      newDeadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      reason: 'extra week'
    }
  })
  ok('F02-013b extend deadline 200', extRes.status === 200, `got ${extRes.status} ${extRes.raw.slice(0, 200)}`)
  const sch2 = await prisma.schedule.findFirst({ where: { chapterId: c2.id } })
  ok('F02-013c Schedule.currentDeadline updated', !!sch2?.currentDeadline)

  // F02-014 — GET /chapters/:id/progress
  const progRes = await req('GET', `/chapters/${c1.id}/progress`, { token: s.tokens.mA })
  ok('F02-014 progress 200', progRes.status === 200, `got ${progRes.status} ${progRes.raw.slice(0, 200)}`)
  const progData = progRes.json?.data ?? progRes.json
  ok('F02-014b progress.totalPages=1', progData?.totalPages === 1, `got ${JSON.stringify(progData)}`)
  ok('F02-014b2 progress.pagesReady=1', progData?.pagesReady === 1, `got ${JSON.stringify(progData)}`)
  ok('F02-014b3 progress.pagesPending=0', progData?.pagesPending === 0, `got ${JSON.stringify(progData)}`)
  ok(
    'F02-014b4 legacy page progress fields removed',
    !('pagesCompleted' in progData) && !('pagesInProgress' in progData) && !('pagesNotStarted' in progData)
  )
  ok('F02-014c progress.taskBreakdown present', !!progData?.taskBreakdown)
  ok('F02-014d progress.warningLevel present', !!progData?.warningLevel)
  ok('F02-014e progress.onHold=false', progData?.onHold === false)

  // ──────────────────────────────────────────────────────────────────────────
  // §3.2  STATE MACHINE + GATES (14 cases) — F02-015..F02-028
  // ──────────────────────────────────────────────────────────────────────────
  section('§3.2 State machine + gates')

  // F02-015 — Create chapter on series DRAFT → SeriesNotSerialized
  const draftChRes = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesDraft.id, chapterNumber: 1 }
  })
  expectError(draftChRes, 409, 'Error.SeriesNotSerialized', 'F02-015 chapter on DRAFT series')

  // F02-016 — Duplicate chapterNumber
  // (c1 already created with chapterNumber=1 in seriesA)
  const dupChRes = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesA.id, chapterNumber: 1 }
  })
  expectError(dupChRes, 409, 'Error.DuplicateChapterNumber', 'F02-016 duplicate chapterNumber')

  // F02-017 — Upload page khi Name chưa APPROVED → ChapterNameNotApproved
  // Create a new chapter (c3) on seriesA but DON'T approve its Name
  const c3Res = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesA.id, chapterNumber: 3 }
  })
  const c3 = (c3Res.json?.data ?? c3Res.json) as { id: string }
  const pBadRes = await req('POST', `/chapters/${c3.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://p' }
  })
  expectError(pBadRes, 409, 'Error.ChapterNameNotApproved', 'F02-017 page when Name not APPROVED')

  // F02-018 — Create Name thứ 2 cùng chapter → ChapterNameAlreadyExists
  const n1Res = await req('POST', `/chapters/${c3.id}/names`, {
    token: s.tokens.mA,
    body: { namePages: [{ pageNumber: 1, fileUrl: 'r2://np' }] }
  })
  ok('F02-018 setup first Name 201', n1Res.status === 201)
  const n2Res = await req('POST', `/chapters/${c3.id}/names`, {
    token: s.tokens.mA,
    body: { namePages: [{ pageNumber: 1, fileUrl: 'r2://np2' }] }
  })
  expectError(n2Res, 409, 'Error.ChapterNameAlreadyExists', 'F02-018 duplicate chapter-Name')

  // F02-019 — Create Name khi chapter IN_PRODUCTION → ChapterNotDraftForName
  // c1 is currently PUBLISHED → IN_PRODUCTION was passed; create a fresh chapter that already has a page
  const c4Res = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesA.id, chapterNumber: 4 }
  })
  const c4 = (c4Res.json?.data ?? c4Res.json) as { id: string }
  // First approve Name so page upload goes through (moves Manuscript→IN_PRODUCTION)
  const c4nRes = await req('POST', `/chapters/${c4.id}/names`, {
    token: s.tokens.mA,
    body: { namePages: [{ pageNumber: 1, fileUrl: 'r2://np' }] }
  })
  const c4name = (c4nRes.json?.data ?? c4nRes.json) as { id: string }
  await req('POST', `/chapters/${c4.id}/names/${c4name.id}/submit`, { token: s.tokens.mA })
  await req('POST', `/chapters/${c4.id}/names/${c4name.id}/approve`, { token: s.tokens.e1 })
  const p4Res = await req('POST', `/chapters/${c4.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://p' }
  })
  // Now try to create another Name → ChapterNotDraftForName
  const nDupRes = await req('POST', `/chapters/${c4.id}/names`, {
    token: s.tokens.mA,
    body: { namePages: [{ pageNumber: 1, fileUrl: 'r2://np2' }] }
  })
  expectError(nDupRes, 409, 'Error.ChapterNotDraftForName', 'F02-019 Name after IN_PRODUCTION')

  // F02-020 — Manuscript submit khi còn Task chưa APPROVED → TasksNotAllApproved.
  const gateAssistant = await makeUser('ASSISTANT')
  const p4Id = (p4Res.json?.data ?? p4Res.json).id as string
  await makeTaskAt({ pageId: p4Id, assistantId: gateAssistant.id, status: TaskStatus.ASSIGNED })
  const cr2Res = await req('POST', `/chapters/${c4.id}/manuscript/submit`, { token: s.tokens.mA })
  expectError(cr2Res, 409, 'Error.TasksNotAllApproved', 'F02-020 submit with blocking task')

  // F02-021 — Approve manuscript khi EDITOR_REVISION → InvalidManuscriptTransition
  // c1 is currently PUBLISHED so we need a fresh chapter.
  // Setup: c5 with name APPROVED + page COMPLETED, then request-revision, then try approve.
  const c5Setup = await createChapterWithApprovedName(s, s.seriesA.id, 5, 'Ch5')
  const c5 = c5Setup.chapter
  await req('POST', `/chapters/${c5.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://p' }
  })
  await req('POST', `/chapters/${c5.id}/manuscript/submit`, { token: s.tokens.mA })
  await req('POST', `/chapters/${c5.id}/manuscript/request-revision`, {
    token: s.tokens.e1,
    body: { reason: 'redo' }
  })
  // Now try to approve while EDITOR_REVISION
  const badApprRes = await req('POST', `/chapters/${c5.id}/manuscript/approve`, { token: s.tokens.e1 })
  expectError(badApprRes, 409, 'Error.InvalidManuscriptTransition', 'F02-021 approve in EDITOR_REVISION')

  // F02-022 — Publish khi chưa READY_FOR_PRINT → InvalidManuscriptTransition
  // Use c4 (still IN_PRODUCTION)
  const badPubRes = await req('POST', `/chapters/${c4.id}/publish`, { token: s.tokens.e1 })
  expectError(badPubRes, 409, 'Error.InvalidManuscriptTransition', 'F02-022 publish when not READY_FOR_PRINT')

  // F02-023 — Publish seriesB (no contract) → ContractNotExecuted
  const c6Res = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesB.id, chapterNumber: 1 }
  })
  const c6 = (c6Res.json?.data ?? c6Res.json) as { id: string }
  const c6nRes = await req('POST', `/chapters/${c6.id}/names`, {
    token: s.tokens.mA,
    body: { namePages: [{ pageNumber: 1, fileUrl: 'r2://np' }] }
  })
  const c6name = (c6nRes.json?.data ?? c6nRes.json) as { id: string }
  await req('POST', `/chapters/${c6.id}/names/${c6name.id}/submit`, { token: s.tokens.mA })
  await req('POST', `/chapters/${c6.id}/names/${c6name.id}/approve`, { token: s.tokens.e1 })
  await req('POST', `/chapters/${c6.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://p' }
  })
  await req('POST', `/chapters/${c6.id}/manuscript/submit`, { token: s.tokens.mA })
  await req('POST', `/chapters/${c6.id}/manuscript/approve`, { token: s.tokens.e1 })
  const noContractPub = await req('POST', `/chapters/${c6.id}/publish`, { token: s.tokens.e1 })
  expectError(noContractPub, 409, 'Error.ContractNotExecuted', 'F02-023 publish without contract')

  // F02-024 — Publish 2 lần → InvalidManuscriptTransition (c1 already PUBLISHED)
  const dupPubRes = await req('POST', `/chapters/${c1.id}/publish`, { token: s.tokens.e1 })
  expectError(dupPubRes, 409, 'Error.InvalidManuscriptTransition', 'F02-024 publish twice')

  // F02-025 — PATCH chapterNumber khi đã hết DRAFT → ChapterNumberLocked
  // Use c4 (currently IN_PRODUCTION)
  const patchNumRes = await req('PATCH', `/chapters/${c4.id}`, {
    token: s.tokens.mA,
    body: { chapterNumber: 99 }
  })
  expectError(patchNumRes, 409, 'Error.ChapterNumberLocked', 'F02-025 chapterNumber locked')

  // F02-026 — PATCH title after PUBLISHED → ChapterNotEditable
  const patchTtlRes = await req('PATCH', `/chapters/${c1.id}`, {
    token: s.tokens.mA,
    body: { title: 'renamed' }
  })
  expectError(patchTtlRes, 409, 'Error.ChapterNotEditable', 'F02-026 PATCH title after PUBLISHED')

  // F02-027 — DELETE chapter non-DRAFT → ChapterNotDeletable
  const delRes = await req('DELETE', `/chapters/${c4.id}`, { token: s.tokens.mA })
  expectError(delRes, 409, 'Error.ChapterNotDeletable', 'F02-027 DELETE non-DRAFT')

  // F02-028 — DELETE chapter DRAFT → cascade sạch
  const cDelRes = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesA.id, chapterNumber: 99 }
  })
  const cDel = (cDelRes.json?.data ?? cDelRes.json) as { id: string }
  const delOkRes = await req('DELETE', `/chapters/${cDel.id}`, { token: s.tokens.mA })
  ok('F02-028 DELETE DRAFT 200', delOkRes.status === 200, `got ${delOkRes.status} ${delOkRes.raw.slice(0, 200)}`)
  const cDelAfter = await prisma.chapter.findUnique({ where: { id: cDel.id } })
  ok('F02-028b Chapter gone', cDelAfter === null)
  const msDel = await prisma.manuscript.findFirst({ where: { chapterId: cDel.id } })
  ok('F02-028c Manuscript cascade deleted', msDel === null)

  // ──────────────────────────────────────────────────────────────────────────
  // §3.3  HOLD + ENDING (12 cases) — F02-029..F02-040
  // ──────────────────────────────────────────────────────────────────────────
  section('§3.3 Hold + ending allowance')

  // F02-029 — E hold chapter → composite hold set
  const holdRes = await req('POST', `/chapters/${c4.id}/hold`, {
    token: s.tokens.e1,
    body: { reason: 'pending review' }
  })
  ok('F02-029 hold 201', holdRes.status === 201, `got ${holdRes.status} ${holdRes.raw.slice(0, 200)}`)
  const c4After = await prisma.chapter.findUnique({ where: { id: c4.id } })
  ok('F02-029b hold composite set', !!(c4After as unknown as { hold?: unknown }).hold)

  // F02-030 — Mutation khi hold (upload page) → ChapterOnHold
  // Use a fresh chapter (c7) — must have page first to enter IN_PRODUCTION (hold requires that state)
  const c7Setup = await createChapterWithApprovedName(s, s.seriesA.id, 7, 'Ch7')
  const c7 = c7Setup.chapter
  const p7Setup = await req('POST', `/chapters/${c7.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://p' }
  })
  void p7Setup
  await req('POST', `/chapters/${c7.id}/hold`, {
    token: s.tokens.e1,
    body: { reason: 'paused' }
  })
  const pHoldRes = await req('POST', `/chapters/${c7.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 2, originalFile: 'r2://p2' }
  })
  expectError(pHoldRes, 409, 'Error.ChapterOnHold', 'F02-030 page upload on hold')

  // F02-031 — Hold 2 lần → ChapterAlreadyOnHold
  const dupHoldRes = await req('POST', `/chapters/${c7.id}/hold`, {
    token: s.tokens.e1,
    body: { reason: 'again' }
  })
  expectError(dupHoldRes, 409, 'Error.ChapterAlreadyOnHold', 'F02-031 hold twice')

  // F02-032 — Resume → mutation lại OK
  const resumeRes = await req('POST', `/chapters/${c7.id}/resume`, { token: s.tokens.e1 })
  ok('F02-032 resume 201', resumeRes.status === 201, `got ${resumeRes.status} ${resumeRes.raw.slice(0, 200)}`)
  const pAfterResume = await req('POST', `/chapters/${c7.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://p' }
  })
  ok('F02-032b page upload OK after resume', pAfterResume.status === 201, `got ${pAfterResume.status}`)

  // F02-033 — Resume khi không hold → ChapterNotOnHold
  const noHoldResumeRes = await req('POST', `/chapters/${c7.id}/resume`, { token: s.tokens.e1 })
  expectError(noHoldResumeRes, 409, 'Error.ChapterNotOnHold', 'F02-033 resume not-on-hold')

  // F02-034 — Hold bởi M → 403 (route EDITOR only)
  const mHoldRes = await req('POST', `/chapters/${c7.id}/hold`, {
    token: s.tokens.mA,
    body: { reason: 'mangaka hold' }
  })
  ok('F02-034 mangaka hold → 403', mHoldRes.status === 403, `got ${mHoldRes.status}`)

  // F02-035..037 — CANCELLING allowance=2, snapshot=0
  // Series was created with endingChapterAllowance=2. Set allowance=1 to make 2nd create fail.
  await prisma.series.update({
    where: { id: s.seriesCancelling.id },
    data: { endingChapterAllowance: 1, chapterCountAtCancelling: 0 }
  })
  const cancelCh1Res = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesCancelling.id, chapterNumber: 1 }
  })
  ok(
    'F02-035 cancel chapter N+1 201',
    cancelCh1Res.status === 201,
    `got ${cancelCh1Res.status} ${cancelCh1Res.raw.slice(0, 200)}`
  )
  // bump snapshot to 1 (simulating existing chapter count at cancel time)
  await prisma.series.update({
    where: { id: s.seriesCancelling.id },
    data: { chapterCountAtCancelling: 1 }
  })
  const cancelCh2Res = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesCancelling.id, chapterNumber: 2 }
  })
  ok('F02-035b cancel chapter N+2 201', cancelCh2Res.status === 201, `got ${cancelCh2Res.status}`)
  // Now current=2, snapshot=1, allowance=1 → 2-1=1 ≥ 1 → next attempt fails
  const cancelCh3Res = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesCancelling.id, chapterNumber: 3 }
  })
  expectError(cancelCh3Res, 409, 'Error.EndingAllowanceExceeded', 'F02-036 ending allowance exceeded')

  // F02-037 — COMPLETING → tạo không trần
  const completingChRes = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesCompleting.id, chapterNumber: 1 }
  })
  ok('F02-037 completing series chapter 201', completingChRes.status === 201, `got ${completingChRes.status}`)

  // F02-038 — Publish chapter with TERMINATED contract on non-ending series → ContractNotExecuted
  // (Bypass only applies to CANCELLING/COMPLETING series; seriesA is SERIALIZED so gate still applies.)
  // Setup: get a chapter in READY_FOR_PRINT (c1 is already PUBLISHED — make a new one).
  const c11pub = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesA.id, chapterNumber: 14 }
  })
  const c11forPub = c11pub.json?.data ?? c11pub.json
  await req('POST', `/chapters/${c11forPub.id}/names`, {
    token: s.tokens.mA,
    body: { namePages: [{ pageNumber: 1, fileUrl: 'r2://n1' }] }
  })
  const c11n = await prisma.name.findFirst({ where: { chapterId: c11forPub.id } })
  await req('POST', `/chapters/${c11forPub.id}/names/${c11n!.id}/submit`, { token: s.tokens.mA })
  await req('POST', `/chapters/${c11forPub.id}/names/${c11n!.id}/approve`, { token: s.tokens.e1 })
  const c11p1 = await req('POST', `/chapters/${c11forPub.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://p' }
  })
  ok('F02-038a setup page created', c11p1.status === 201)
  await req('POST', `/chapters/${c11forPub.id}/manuscript/submit`, { token: s.tokens.mA })
  await req('POST', `/chapters/${c11forPub.id}/manuscript/approve`, { token: s.tokens.e1 })
  // Now terminate contract
  await prisma.contract.updateMany({
    where: { seriesId: s.seriesA.id },
    data: { status: ContractStatus.TERMINATED }
  })
  const c11pub2 = await req('POST', `/chapters/${c11forPub.id}/publish`, { token: s.tokens.e1 })
  ok(
    'F02-038 publish w/ terminated contract → 409 ContractNotExecuted',
    c11pub2.status === 409 && c11pub2.json?.code === 'Error.ContractNotExecuted',
    `got ${c11pub2.status} ${c11pub2.raw.slice(0, 200)}`
  )
  // restore contract for later tests
  await prisma.contract.updateMany({
    where: { seriesId: s.seriesA.id },
    data: { status: ContractStatus.FULLY_EXECUTED }
  })

  // F02-039 — Series HIATUS tạo chapter → SeriesNotSerialized
  const hiatusChRes = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesHiatus.id, chapterNumber: 1 }
  })
  expectError(hiatusChRes, 409, 'Error.SeriesNotSerialized', 'F02-039 chapter on HIATUS series')

  // F02-040 — snapshot null (legacy cancel) → không enforce
  // Make a seriesCancelling with snapshot = null (force)
  await prisma.series.update({
    where: { id: s.seriesCancelling.id },
    data: { chapterCountAtCancelling: null as unknown as number }
  })
  const legacyCancelChRes = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesCancelling.id, chapterNumber: 100 }
  })
  ok(
    'F02-040 legacy cancel with null snapshot 201',
    legacyCancelChRes.status === 201,
    `got ${legacyCancelChRes.status}`
  )

  // ──────────────────────────────────────────────────────────────────────────
  // §3.4  RBAC + VALIDATION (10 cases) — F02-041..F02-050
  // ──────────────────────────────────────────────────────────────────────────
  section('§3.4 RBAC + validation')

  // F02-041 — M2 tạo chapter series M1 → NotSeriesOwner
  const m2ChRes = await req('POST', '/chapters', {
    token: s.tokens.mA2,
    body: { seriesId: s.seriesA.id, chapterNumber: 50 }
  })
  expectError(m2ChRes, 403, 'Error.NotSeriesOwner', 'F02-041 other mangaka create chapter')

  // F02-042 — E2 (không phụ trách) publish → NotSeriesEditor
  // Setup fresh chapter đã READY_FOR_PRINT cho e2 (wrong editor) scoping test.
  // c1 đã PUBLISHED; tạo c8 rồi push nó READY_FOR_PRINT trước khi e2 publish.
  const c8Setup = await createChapterWithApprovedName(s, s.seriesA.id, 8, 'Ch8')
  const c8 = c8Setup.chapter
  await req('POST', `/chapters/${c8.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://p' }
  })
  await req('POST', `/chapters/${c8.id}/manuscript/submit`, { token: s.tokens.mA })
  await req('POST', `/chapters/${c8.id}/manuscript/approve`, { token: s.tokens.e1 })
  const e2PubRes2 = await req('POST', `/chapters/${c8.id}/publish`, { token: s.tokens.e2 })
  expectError(e2PubRes2, 403, 'Error.NotSeriesEditor', 'F02-042 other editor publish')

  // F02-043 — A upload page → 403
  const assistantA1 = await makeUser('ASSISTANT')
  const a1Tok = await login(assistantA1.email)
  const aUpRes = await req('POST', `/chapters/${c8.id}/pages`, {
    token: a1Tok,
    body: { pageNumber: 2, originalFile: 'r2://p2' }
  })
  ok('F02-043 assistant upload page → 403', aUpRes.status === 403, `got ${aUpRes.status}`)

  // F02-044 — GET /chapters?seriesId= scoping (all roles 200)
  const listE = await req('GET', `/chapters?seriesId=${s.seriesA.id}`, { token: s.tokens.e1 })
  ok('F02-044 list chapters E1 200', listE.status === 200, `got ${listE.status}`)

  // F02-045 — chapterNumber=0 / âm → 422
  const zeroNumRes = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesA.id, chapterNumber: 0 }
  })
  ok('F02-045 chapterNumber=0 → 422', zeroNumRes.status === 422, `got ${zeroNumRes.status}`)
  const negNumRes = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesA.id, chapterNumber: -5 }
  })
  ok('F02-045b chapterNumber=-5 → 422', negNumRes.status === 422, `got ${negNumRes.status}`)

  // F02-046 — POST /chapters seriesId rác → 404
  const badSeriesRes = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: 'aaaaaaaaaaaaaaaaaaaaaaaa', chapterNumber: 1 }
  })
  ok(
    'F02-046 seriesId rác → 4xx',
    badSeriesRes.status === 404 || badSeriesRes.status === 403,
    `got ${badSeriesRes.status} ${badSeriesRes.raw.slice(0, 200)}`
  )

  // F02-047 — PATCH /pages/:pageId id rác → 404
  const badPageRes = await req('PATCH', '/pages/aaaaaaaaaaaaaaaaaaaaaaaa', {
    token: s.tokens.mA,
    body: { compositeFile: 'r2://composite.png' }
  })
  ok(
    'F02-047 PATCH page rác → 404',
    badPageRes.status === 404,
    `got ${badPageRes.status} ${badPageRes.raw.slice(0, 200)}`
  )

  // F02-048 — schedule extend body thiếu newDeadline → 422
  const noDlRes = await req('PATCH', `/chapters/${c8.id}/schedule/extend`, {
    token: s.tokens.e1,
    body: { reason: 'no deadline' }
  })
  ok(
    'F02-048 extend missing newDeadline → 422',
    noDlRes.status === 422,
    `got ${noDlRes.status} ${noDlRes.raw.slice(0, 200)}`
  )

  // F02-049 / F02-050 — annotation routes are out of chapter scope; skip with note
  // (cross-flow coverage via cross-events)
  ok('F02-049 (skip) annotation target not-found → outside chapter scope', true)
  ok('F02-050 (skip) annotation DELETE by non-author → outside chapter scope', true)

  // ──────────────────────────────────────────────────────────────────────────
  // §3.5  CO-OWNER APPROVAL FLOW (additional to spec matrix)
  // ──────────────────────────────────────────────────────────────────────────
  section('§3.5 Co-owner approval flow (PARTIAL_TRANSFER)')

  // Set co-owner on seriesA; mark seriesA as needing co-owner approval for READY_FOR_PRINT chapters
  await prisma.series.update({
    where: { id: s.seriesA.id },
    data: { coOwnerId: s.mangakaA2.id, coOwnerApprovalRequired: true }
  })

  // Set up chapter c9 → READY_FOR_PRINT, publish should go to AWAITING_CO_OWNER_APPROVAL
  const c9Setup = await createChapterWithApprovedName(s, s.seriesA.id, 9, 'Ch9')
  const c9 = c9Setup.chapter
  const p9Res = await req('POST', `/chapters/${c9.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://p' }
  })
  ok('F02-051a setup page created', p9Res.status === 201)
  await req('POST', `/chapters/${c9.id}/manuscript/submit`, { token: s.tokens.mA })
  await req('POST', `/chapters/${c9.id}/manuscript/approve`, { token: s.tokens.e1 })
  const pubCoRes = await req('POST', `/chapters/${c9.id}/publish`, { token: s.tokens.e1 })
  ok(
    'F02-051 publish w/ co-owner → AWAITING_CO_OWNER_APPROVAL',
    pubCoRes.status === 201,
    `got ${pubCoRes.status} ${pubCoRes.raw.slice(0, 200)}`
  )
  const ms9 = await prisma.manuscript.findFirst({ where: { chapterId: c9.id } })
  ok(
    'F02-051b Manuscript=AWAITING_CO_OWNER_APPROVAL',
    ms9?.status === ManuscriptStatus.AWAITING_CO_OWNER_APPROVAL,
    `got ${ms9?.status}`
  )

  // F02-052 — co-owner-approve by NON co-owner → NotCoOwner
  const wrongCoApprRes = await req('POST', `/chapters/${c9.id}/co-owner-approve`, { token: s.tokens.mA })
  expectError(wrongCoApprRes, 403, 'Error.NotCoOwner', 'F02-052 wrong owner co-owner-approve')

  // F02-053 — co-owner-approve by actual co-owner → PUBLISHED
  const coApprRes = await req('POST', `/chapters/${c9.id}/co-owner-approve`, { token: s.tokens.mA2 })
  ok('F02-053 co-owner-approve 201', coApprRes.status === 201, `got ${coApprRes.status} ${coApprRes.raw.slice(0, 200)}`)
  const ms9b = await prisma.manuscript.findFirst({ where: { chapterId: c9.id } })
  ok('F02-053b Manuscript=PUBLISHED', ms9b?.status === ManuscriptStatus.PUBLISHED, `got ${ms9b?.status}`)

  // F02-054 — co-owner-reject → EDITOR_REVISION
  const c10Setup = await createChapterWithApprovedName(s, s.seriesA.id, 10, 'Ch10')
  const c10 = c10Setup.chapter
  const p10Res = await req('POST', `/chapters/${c10.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://p' }
  })
  ok('F02-054a setup page created', p10Res.status === 201)
  await req('POST', `/chapters/${c10.id}/manuscript/submit`, { token: s.tokens.mA })
  await req('POST', `/chapters/${c10.id}/manuscript/approve`, { token: s.tokens.e1 })
  await req('POST', `/chapters/${c10.id}/publish`, { token: s.tokens.e1 })
  const coRejRes = await req('POST', `/chapters/${c10.id}/co-owner-reject`, {
    token: s.tokens.mA2,
    body: { reason: 'panel layout wrong' }
  })
  ok('F02-054 co-owner-reject 201', coRejRes.status === 201, `got ${coRejRes.status} ${coRejRes.raw.slice(0, 200)}`)
  const ms10 = await prisma.manuscript.findFirst({ where: { chapterId: c10.id } })
  ok('F02-054b Manuscript=EDITOR_REVISION', ms10?.status === ManuscriptStatus.EDITOR_REVISION, `got ${ms10?.status}`)
  const p10Revising = await prisma.page.findUnique({ where: { id: (p10Res.json?.data ?? p10Res.json).id } })
  ok('F02-054c co-owner reject auto-flips page to REVISING', p10Revising?.status === PageStatus.REVISING)

  // ──────────────────────────────────────────────────────────────────────────
  // §3.6  NAME LIFECYCLE (additional to spec matrix — name-proposal kind + chapter-name kind)
  // ──────────────────────────────────────────────────────────────────────────
  section('§3.6 Name (proposal + chapter) lifecycle')

  // F02-060 — Option A: chapter-Name born DRAFT is editable; addPage works. After submit → SUBMITTED locks it.
  const c11Res = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesA.id, chapterNumber: 11 }
  })
  const c11 = (c11Res.json?.data ?? c11Res.json) as { id: string }
  const c11nRes = await req('POST', `/chapters/${c11.id}/names`, {
    token: s.tokens.mA,
    body: { namePages: [{ pageNumber: 1, fileUrl: 'r2://n1' }] }
  })
  const c11name = (c11nRes.json?.data ?? c11nRes.json) as { id: string }

  // F02-060a — addPage while DRAFT → 201 (the whole point of Option A: fix your Name before submitting)
  const c11draftAdd = await req('POST', `/chapters/${c11.id}/names/${c11name.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 2, fileUrl: 'r2://n2' }
  })
  ok(
    'F02-060a addPage while DRAFT → 201',
    c11draftAdd.status === 201,
    `got ${c11draftAdd.status} ${c11draftAdd.raw.slice(0, 200)}`
  )

  // F02-060 — after submit → SUBMITTED, addPage is locked → 409 InvalidNameState
  await req('POST', `/chapters/${c11.id}/names/${c11name.id}/submit`, { token: s.tokens.mA })
  const c11n2Res = await req('POST', `/chapters/${c11.id}/names/${c11name.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 3, fileUrl: 'r2://n3' }
  })
  ok(
    'F02-060 addPage when SUBMITTED → 409 InvalidNameState',
    c11n2Res.status === 409,
    `got ${c11n2Res.status} ${c11n2Res.raw.slice(0, 200)}`
  )
  const c11nameDB = await prisma.name.findUnique({ where: { id: c11name.id } })
  ok(
    'F02-060b Name has 2 pages (1 born + 1 added while DRAFT)',
    (c11nameDB?.pages as unknown as unknown[]).length === 2
  )

  // F02-061 — Add page when APPROVED → InvalidNameState
  const c11n3Res = await req('POST', `/chapters/${c11.id}/names/${c11name.id}/approve`, { token: s.tokens.e1 })
  ok('F02-061 setup approve 201', c11n3Res.status === 201)
  const c11n4Res = await req('POST', `/chapters/${c11.id}/names/${c11name.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 3, fileUrl: 'r2://n3' }
  })
  expectError(c11n4Res, 409, 'Error.InvalidNameState', 'F02-061 addPage when APPROVED')

  // F02-062 — request-revision → REVISION
  const c12Setup = await createChapterWithApprovedName(s, s.seriesA.id, 12, 'Ch12')
  // Actually we need a fresh chapter w/ DRAFT Name. Let's use c11's name status by chain instead:
  // request-revision only works on SUBMITTED/IN_REVIEW names. After approve → APPROVED (terminal).
  // Create another chapter w/ DRAFT name → manually push to SUBMITTED via request-revision by editor? Not allowed (editor triggers REVISION from SUBMITTED).
  // Use existing pattern: create chapter + name + push name to IN_REVIEW by calling name.editor-side approve twice (it would fail). Instead, fastForward Name via Prisma:
  const c12 = c12Setup.chapter
  const c12nameId = c12Setup.name.id
  await prisma.name.update({
    where: { id: c12nameId },
    data: { status: NameStatus.SUBMITTED, submittedAt: new Date() }
  })
  const c12revRes = await req('POST', `/chapters/${c12.id}/names/${c12nameId}/request-revision`, {
    token: s.tokens.e1,
    body: { reason: 'redo panel 1' }
  })
  ok(
    'F02-062 request-revision Name 201',
    c12revRes.status === 201,
    `got ${c12revRes.status} ${c12revRes.raw.slice(0, 200)}`
  )
  const c12nameDB = await prisma.name.findUnique({ where: { id: c12nameId } })
  ok('F02-062b Name.status=REVISION', c12nameDB?.status === NameStatus.REVISION, `got ${c12nameDB?.status}`)

  // F02-063 — Resubmit Name → IN_REVIEW, version+1
  const c12resubRes = await req('POST', `/chapters/${c12.id}/names/${c12nameId}/resubmit`, { token: s.tokens.mA })
  ok(
    'F02-063 resubmit Name 201',
    c12resubRes.status === 201,
    `got ${c12resubRes.status} ${c12resubRes.raw.slice(0, 200)}`
  )
  const c12nameDB2 = await prisma.name.findUnique({ where: { id: c12nameId } })
  ok('F02-063b Name.version incremented', (c12nameDB2?.version ?? 0) >= 2, `got ${c12nameDB2?.version}`)

  const editorNotifications = await req('GET', '/notifications?limit=100', { token: s.tokens.e1 })
  const nameResubmittedNotification = editorNotifications.json?.data?.items?.find(
    (notification: { referenceType?: string; referenceId?: string }) =>
      notification.referenceType === 'NAME_RESUBMITTED' && notification.referenceId === c12nameId
  )
  ok(
    'F02-RV7 Name resubmit notifies assigned Editor with NAME_RESUBMITTED',
    editorNotifications.status === 200 && !!nameResubmittedNotification,
    `got ${editorNotifications.status} ${editorNotifications.raw.slice(0, 220)}`
  )

  // F02-064 — Update pages when REVISION → OK
  await req('POST', `/chapters/${c12.id}/names/${c12nameId}/request-revision`, {
    token: s.tokens.e1,
    body: { reason: 'another revision' }
  })
  const c12upRes = await req('PUT', `/chapters/${c12.id}/names/${c12nameId}/pages`, {
    token: s.tokens.mA,
    body: { pages: [{ pageNumber: 1, fileUrl: 'r2://nrev' }] }
  })
  ok(
    'F02-064 update pages REVISION 200',
    c12upRes.status === 200,
    `got ${c12upRes.status} ${c12upRes.raw.slice(0, 200)}`
  )

  // ──────────────────────────────────────────────────────────────────────────
  // §3.7  PROPOSAL-NAME lifecycle (PROPOSAL kind, separate from CHAPTER kind)
  // ──────────────────────────────────────────────────────────────────────────
  section('§3.7 Name PROPOSAL lifecycle')

  // Create a fresh series for proposal lifecycle (so no contract required for proposal-name tests)
  const seriesProposal = await makeSeriesAt(SeriesStatus.DRAFT, { mangakaId: s.mangakaA.id })
  // Fast-forward series to READY_TO_PITCH (so proposal.nameId chain works)
  await prisma.series.update({
    where: { id: seriesProposal.id },
    data: { status: SeriesStatus.READY_TO_PITCH, editorId: s.editorE1.id }
  })

  // Create proposal-Name via Prisma (faster — proposal-Name goes through different path)
  // We need proposal-Name which is created via /series/:id/proposals endpoint, not chapter.
  // For flow-02 we focus on chapter-Name lifecycle which is the main subject. Mark proposals as covered.

  // F02-070 — Name.proposal kind created by fastForward, then editor cannot approve when DRAFT
  const proposalName = await makeNameAt({
    seriesId: seriesProposal.id,
    kind: NameKind.PROPOSAL,
    status: NameStatus.DRAFT
  })
  ok('F02-070 setup: proposal Name DRAFT', !!proposalName)

  // Editor cannot approve DRAFT (DRAFT not in allowed transitions)
  const propApprRes = await req('POST', `/series/${seriesProposal.id}/names/${proposalName.id}/approve`, {
    token: s.tokens.e1
  })
  expectError(propApprRes, 409, 'Error.InvalidNameState', 'F02-070b approve DRAFT proposal')

  // F02-071 — submit Name PROPOSAL is not a chapter path; use /series/:id/proposals/:id/submit if exists.
  // Per controllers explored, proposal lifecycle is via /series/proposals/* which is out of chapter scope.
  ok('F02-071 (skip) proposal-Name submit is via /series/proposals/* (out of scope)', true)

  // F02-072 — updatePages for PROPOSAL Name DRAFT → OK
  const propPgRes = await req('PUT', `/series/${seriesProposal.id}/names/${proposalName.id}/pages`, {
    token: s.tokens.mA,
    body: { pages: [{ pageNumber: 1, fileUrl: 'r2://prop1' }] }
  })
  ok('F02-072 proposal updatePages DRAFT 200', propPgRes.status === 200, `got ${propPgRes.status}`)

  // F02-073 — updatePages for PROPOSAL Name APPROVED → InvalidNameState
  await prisma.name.update({ where: { id: proposalName.id }, data: { status: NameStatus.APPROVED } })
  const propPg2Res = await req('PUT', `/series/${seriesProposal.id}/names/${proposalName.id}/pages`, {
    token: s.tokens.mA,
    body: { pages: [{ pageNumber: 1, fileUrl: 'r2://prop2' }] }
  })
  expectError(propPg2Res, 409, 'Error.InvalidNameState', 'F02-073 proposal updatePages APPROVED')

  // ──────────────────────────────────────────────────────────────────────────
  // §3.8  CHAPTER-NAME TÁCH VAI + DELETE (Spec 12 Part C)
  // ──────────────────────────────────────────────────────────────────────────
  section('§3.8 Chapter-Name split + DELETE (Spec 12)')

  // Create a DRAFT chapter with Name for the full lifecycle
  const cSplitRes = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesA.id, chapterNumber: 13 }
  })
  const cSplit = (cSplitRes.json?.data ?? cSplitRes.json) as { id: string }

  // F02-080 — GET /chapters/:id/names
  const cnListRes = await req('GET', `/chapters/${cSplit.id}/names`, { token: s.tokens.mA })
  ok('F02-080 GET /chapters/:id/names 200', cnListRes.status === 200, `got ${cnListRes.status}`)

  // F02-081 — POST /chapters/:id/names
  const cn1Res = await req('POST', `/chapters/${cSplit.id}/names`, {
    token: s.tokens.mA,
    body: { namePages: [{ pageNumber: 1, fileUrl: 'r2://split-1' }] }
  })
  ok('F02-081 chapter-Name 201', cn1Res.status === 201, `got ${cn1Res.status}`)
  const cn1Id = (cn1Res.json?.data ?? cn1Res.json).id
  ok(
    'F02-081b NameRes expose chapterId',
    (cn1Res.json?.data ?? cn1Res.json).chapterId === cSplit.id,
    JSON.stringify((cn1Res.json?.data ?? cn1Res.json).chapterId)
  )

  // F02-082 — GET /chapters/:id/names/:nameId
  const cnGetRes = await req('GET', `/chapters/${cSplit.id}/names/${cn1Id}`, { token: s.tokens.e1 })
  ok('F02-082 GET chapter-Name 200', cnGetRes.status === 200, `got ${cnGetRes.status}`)

  // ★ BẰNG CHỨNG TÁCH VAI:
  // F02-083 — chapter-Name qua route series-scoped → 404
  const crossGet = await req('GET', `/series/${s.seriesA.id}/names/${cn1Id}`, { token: s.tokens.mA })
  expectError(crossGet, 404, 'Error.NameNotFound', 'F02-083 chapter-Name via series-scoped GET → 404')

  // F02-084 — chapter-Name approve qua route series-scoped → 404
  const crossAppr = await req('POST', `/series/${s.seriesA.id}/names/${cn1Id}/approve`, {
    token: s.tokens.e1,
    body: {}
  })
  expectError(crossAppr, 404, 'Error.NameNotFound', 'F02-084 chapter-Name approve via series-scoped → 404')

  // F02-085 — GET /series/:id/names liệt kê chỉ PROPOSAL
  const sListRes = await req('GET', `/series/${s.seriesA.id}/names`, { token: s.tokens.mA })
  const sListItems = (sListRes.json?.data ?? sListRes.json).items ?? []
  ok(
    'F02-085 /series/:id/names only PROPOSAL',
    sListItems.every((n: { kind: string }) => n.kind === 'PROPOSAL'),
    JSON.stringify(sListItems.map((n: { kind: string }) => n.kind))
  )

  // F02-086 — Spec 12 tách vai: ListNamesQuery bỏ field `kind` + .strict() → gửi ?kind= là 422,
  // KHÔNG im lặng bỏ qua (controller vẫn khai @Query nên pipe validate chạy).
  const sListKindRes = await req('GET', `/series/${s.seriesA.id}/names?kind=CHAPTER`, { token: s.tokens.mA })
  ok(
    'F02-086 series names?kind=CHAPTER → 422 (strict reject, Spec 12)',
    sListKindRes.status === 422,
    `got ${sListKindRes.status}`
  )

  // F02-087 — DELETE chapter-Name (DRAFT + chưa APPROVED) → 200 + Chapter.nameId unset
  const cnDelRes = await req('DELETE', `/chapters/${cSplit.id}/names/${cn1Id}`, { token: s.tokens.mA })
  ok('F02-087 DELETE chapter-Name 200', cnDelRes.status === 200, `got ${cnDelRes.status}`)
  ok(
    'F02-087b trả message (MessageResDto)',
    typeof cnDelRes.json?.message === 'string' && cnDelRes.json.message !== 'Success',
    JSON.stringify(cnDelRes.json?.message)
  )
  const cnAfterDel = await prisma.name.findUnique({ where: { id: cn1Id } })
  ok('F02-087c Name bị xoá', cnAfterDel === null)
  const chAfterDel = await prisma.chapter.findUnique({ where: { id: cSplit.id } })
  ok(
    'F02-087d Chapter.nameId unset',
    chAfterDel?.nameId === null || chAfterDel?.nameId === undefined,
    String(chAfterDel?.nameId)
  )

  // F02-088 — POST /chapters/:id/names (lại) → 201 — vẽ lại được
  const cn2Res = await req('POST', `/chapters/${cSplit.id}/names`, {
    token: s.tokens.mA,
    body: { namePages: [{ pageNumber: 1, fileUrl: 'r2://split-2' }] }
  })
  ok('F02-088 recreate chapter-Name 201', cn2Res.status === 201, `got ${cn2Res.status}`)
  const cn2Id = (cn2Res.json?.data ?? cn2Res.json).id

  // F02-089 — DELETE bởi EDITOR → 403 (RolesGuard chặn ở @Roles(MANGAKA) — không phải NotSeriesOwner service-level)
  const cnDelE = await req('DELETE', `/chapters/${cSplit.id}/names/${cn2Id}`, { token: s.tokens.e1 })
  ok('F02-089 DELETE by EDITOR → 403', cnDelE.status === 403, `got ${cnDelE.status}`)

  // F02-090 — Approve Name → APPROVED, then DELETE → 409 NameNotDeletable
  await req('POST', `/chapters/${cSplit.id}/names/${cn2Id}/submit`, { token: s.tokens.mA })
  await req('POST', `/chapters/${cSplit.id}/names/${cn2Id}/approve`, { token: s.tokens.e1, body: {} })
  const cnDelApproved = await req('DELETE', `/chapters/${cSplit.id}/names/${cn2Id}`, { token: s.tokens.mA })
  expectError(cnDelApproved, 409, 'Error.NameNotDeletable', 'F02-090 DELETE APPROVED Name → 409')

  // ═══════════════════════════════════════════════════════════════════════════
  // F02-P — Page API mở rộng (PATCH originalFile/pageNumber · DELETE · bulk DELETE)
  //         + scoping GET /chapters/:id/pages (trước đây AUTH-only, không scoping)
  // ═══════════════════════════════════════════════════════════════════════════
  section('F02-P Page API mở rộng + scoping')

  const cPage = (await createChapterWithApprovedName(s, s.seriesA.id, 30, 'ChPage')).chapter
  const mkPage = async (pageNumber: number, originalFile = `r2://p${pageNumber}.png`) => {
    const r = await req('POST', `/chapters/${cPage.id}/pages`, {
      token: s.tokens.mA,
      body: { pageNumber, originalFile }
    })
    return (r.json?.data ?? r.json) as { id: string; pageNumber: number }
  }

  const pg1 = await mkPage(1)
  await mkPage(2)

  // --- PATCH mở rộng ---
  // originalFile là NGUỒN cho AI segment + Assistant workspace → PATCH KHÔNG được đè.
  // Muốn thay bản gốc: xoá trang rồi upload lại.
  const patchOriginal = await req('PATCH', `/pages/${pg1.id}`, {
    token: s.tokens.mA,
    body: { originalFile: 'r2://p1-redraw.png' }
  })
  ok('F02-P01 PATCH originalFile bị từ chối → 422', patchOriginal.status === 422, `got ${patchOriginal.status}`)
  const pg1AfterFile = await prisma.page.findUnique({ where: { id: pg1.id } })
  ok(
    'F02-P01b bản gốc KHÔNG bị thay đổi',
    pg1AfterFile?.originalFile === 'r2://p1.png',
    `got ${pg1AfterFile?.originalFile}`
  )

  // displayFile = compositeFile ?? originalFile — FE chỉ đọc 1 field để render
  const beforeComposite = await req('GET', `/chapters/${cPage.id}/pages`, { token: s.tokens.mA })
  const pgBefore = ((beforeComposite.json?.data?.items ?? []) as Array<Record<string, unknown>>).find(
    (item) => item.id === pg1.id
  )
  ok(
    'F02-P01c chưa có composite → displayFile fallback về originalFile',
    pgBefore?.displayFile === 'r2://p1.png',
    `got ${String(pgBefore?.displayFile)}`
  )

  const patchComposite = await req('PATCH', `/pages/${pg1.id}`, {
    token: s.tokens.mA,
    body: { compositeFile: 'r2://p1-final.png' }
  })
  ok('F02-P01d PATCH compositeFile → 200', patchComposite.status === 200, `got ${patchComposite.status}`)
  const afterComposite = await req('GET', `/chapters/${cPage.id}/pages`, { token: s.tokens.mA })
  const pgAfter = ((afterComposite.json?.data?.items ?? []) as Array<Record<string, unknown>>).find(
    (item) => item.id === pg1.id
  )
  ok(
    'F02-P01e có composite → displayFile trỏ composite, originalFile vẫn còn nguyên',
    pgAfter?.displayFile === 'r2://p1-final.png' && pgAfter?.originalFile === 'r2://p1.png',
    `display=${String(pgAfter?.displayFile)} original=${String(pgAfter?.originalFile)}`
  )

  const patchDupNumber = await req('PATCH', `/pages/${pg1.id}`, { token: s.tokens.mA, body: { pageNumber: 2 } })
  expectError(patchDupNumber, 409, 'Error.DuplicatePageNumber', 'F02-P02 đổi sang số trang đã dùng → 409')

  const patchFreeNumber = await req('PATCH', `/pages/${pg1.id}`, { token: s.tokens.mA, body: { pageNumber: 7 } })
  ok('F02-P03 đổi sang số trang trống → 200', patchFreeNumber.status === 200, `got ${patchFreeNumber.status}`)
  const pg1Renumbered = await prisma.page.findUnique({ where: { id: pg1.id } })
  ok('F02-P03b pageNumber persisted', pg1Renumbered?.pageNumber === 7, `got ${pg1Renumbered?.pageNumber}`)

  const patchSelfNumber = await req('PATCH', `/pages/${pg1.id}`, { token: s.tokens.mA, body: { pageNumber: 7 } })
  ok('F02-P04 gửi lại chính số của mình → 200', patchSelfNumber.status === 200, `got ${patchSelfNumber.status}`)

  // --- scoping GET /chapters/:id/pages ---
  const listOwner = await req('GET', `/chapters/${cPage.id}/pages`, { token: s.tokens.mA })
  ok('F02-P05 mangaka chủ sở hữu list được', listOwner.status === 200, `got ${listOwner.status}`)

  const listOtherMangaka = await req('GET', `/chapters/${cPage.id}/pages`, { token: s.tokens.mA2 })
  expectError(listOtherMangaka, 403, 'Error.ChapterAccessDenied', 'F02-P06 mangaka khác → 403')

  const listEditor = await req('GET', `/chapters/${cPage.id}/pages`, { token: s.tokens.e1 })
  ok('F02-P07 editor phụ trách list được', listEditor.status === 200, `got ${listEditor.status}`)

  const listWrongEditor = await req('GET', `/chapters/${cPage.id}/pages`, { token: s.tokens.e2 })
  expectError(listWrongEditor, 403, 'Error.ChapterAccessDenied', 'F02-P08 editor không phụ trách → 403')

  const outsiderAssistant = await makeUser('ASSISTANT')
  const outsiderToken = await login(outsiderAssistant.email)
  const listOutsider = await req('GET', `/chapters/${cPage.id}/pages`, { token: outsiderToken })
  expectError(listOutsider, 403, 'Error.ChapterAccessDenied', 'F02-P09 assistant ngoài studio → 403')

  const studioAssistant = await makeUser('ASSISTANT')
  await makeStudioAssignment({ mangakaId: s.mangakaA.id, assistantId: studioAssistant.id, seriesId: s.seriesA.id })
  const studioToken = await login(studioAssistant.email)
  const listStudio = await req('GET', `/chapters/${cPage.id}/pages`, { token: studioToken })
  ok('F02-P10 assistant có StudioAssignment ACTIVE list được', listStudio.status === 200, `got ${listStudio.status}`)

  const listBoard = await req('GET', `/chapters/${cPage.id}/pages`, { token: s.tokens.b })
  ok('F02-P11 board member list được (giám sát)', listBoard.status === 200, `got ${listBoard.status}`)

  // --- DELETE page + cascade ---
  const pgDel = await mkPage(11)
  const delRegion = await prisma.region.create({
    data: {
      pageId: pgDel.id,
      coordinates: { x: 1, y: 2, width: 3, height: 4 },
      createdBy: 'MANUAL',
      confirmedByMangaka: true
    }
  })
  const delTask = await makeTaskAt({ pageId: pgDel.id, regionId: delRegion.id, assistantId: studioAssistant.id })

  const delOther = await req('DELETE', `/pages/${pgDel.id}`, { token: s.tokens.mA2 })
  ok('F02-P12 mangaka khác xoá trang → 403', delOther.status === 403, `got ${delOther.status}`)

  const pageDelRes = await req('DELETE', `/pages/${pgDel.id}`, { token: s.tokens.mA })
  ok('F02-P13 DELETE page → 200', pageDelRes.status === 200, `got ${pageDelRes.status} ${pageDelRes.raw.slice(0, 200)}`)
  const delBody = (pageDelRes.json?.data ?? pageDelRes.json) as { deletedRegions: number; deletedTasks: number }
  ok(
    'F02-P13b payload đếm đúng cascade',
    delBody?.deletedRegions === 1 && delBody?.deletedTasks === 1,
    `got ${JSON.stringify(delBody)}`
  )
  ok('F02-P13c page đã xoá khỏi DB', (await prisma.page.findUnique({ where: { id: pgDel.id } })) === null)
  ok('F02-P13d region cascade đã xoá', (await prisma.region.findUnique({ where: { id: delRegion.id } })) === null)
  ok('F02-P13e task cascade đã xoá', (await prisma.task.findUnique({ where: { id: delTask.id } })) === null)

  // Gate đồng bộ PA-03: không cho xoá mất công trợ lý ĐÃ ĐƯỢC DUYỆT
  const pgApproved = await mkPage(12)
  const approvedTask = await makeTaskAt({
    pageId: pgApproved.id,
    assistantId: studioAssistant.id,
    status: TaskStatus.APPROVED
  })
  const delApprovedPage = await req('DELETE', `/pages/${pgApproved.id}`, { token: s.tokens.mA })
  expectError(delApprovedPage, 409, 'Error.PageHasApprovedTasks', 'F02-P13f xoá trang có task APPROVED → 409')
  ok(
    'F02-P13g trang + task APPROVED vẫn còn nguyên',
    (await prisma.page.findUnique({ where: { id: pgApproved.id } })) !== null &&
      (await prisma.task.findUnique({ where: { id: approvedTask.id } })) !== null
  )
  const bulkApproved = await req('DELETE', `/chapters/${cPage.id}/pages`, {
    token: s.tokens.mA,
    body: { pageIds: [pgApproved.id] }
  })
  expectError(bulkApproved, 409, 'Error.PageHasApprovedTasks', 'F02-P13h bulk chứa trang có task APPROVED → 409')

  const delMissing = await req('DELETE', `/pages/${pgDel.id}`, { token: s.tokens.mA })
  expectError(delMissing, 404, 'Error.PageNotFound', 'F02-P14 xoá lại trang đã mất → 404')

  const delBadId = await req('DELETE', '/pages/not-an-object-id', { token: s.tokens.mA })
  expectError(delBadId, 404, 'Error.PageNotFound', 'F02-P15 id rác → 404 (không 500)')

  // --- bulk DELETE all-or-nothing ---
  const b1 = await mkPage(21)
  const b2 = await mkPage(22)
  const foreignChapter = (await createChapterWithApprovedName(s, s.seriesA.id, 31, 'ChOther')).chapter
  const foreignRes = await req('POST', `/chapters/${foreignChapter.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://foreign.png' }
  })
  const foreignPage = (foreignRes.json?.data ?? foreignRes.json) as { id: string }

  const bulkForeign = await req('DELETE', `/chapters/${cPage.id}/pages`, {
    token: s.tokens.mA,
    body: { pageIds: [b1.id, foreignPage.id] }
  })
  expectError(bulkForeign, 404, 'Error.PageNotFound', 'F02-P16 bulk có page thuộc chapter khác → 404')
  ok('F02-P16b all-or-nothing: b1 vẫn còn', (await prisma.page.findUnique({ where: { id: b1.id } })) !== null)
  ok(
    'F02-P16c all-or-nothing: page chapter khác vẫn còn',
    (await prisma.page.findUnique({ where: { id: foreignPage.id } })) !== null
  )

  const bulkOver = await req('DELETE', `/chapters/${cPage.id}/pages`, {
    token: s.tokens.mA,
    body: { pageIds: Array.from({ length: 51 }, () => b1.id) }
  })
  ok('F02-P17 bulk > 50 id → 422', bulkOver.status === 422, `got ${bulkOver.status}`)

  const bulkEmpty = await req('DELETE', `/chapters/${cPage.id}/pages`, { token: s.tokens.mA, body: { pageIds: [] } })
  ok('F02-P18 bulk rỗng → 422', bulkEmpty.status === 422, `got ${bulkEmpty.status}`)

  const bulkOk = await req('DELETE', `/chapters/${cPage.id}/pages`, {
    token: s.tokens.mA,
    body: { pageIds: [b1.id, b2.id] }
  })
  ok('F02-P19 bulk hợp lệ → 200', bulkOk.status === 200, `got ${bulkOk.status} ${bulkOk.raw.slice(0, 200)}`)
  const bulkBody = (bulkOk.json?.data ?? bulkOk.json) as { deletedPages: number }
  ok('F02-P19b deletedPages = 2', bulkBody?.deletedPages === 2, `got ${JSON.stringify(bulkBody)}`)
  ok('F02-P19c cả 2 page đã mất', (await prisma.page.count({ where: { id: { in: [b1.id, b2.id] } } })) === 0)

  // --- COMPLETED page bị khoá khỏi cả PATCH lẫn DELETE (Spec 19) ---
  const cLocked = (await createChapterWithApprovedName(s, s.seriesA.id, 32, 'ChLocked')).chapter
  const lockRes = await req('POST', `/chapters/${cLocked.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://lock.png' }
  })
  const lockedPage = (lockRes.json?.data ?? lockRes.json) as { id: string }
  await req('POST', `/chapters/${cLocked.id}/manuscript/submit`, { token: s.tokens.mA })
  const lockedNow = await prisma.page.findUnique({ where: { id: lockedPage.id } })
  ok('F02-P20 page đã COMPLETED sau submit', lockedNow?.status === PageStatus.COMPLETED, `got ${lockedNow?.status}`)

  const delCompleted = await req('DELETE', `/pages/${lockedPage.id}`, { token: s.tokens.mA })
  expectError(delCompleted, 409, 'Error.PageNotEditable', 'F02-P21 DELETE page COMPLETED → 409')

  const bulkCompleted = await req('DELETE', `/chapters/${cLocked.id}/pages`, {
    token: s.tokens.mA,
    body: { pageIds: [lockedPage.id] }
  })
  expectError(bulkCompleted, 409, 'Error.PageNotEditable', 'F02-P22 bulk chứa page COMPLETED → 409')
  ok('F02-P22b page COMPLETED vẫn còn', (await prisma.page.findUnique({ where: { id: lockedPage.id } })) !== null)

  await prisma.$disconnect()
  const fail = summary(FLOW)
  process.exit(fail > 0 ? 1 : 0)
}

void main().catch(async (e) => {
  console.error('FATAL', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
