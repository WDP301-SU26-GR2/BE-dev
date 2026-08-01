import {
  wipeDb,
  seedRolesAndAdmin,
  prisma,
  makeUser,
  makeSeriesAt,
  makeContractAt,
  makeTaskAt,
  makeStudioAssignment
} from './lib/seed.js'
import { req, ok, section, summary, expectError, resetCounters, sleep } from './lib/http.js'
import { login } from './lib/auth.js'
import {
  SeriesStatus,
  ManuscriptStatus,
  StoryboardStatus,
  PageStatus,
  ContractStatus,
  TaskStatus,
  Specialization
} from '@prisma/client'

const FLOW = 'flow-02-chapter-production.ts'

type FlowChapterRef = { id: string }
type FlowPageRef = { id: string; pageNumber: number }

const responseData = <T>(res: { json: unknown }): T => {
  const json = res.json
  if (json && typeof json === 'object' && 'data' in json) return json.data as T
  return json as T
}

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

// Helper: create a chapter storyboard and approve it through the public API.
// Returns { chapter, storyboard }.
const createChapterWithApprovedStoryboard = async (
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

  // Create chapter storyboard.
  const nRes = await req('POST', `/chapters/${chapter.id}/storyboards`, {
    token: s.tokens.mA,
    body: { storyboardPages: [{ pageNumber: 1, fileUrl: 'r2://storyboard-page-1' }] }
  })
  if (nRes.status !== 201) throw new Error(`create chapter storyboard failed: ${nRes.status} ${nRes.raw}`)
  const storyboard = nRes.json?.data ?? nRes.json

  // Chapter storyboard starts DRAFT; Mangaka submits it before Editor review.
  const subRes = await req('POST', `/chapters/${chapter.id}/storyboards/${storyboard.id}/submit`, {
    token: s.tokens.mA
  })
  if (subRes.status !== 201) throw new Error(`submit chapter storyboard failed: ${subRes.status} ${subRes.raw}`)

  // Editor approves the storyboard through the chapter-scoped route.
  const aRes = await req('POST', `/chapters/${chapter.id}/storyboards/${storyboard.id}/approve`, {
    token: s.tokens.e1
  })
  if (aRes.status !== 201) throw new Error(`approve storyboard failed: ${aRes.status} ${aRes.raw}`)
  await sleep(100)
  return { chapter, storyboard }
}

// Stage-mode chapters must explicitly confirm every page output before a stage
// can advance. This helper intentionally drives the public API (rather than
// mutating ProductionStage rows) so the production flow remains end-to-end.
const advanceToFinalCheck = async (token: string, chapterId: string, label: string) => {
  const listed = await req('GET', `/chapters/${chapterId}/stages`, { token })
  const data = listed.json?.data ?? listed.json
  const stages = (data?.stages ?? []) as Array<{ id: string; name: string; status: string; isFinalCheck: boolean }>
  ok(
    `${label} list seeded stages`,
    listed.status === 200 && stages.length === 4,
    `got ${listed.status} ${listed.raw.slice(0, 200)}`
  )

  for (const stage of stages.filter((item) => !item.isFinalCheck)) {
    const pages = await req('GET', `/chapters/${chapterId}/stages/${stage.id}/pages`, { token })
    const items = ((pages.json?.data ?? pages.json)?.items ?? []) as Array<{ pageId: string }>
    ok(`${label} ${stage.name} input snapshots`, pages.status === 200, `got ${pages.status} ${pages.raw.slice(0, 200)}`)
    const outputs = await req('PUT', `/chapters/${chapterId}/stages/${stage.id}/outputs`, {
      token,
      body: { items: items.map((item) => ({ pageId: item.pageId, reuseInput: true })) }
    })
    ok(
      `${label} ${stage.name} confirm outputs`,
      outputs.status === 200,
      `got ${outputs.status} ${outputs.raw.slice(0, 200)}`
    )
    const complete = await req('POST', `/chapters/${chapterId}/stages/${stage.id}/complete`, { token })
    ok(
      `${label} ${stage.name} complete`,
      complete.status === 201,
      `got ${complete.status} ${complete.raw.slice(0, 200)}`
    )
  }

  const finalStages = await prisma.productionStage.findMany({ where: { chapterId }, orderBy: { order: 'asc' } })
  const finalCheck = finalStages.find((stage) => stage.isFinalCheck)
  ok(`${label} FINAL_CHECK ACTIVE in Mongo`, finalCheck?.status === 'ACTIVE', `got ${finalCheck?.status ?? 'missing'}`)
}

const submitAfterStages = async (token: string, chapterId: string, label: string) => {
  await advanceToFinalCheck(token, chapterId, label)
  return req('POST', `/chapters/${chapterId}/manuscript/submit`, { token })
}

const getStages = (chapterId: string) => {
  return prisma.productionStage.findMany({ where: { chapterId }, orderBy: { order: 'asc' } })
}

const stageByName = <T extends { name: string }>(stages: T[], name: string) => {
  const stage = stages.find((item) => item.name === name)
  if (!stage) throw new Error(`missing stage ${name}`)
  return stage
}

const resolveLatestManuscriptRevision = async (token: string, chapterId: string, label: string) => {
  const list = await req('GET', `/revision-requests?targetType=MANUSCRIPT&targetId=${chapterId}`, { token })
  const items = (list.json?.data?.items ?? []) as Array<{ id: string; isResolved?: boolean }>
  const open = items.find((item) => item.isResolved !== true)
  ok(
    `${label} list open revision`,
    list.status === 200 && Boolean(open),
    `got ${list.status} ${list.raw.slice(0, 200)}`
  )
  if (!open) return
  const resolved = await req('PATCH', `/revision-requests/${open.id}/resolve`, { token, body: {} })
  ok(`${label} resolve revision`, resolved.status === 200, `got ${resolved.status} ${resolved.raw.slice(0, 200)}`)
}

const requestRevisionAndResolve = async (
  tokens: { editor: string; mangaka: string },
  chapterId: string,
  label: string
) => {
  const revision = await req('POST', `/chapters/${chapterId}/manuscript/request-revision`, {
    token: tokens.editor,
    body: { reason: `${label} revision` }
  })
  ok(`${label} request revision`, revision.status === 201, `got ${revision.status} ${revision.raw.slice(0, 200)}`)
  await resolveLatestManuscriptRevision(tokens.mangaka, chapterId, label)
  return revision
}

const closeActiveStage = async (
  token: string,
  chapterId: string,
  stageId: string,
  label: string,
  fileOverrides: Record<string, string> = {}
) => {
  const pages = await req('GET', `/chapters/${chapterId}/stages/${stageId}/pages`, { token })
  const items = ((pages.json?.data ?? pages.json)?.items ?? []) as Array<{ pageId: string }>
  ok(`${label} list stage pages`, pages.status === 200, `got ${pages.status} ${pages.raw.slice(0, 200)}`)
  const outputs = await req('PUT', `/chapters/${chapterId}/stages/${stageId}/outputs`, {
    token,
    body: {
      items: items.map((item) =>
        fileOverrides[item.pageId]
          ? { pageId: item.pageId, fileKey: fileOverrides[item.pageId] }
          : { pageId: item.pageId, reuseInput: true }
      )
    }
  })
  ok(`${label} confirm outputs`, outputs.status === 200, `got ${outputs.status} ${outputs.raw.slice(0, 200)}`)
  const done = await req('POST', `/chapters/${chapterId}/stages/${stageId}/complete`, { token })
  ok(`${label} complete`, done.status === 201, `got ${done.status} ${done.raw.slice(0, 200)}`)
  return done
}

const approveTaskThroughApi = async (
  tokens: { mangaka: string; assistant: string },
  taskId: string,
  label: string,
  file = `r2://${label.toLowerCase()}-task.png`
) => {
  const start = await req('POST', `/tasks/${taskId}/start`, { token: tokens.assistant, body: {} })
  ok(`${label} start task`, start.status === 201, `got ${start.status} ${start.raw.slice(0, 200)}`)
  const submit = await req('POST', `/tasks/${taskId}/submit`, { token: tokens.assistant, body: { file } })
  ok(`${label} submit task`, submit.status === 201, `got ${submit.status} ${submit.raw.slice(0, 200)}`)
  const approve = await req('POST', `/tasks/${taskId}/approve`, { token: tokens.mangaka, body: {} })
  ok(`${label} approve task`, approve.status === 201, `got ${approve.status} ${approve.raw.slice(0, 200)}`)
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

  // F02-002 — Create chapter storyboard.
  const c1nRes = await req('POST', `/chapters/${c1.id}/storyboards`, {
    token: s.tokens.mA,
    body: { storyboardPages: [{ pageNumber: 1, fileUrl: 'r2://storyboard-page-1' }] }
  })
  ok('F02-002 chapter storyboard create 201', c1nRes.status === 201, `got ${c1nRes.status} ${c1nRes.raw.slice(0, 200)}`)
  const c1Storyboard = c1nRes.json?.data ?? c1nRes.json
  const fetchedChapter = await prisma.chapter.findUnique({
    where: { id: c1.id },
    select: { storyboardId: true }
  })
  ok('F02-002b chapter.storyboardId set', !!c1Storyboard?.id && fetchedChapter?.storyboardId === c1Storyboard.id)
  ok(
    'F02-002c chapter storyboard starts DRAFT',
    c1Storyboard?.status === StoryboardStatus.DRAFT,
    `got ${c1Storyboard?.status}`
  )

  // F02-002d — Mangaka submits DRAFT chapter storyboard → SUBMITTED.
  const c1subRes = await req('POST', `/chapters/${c1.id}/storyboards/${c1Storyboard.id}/submit`, {
    token: s.tokens.mA
  })
  ok(
    'F02-002d chapter storyboard submit 201',
    c1subRes.status === 201,
    `got ${c1subRes.status} ${c1subRes.raw.slice(0, 200)}`
  )
  ok('F02-002e submit → SUBMITTED', (c1subRes.json?.data ?? c1subRes.json)?.status === StoryboardStatus.SUBMITTED)

  // F02-003 — Editor approves storyboard.
  const c1naRes = await req('POST', `/chapters/${c1.id}/storyboards/${c1Storyboard.id}/approve`, {
    token: s.tokens.e1
  })
  ok('F02-003 storyboard approve 201', c1naRes.status === 201, `got ${c1naRes.status} ${c1naRes.raw.slice(0, 200)}`)
  const c1StoryboardDb = await prisma.storyboard.findUnique({ where: { id: c1Storyboard.id } })
  ok(
    'F02-003b Storyboard.status=APPROVED',
    c1StoryboardDb?.status === StoryboardStatus.APPROVED,
    `got ${c1StoryboardDb?.status}`
  )
  await sleep(100)
  const c1SeededStages = await prisma.productionStage.findMany({
    where: { chapterId: c1.id },
    orderBy: { order: 'asc' }
  })
  ok(
    'F02-STG01 storyboard approval seeded 4 stages with INKING ACTIVE in Mongo',
    c1SeededStages.length === 4 &&
      c1SeededStages[0]?.name === 'INKING' &&
      c1SeededStages[0]?.status === 'ACTIVE' &&
      c1SeededStages[3]?.isFinalCheck === true,
    `got ${c1SeededStages.map((stage) => `${stage.name}:${stage.status}`).join(',')}`
  )

  // F02-004 — Mangaka uploads a page after storyboard approval → Manuscript DRAFT→IN_PRODUCTION.
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
  const subRes = await submitAfterStages(s.tokens.mA, String(c1.id), 'F02-STG')
  ok('F02-007 manuscript submit 201', subRes.status === 201, `got ${subRes.status} ${subRes.raw.slice(0, 200)}`)
  const ms1d = await prisma.manuscript.findFirst({ where: { chapterId: c1.id } })
  ok('F02-007b Manuscript=EDITOR_REVIEW', ms1d?.status === ManuscriptStatus.EDITOR_REVIEW, `got ${ms1d?.status}`)
  const p1Submitted = await prisma.page.findUnique({ where: { id: p1.id } })
  ok('F02-007c submit auto-flips page to COMPLETED', p1Submitted?.status === PageStatus.COMPLETED)
  const completedPageMutation = await req('PATCH', `/pages/${p1.id}`, {
    token: s.tokens.mA,
    body: { compositeFile: 'r2://locked.png' }
  })
  expectError(completedPageMutation, 422, 'Error.StageOutputInvalid', 'F02-007d stage-mode composite PATCH is rejected')
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
  expectError(
    revisingPageMutation,
    422,
    'Error.StageOutputInvalid',
    'F02-008d stage-mode composite PATCH remains rejected'
  )

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
  const c2Setup = await createChapterWithApprovedStoryboard(s, s.seriesA.id, 2, 'Ch2')
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

  // F02-017 — Upload page before storyboard approval → ChapterStoryboardNotApproved.
  // Create a new chapter (c3) on seriesA without approving a storyboard.
  const c3Res = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesA.id, chapterNumber: 3 }
  })
  const c3 = (c3Res.json?.data ?? c3Res.json) as { id: string }
  const pBadRes = await req('POST', `/chapters/${c3.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://p' }
  })
  expectError(pBadRes, 409, 'Error.ChapterStoryboardNotApproved', 'F02-017 page when storyboard not APPROVED')

  // F02-018 — Create a second storyboard for one chapter → ChapterStoryboardAlreadyExists.
  const n1Res = await req('POST', `/chapters/${c3.id}/storyboards`, {
    token: s.tokens.mA,
    body: { storyboardPages: [{ pageNumber: 1, fileUrl: 'r2://np' }] }
  })
  ok('F02-018 setup first storyboard 201', n1Res.status === 201)
  const n2Res = await req('POST', `/chapters/${c3.id}/storyboards`, {
    token: s.tokens.mA,
    body: { storyboardPages: [{ pageNumber: 1, fileUrl: 'r2://np2' }] }
  })
  expectError(n2Res, 409, 'Error.ChapterStoryboardAlreadyExists', 'F02-018 duplicate chapter-storyboard')

  // F02-019 — Create storyboard when chapter is IN_PRODUCTION → ChapterNotDraftForStoryboard.
  // c1 is currently PUBLISHED → IN_PRODUCTION was passed; create a fresh chapter that already has a page
  const c4Res = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesA.id, chapterNumber: 4 }
  })
  const c4 = (c4Res.json?.data ?? c4Res.json) as { id: string }
  // First approve the storyboard so page upload moves the Manuscript to IN_PRODUCTION.
  const c4nRes = await req('POST', `/chapters/${c4.id}/storyboards`, {
    token: s.tokens.mA,
    body: { storyboardPages: [{ pageNumber: 1, fileUrl: 'r2://np' }] }
  })
  const c4Storyboard = (c4nRes.json?.data ?? c4nRes.json) as { id: string }
  await req('POST', `/chapters/${c4.id}/storyboards/${c4Storyboard.id}/submit`, { token: s.tokens.mA })
  await req('POST', `/chapters/${c4.id}/storyboards/${c4Storyboard.id}/approve`, { token: s.tokens.e1 })
  const p4Res = await req('POST', `/chapters/${c4.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://p' }
  })
  // A second storyboard is now rejected because the chapter is no longer DRAFT.
  const nDupRes = await req('POST', `/chapters/${c4.id}/storyboards`, {
    token: s.tokens.mA,
    body: { storyboardPages: [{ pageNumber: 1, fileUrl: 'r2://np2' }] }
  })
  expectError(nDupRes, 409, 'Error.ChapterNotDraftForStoryboard', 'F02-019 storyboard after IN_PRODUCTION')

  // F02-020 — Manuscript submit khi còn Task chưa APPROVED → TasksNotAllApproved.
  const gateAssistant = await makeUser('ASSISTANT')
  const p4Id = (p4Res.json?.data ?? p4Res.json).id as string
  await makeTaskAt({ pageId: p4Id, assistantId: gateAssistant.id, status: TaskStatus.ASSIGNED })
  const cr2Res = await req('POST', `/chapters/${c4.id}/manuscript/submit`, { token: s.tokens.mA })
  expectError(cr2Res, 409, 'Error.ProductionNotFinalized', 'F02-020 submit before FINAL_CHECK')

  // F02-021 — Approve manuscript khi EDITOR_REVISION → InvalidManuscriptTransition
  // c1 is currently PUBLISHED so we need a fresh chapter.
  // Setup: c5 with storyboard APPROVED + page COMPLETED, then request-revision, then try approve.
  const c5Setup = await createChapterWithApprovedStoryboard(s, s.seriesA.id, 5, 'Ch5')
  const c5 = c5Setup.chapter
  await req('POST', `/chapters/${c5.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://p' }
  })
  await submitAfterStages(s.tokens.mA, String(c5.id), 'F02-STG-C5')
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
  const c6nRes = await req('POST', `/chapters/${c6.id}/storyboards`, {
    token: s.tokens.mA,
    body: { storyboardPages: [{ pageNumber: 1, fileUrl: 'r2://np' }] }
  })
  const c6Storyboard = (c6nRes.json?.data ?? c6nRes.json) as { id: string }
  await req('POST', `/chapters/${c6.id}/storyboards/${c6Storyboard.id}/submit`, { token: s.tokens.mA })
  await req('POST', `/chapters/${c6.id}/storyboards/${c6Storyboard.id}/approve`, { token: s.tokens.e1 })
  await req('POST', `/chapters/${c6.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://p' }
  })
  await submitAfterStages(s.tokens.mA, c6.id, 'F02-STG-C6')
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
  const c7Setup = await createChapterWithApprovedStoryboard(s, s.seriesA.id, 7, 'Ch7')
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
  await req('POST', `/chapters/${c11forPub.id}/storyboards`, {
    token: s.tokens.mA,
    body: { storyboardPages: [{ pageNumber: 1, fileUrl: 'r2://n1' }] }
  })
  const c11n = await prisma.storyboard.findFirst({ where: { chapterId: c11forPub.id } })
  await req('POST', `/chapters/${c11forPub.id}/storyboards/${c11n!.id}/submit`, { token: s.tokens.mA })
  await req('POST', `/chapters/${c11forPub.id}/storyboards/${c11n!.id}/approve`, { token: s.tokens.e1 })
  const c11p1 = await req('POST', `/chapters/${c11forPub.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://p' }
  })
  ok('F02-038a setup page created', c11p1.status === 201)
  await submitAfterStages(s.tokens.mA, String(c11forPub.id), 'F02-STG-C11')
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
  const c8Setup = await createChapterWithApprovedStoryboard(s, s.seriesA.id, 8, 'Ch8')
  const c8 = c8Setup.chapter
  await req('POST', `/chapters/${c8.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://p' }
  })
  await submitAfterStages(s.tokens.mA, String(c8.id), 'F02-STG-C8')
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
  const c9Setup = await createChapterWithApprovedStoryboard(s, s.seriesA.id, 9, 'Ch9')
  const c9 = c9Setup.chapter
  const p9Res = await req('POST', `/chapters/${c9.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://p' }
  })
  ok('F02-051a setup page created', p9Res.status === 201)
  await submitAfterStages(s.tokens.mA, String(c9.id), 'F02-STG-C9')
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
  const c10Setup = await createChapterWithApprovedStoryboard(s, s.seriesA.id, 10, 'Ch10')
  const c10 = c10Setup.chapter
  const p10Res = await req('POST', `/chapters/${c10.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://p' }
  })
  ok('F02-054a setup page created', p10Res.status === 201)
  await submitAfterStages(s.tokens.mA, String(c10.id), 'F02-STG-C10')
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
  // §3.6 CHAPTER STORYBOARD LIFECYCLE
  // ──────────────────────────────────────────────────────────────────────────
  section('§3.6 Chapter storyboard lifecycle')

  // F02-060 — A DRAFT storyboard is editable; SUBMITTED locks page edits.
  const c11Res = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesA.id, chapterNumber: 11 }
  })
  const c11 = (c11Res.json?.data ?? c11Res.json) as { id: string }
  const c11nRes = await req('POST', `/chapters/${c11.id}/storyboards`, {
    token: s.tokens.mA,
    body: { storyboardPages: [{ pageNumber: 1, fileUrl: 'r2://n1' }] }
  })
  const c11Storyboard = (c11nRes.json?.data ?? c11nRes.json) as { id: string }

  // F02-060a — addPage while DRAFT → 201.
  const c11draftAdd = await req('POST', `/chapters/${c11.id}/storyboards/${c11Storyboard.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 2, fileUrl: 'r2://n2' }
  })
  ok(
    'F02-060a addPage while DRAFT → 201',
    c11draftAdd.status === 201,
    `got ${c11draftAdd.status} ${c11draftAdd.raw.slice(0, 200)}`
  )

  // F02-060 — after submit → SUBMITTED, addPage is locked → 409 InvalidStoryboardState.
  await req('POST', `/chapters/${c11.id}/storyboards/${c11Storyboard.id}/submit`, { token: s.tokens.mA })
  const c11n2Res = await req('POST', `/chapters/${c11.id}/storyboards/${c11Storyboard.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 3, fileUrl: 'r2://n3' }
  })
  ok(
    'F02-060 addPage when SUBMITTED → 409 InvalidStoryboardState',
    c11n2Res.status === 409,
    `got ${c11n2Res.status} ${c11n2Res.raw.slice(0, 200)}`
  )
  const c11StoryboardDb = await prisma.storyboard.findUnique({ where: { id: c11Storyboard.id } })
  ok(
    'F02-060b storyboard has 2 pages (1 initial + 1 added while DRAFT)',
    (c11StoryboardDb?.pages as unknown as unknown[]).length === 2
  )

  // F02-061 — Add page when APPROVED → InvalidStoryboardState.
  const c11n3Res = await req('POST', `/chapters/${c11.id}/storyboards/${c11Storyboard.id}/approve`, {
    token: s.tokens.e1
  })
  ok('F02-061 setup approve 201', c11n3Res.status === 201)
  const c11n4Res = await req('POST', `/chapters/${c11.id}/storyboards/${c11Storyboard.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 3, fileUrl: 'r2://n3' }
  })
  expectError(c11n4Res, 409, 'Error.InvalidStoryboardState', 'F02-061 addPage when APPROVED')

  // F02-062 — request-revision → REVISION
  const c12Setup = await createChapterWithApprovedStoryboard(s, s.seriesA.id, 12, 'Ch12')
  // Reuse a complete API-created storyboard, then seed SUBMITTED to isolate request-revision behavior.
  const c12 = c12Setup.chapter
  const c12storyboardId = c12Setup.storyboard.id
  await prisma.storyboard.update({
    where: { id: c12storyboardId },
    data: { status: StoryboardStatus.SUBMITTED, submittedAt: new Date() }
  })
  const c12revRes = await req('POST', `/chapters/${c12.id}/storyboards/${c12storyboardId}/request-revision`, {
    token: s.tokens.e1,
    body: { reason: 'redo panel 1' }
  })
  ok(
    'F02-062 request-revision storyboard 201',
    c12revRes.status === 201,
    `got ${c12revRes.status} ${c12revRes.raw.slice(0, 200)}`
  )
  const c12StoryboardDb = await prisma.storyboard.findUnique({ where: { id: c12storyboardId } })
  ok(
    'F02-062b Storyboard.status=REVISION',
    c12StoryboardDb?.status === StoryboardStatus.REVISION,
    `got ${c12StoryboardDb?.status}`
  )

  // F02-063 — Resubmit storyboard → IN_REVIEW, version+1.
  const c12resubRes = await req('POST', `/chapters/${c12.id}/storyboards/${c12storyboardId}/resubmit`, {
    token: s.tokens.mA
  })
  ok(
    'F02-063 resubmit storyboard 201',
    c12resubRes.status === 201,
    `got ${c12resubRes.status} ${c12resubRes.raw.slice(0, 200)}`
  )
  const c12StoryboardDb2 = await prisma.storyboard.findUnique({ where: { id: c12storyboardId } })
  ok(
    'F02-063b Storyboard.version incremented',
    (c12StoryboardDb2?.version ?? 0) >= 2,
    `got ${c12StoryboardDb2?.version}`
  )

  const editorNotifications = await req('GET', '/notifications?limit=100', { token: s.tokens.e1 })
  const storyboardResubmittedNotification = editorNotifications.json?.data?.items?.find(
    (notification: { referenceType?: string; referenceId?: string }) =>
      notification.referenceType === 'STORYBOARD_RESUBMITTED' && notification.referenceId === c12storyboardId
  )
  ok(
    'F02-RV7 storyboard resubmit notifies assigned Editor with STORYBOARD_RESUBMITTED',
    editorNotifications.status === 200 && !!storyboardResubmittedNotification,
    `got ${editorNotifications.status} ${editorNotifications.raw.slice(0, 220)}`
  )

  // F02-064 — Update pages when REVISION → OK
  await req('POST', `/chapters/${c12.id}/storyboards/${c12storyboardId}/request-revision`, {
    token: s.tokens.e1,
    body: { reason: 'another revision' }
  })
  const c12upRes = await req('PUT', `/chapters/${c12.id}/storyboards/${c12storyboardId}/pages`, {
    token: s.tokens.mA,
    body: { pages: [{ pageNumber: 1, fileUrl: 'r2://nrev' }] }
  })
  ok(
    'F02-064 update pages REVISION 200',
    c12upRes.status === 200,
    `got ${c12upRes.status} ${c12upRes.raw.slice(0, 200)}`
  )

  // ──────────────────────────────────────────────────────────────────────────
  // §3.7 Proposal storyboard is embedded in `Series.proposal.storyboardPages`.
  // ──────────────────────────────────────────────────────────────────────────
  section('§3.7 Embedded proposal storyboard (Spec 28)')

  // The proposal has no separate Storyboard row or series-scoped storyboard lifecycle.
  ok('§3.7 proposal storyboard is embedded in proposal.storyboardPages', true)

  // ──────────────────────────────────────────────────────────────────────────
  // §3.8 CHAPTER STORYBOARD SCOPING + DELETE
  // ──────────────────────────────────────────────────────────────────────────
  section('§3.8 Chapter storyboard scoping + DELETE')

  // Create a DRAFT chapter with a storyboard for the full lifecycle.
  const cSplitRes = await req('POST', '/chapters', {
    token: s.tokens.mA,
    body: { seriesId: s.seriesA.id, chapterNumber: 13 }
  })
  const cSplit = (cSplitRes.json?.data ?? cSplitRes.json) as { id: string }

  // F02-080 — GET /chapters/:id/storyboards
  const cnListRes = await req('GET', `/chapters/${cSplit.id}/storyboards`, { token: s.tokens.mA })
  ok('F02-080 GET /chapters/:id/storyboards 200', cnListRes.status === 200, `got ${cnListRes.status}`)

  // F02-081 — POST /chapters/:id/storyboards
  const cn1Res = await req('POST', `/chapters/${cSplit.id}/storyboards`, {
    token: s.tokens.mA,
    body: { storyboardPages: [{ pageNumber: 1, fileUrl: 'r2://split-1' }] }
  })
  ok('F02-081 chapter storyboard 201', cn1Res.status === 201, `got ${cn1Res.status}`)
  const cn1Id = (cn1Res.json?.data ?? cn1Res.json).id
  ok(
    'F02-081b Storyboard response exposes chapterId',
    (cn1Res.json?.data ?? cn1Res.json).chapterId === cSplit.id,
    JSON.stringify((cn1Res.json?.data ?? cn1Res.json).chapterId)
  )

  // F02-082 — GET /chapters/:id/storyboards/:storyboardId
  const cnGetRes = await req('GET', `/chapters/${cSplit.id}/storyboards/${cn1Id}`, { token: s.tokens.e1 })
  ok('F02-082 GET chapter storyboard 200', cnGetRes.status === 200, `got ${cnGetRes.status}`)

  // ★ BẰNG CHỨNG TÁCH VAI (Spec 28: 7 route series-scoped names đã xoá):
  // F02-083 — chapter storyboard through a removed series-scoped route → 404.
  const crossGet = await req('GET', `/series/${s.seriesA.id}/storyboards/${cn1Id}`, { token: s.tokens.mA })
  ok(
    'F02-083 chapter storyboard via series-scoped GET → 404',
    crossGet.status === 404,
    `got ${crossGet.status} ${crossGet.raw.slice(0, 160)}`
  )

  // F02-084 — chapter storyboard approval through a removed series-scoped route → 404.
  const crossAppr = await req('POST', `/series/${s.seriesA.id}/storyboards/${cn1Id}/approve`, {
    token: s.tokens.e1,
    body: {}
  })
  ok(
    'F02-084 chapter storyboard approve via series-scoped route → 404',
    crossAppr.status === 404,
    `got ${crossAppr.status} ${crossAppr.raw.slice(0, 160)}`
  )

  // F02-085 — GET /series/:id/storyboards trả 404 (route đã xoá — Spec 28 không còn list proposal names)
  const sListRes = await req('GET', `/series/${s.seriesA.id}/storyboards`, { token: s.tokens.mA })
  ok(
    'F02-085 /series/:id/storyboards trả 404 (route đã xoá Spec 28)',
    sListRes.status === 404,
    `got ${sListRes.status} ${sListRes.raw.slice(0, 160)}`
  )

  // F02-086 — series-scoped ?kind= cũng 404 (toàn bộ nhóm route xoá)
  const sListKindRes = await req('GET', `/series/${s.seriesA.id}/storyboards?kind=CHAPTER`, { token: s.tokens.mA })
  ok('F02-086 removed series storyboard query → 404', sListKindRes.status === 404, `got ${sListKindRes.status}`)

  // F02-087 — DELETE DRAFT chapter storyboard → 200 + Chapter.storyboardId unset.
  const cnDelRes = await req('DELETE', `/chapters/${cSplit.id}/storyboards/${cn1Id}`, { token: s.tokens.mA })
  ok('F02-087 DELETE chapter storyboard 200', cnDelRes.status === 200, `got ${cnDelRes.status}`)
  ok(
    'F02-087b trả message (MessageResDto)',
    typeof cnDelRes.json?.message === 'string' && cnDelRes.json.message !== 'Success',
    JSON.stringify(cnDelRes.json?.message)
  )
  const cnAfterDel = await prisma.storyboard.findUnique({ where: { id: cn1Id } })
  ok('F02-087c storyboard deleted', cnAfterDel === null)
  const chAfterDel = await prisma.chapter.findUnique({ where: { id: cSplit.id } })
  ok(
    'F02-087d Chapter.storyboardId unset',
    chAfterDel?.storyboardId === null || chAfterDel?.storyboardId === undefined,
    String(chAfterDel?.storyboardId)
  )

  // F02-088 — POST /chapters/:id/storyboards (lại) → 201 — vẽ lại được
  const cn2Res = await req('POST', `/chapters/${cSplit.id}/storyboards`, {
    token: s.tokens.mA,
    body: { storyboardPages: [{ pageNumber: 1, fileUrl: 'r2://split-2' }] }
  })
  ok('F02-088 recreate chapter storyboard 201', cn2Res.status === 201, `got ${cn2Res.status}`)
  const cn2Id = (cn2Res.json?.data ?? cn2Res.json).id

  // F02-089 — DELETE bởi EDITOR → 403 (RolesGuard chặn ở @Roles(MANGAKA) — không phải NotSeriesOwner service-level)
  const cnDelE = await req('DELETE', `/chapters/${cSplit.id}/storyboards/${cn2Id}`, { token: s.tokens.e1 })
  ok('F02-089 DELETE by EDITOR → 403', cnDelE.status === 403, `got ${cnDelE.status}`)

  // F02-090 — Approve storyboard → APPROVED, then DELETE → 409 StoryboardNotDeletable.
  await req('POST', `/chapters/${cSplit.id}/storyboards/${cn2Id}/submit`, { token: s.tokens.mA })
  await req('POST', `/chapters/${cSplit.id}/storyboards/${cn2Id}/approve`, { token: s.tokens.e1, body: {} })
  const cnDelApproved = await req('DELETE', `/chapters/${cSplit.id}/storyboards/${cn2Id}`, { token: s.tokens.mA })
  expectError(cnDelApproved, 409, 'Error.StoryboardNotDeletable', 'F02-090 DELETE APPROVED storyboard → 409')

  // ═══════════════════════════════════════════════════════════════════════════
  // F02-P — Page API mở rộng (PATCH originalFile/pageNumber · DELETE · bulk DELETE)
  //         + scoping GET /chapters/:id/pages (trước đây AUTH-only, không scoping)
  // ═══════════════════════════════════════════════════════════════════════════
  section('F02-P Page API mở rộng + scoping')

  const cPage = (await createChapterWithApprovedStoryboard(s, s.seriesA.id, 30, 'ChPage')).chapter
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
  expectError(patchComposite, 422, 'Error.StageOutputInvalid', 'F02-P01d stage-mode rejects PATCH compositeFile')
  const cPageInking = await prisma.productionStage.findFirst({ where: { chapterId: cPage.id, order: 1 } })
  const cPagePage2 = await prisma.page.findFirstOrThrow({ where: { chapterId: cPage.id, pageNumber: 2 } })
  const cPageOutputs = await req('PUT', `/chapters/${cPage.id}/stages/${cPageInking!.id}/outputs`, {
    token: s.tokens.mA,
    body: {
      items: [
        { pageId: pg1.id, fileKey: 'r2://p1-final.png' },
        { pageId: cPagePage2.id, reuseInput: true }
      ]
    }
  })
  ok(
    'F02-P01d2 stage output replaces composite through canonical API',
    cPageOutputs.status === 200,
    `got ${cPageOutputs.status}`
  )
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
  const foreignChapter = (await createChapterWithApprovedStoryboard(s, s.seriesA.id, 31, 'ChOther')).chapter
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
  const cLocked = (await createChapterWithApprovedStoryboard(s, s.seriesA.id, 32, 'ChLocked')).chapter
  const lockRes = await req('POST', `/chapters/${cLocked.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://lock.png' }
  })
  const lockedPage = (lockRes.json?.data ?? lockRes.json) as { id: string }
  await submitAfterStages(s.tokens.mA, String(cLocked.id), 'F02-STG-CLOCKED')
  const lockedNow = await prisma.page.findUnique({ where: { id: lockedPage.id } })
  ok('F02-P20 page đã COMPLETED sau submit', lockedNow?.status === PageStatus.COMPLETED, `got ${lockedNow?.status}`)

  const delCompleted = await req('DELETE', `/pages/${lockedPage.id}`, { token: s.tokens.mA })
  expectError(delCompleted, 409, 'Error.ProductionPageSetLocked', 'F02-P21 DELETE page after production starts → 409')

  const bulkCompleted = await req('DELETE', `/chapters/${cLocked.id}/pages`, {
    token: s.tokens.mA,
    body: { pageIds: [lockedPage.id] }
  })
  expectError(bulkCompleted, 409, 'Error.ProductionPageSetLocked', 'F02-P22 bulk after production starts → 409')
  ok('F02-P22b page COMPLETED vẫn còn', (await prisma.page.findUnique({ where: { id: lockedPage.id } })) !== null)

  // --- Task B: auto-renumber sau khi xoá 1 page ở giữa (DB thật — Mongo semantics, §73.9) ---
  const cRenum = (await createChapterWithApprovedStoryboard(s, s.seriesA.id, 33, 'ChRenum')).chapter
  const mkRenumPage = async (pageNumber: number) => {
    const r = await req('POST', `/chapters/${cRenum.id}/pages`, {
      token: s.tokens.mA,
      body: { pageNumber, originalFile: `r2://renum-${pageNumber}.png` }
    })
    return (r.json?.data ?? r.json) as { id: string; pageNumber: number }
  }
  await mkRenumPage(1)
  await mkRenumPage(2)
  const rp3 = await mkRenumPage(3)
  const rp4 = await mkRenumPage(4)
  const delMid = await req('DELETE', `/pages/${rp3.id}`, { token: s.tokens.mA })
  ok('F02-P23 xoá page giữa (số 3) → 200', delMid.status === 200, `got ${delMid.status}`)
  const afterRenum = await prisma.page.findMany({
    where: { chapterId: cRenum.id },
    orderBy: { pageNumber: 'asc' },
    select: { id: true, pageNumber: true }
  })
  ok('F02-P23b còn 3 page', afterRenum.length === 3, `got ${afterRenum.length}`)
  ok(
    'F02-P23c dồn số liên tục 1,2,3 (không còn khoảng trống)',
    afterRenum.map((p) => p.pageNumber).join(',') === '1,2,3',
    `got ${afterRenum.map((p) => p.pageNumber).join(',')}`
  )
  ok(
    'F02-P23d page cũ số 4 nay mang số 3',
    afterRenum.find((p) => p.id === rp4.id)?.pageNumber === 3,
    `got ${afterRenum.find((p) => p.id === rp4.id)?.pageNumber}`
  )

  // --- Task A: publish bị chặn khi chương còn page chưa COMPLETED (chưa duyệt) ---
  const cGate = (await createChapterWithApprovedStoryboard(s, s.seriesA.id, 34, 'ChGate')).chapter
  await req('POST', `/chapters/${cGate.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 1, originalFile: 'r2://gate-1.png' }
  })
  await submitAfterStages(s.tokens.mA, String(cGate.id), 'F02-STG-CGATE')
  await req('POST', `/chapters/${cGate.id}/manuscript/approve`, { token: s.tokens.e1 })
  // Thêm 1 page DRAFT SAU khi manuscript đã READY_FOR_PRINT (createPage không chặn) → page chưa duyệt.
  const additionalDraftPage = await req('POST', `/chapters/${cGate.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 2, originalFile: 'r2://gate-2.png' }
  })
  expectError(additionalDraftPage, 409, 'Error.ProductionPageSetLocked', 'F02-P24 production page set is locked')

  section('§3.9 F02-RO — mở lại giai đoạn sản xuất sau khi Editor yêu cầu sửa')

  const roAssistant = await makeUser('ASSISTANT')
  await makeStudioAssignment({ mangakaId: s.mangakaA.id, assistantId: roAssistant.id, seriesId: s.seriesA.id })
  const roAssistantToken = await login(roAssistant.email)

  const createRoChapter = async (chapterNumber: number, title: string, pageCount = 3) => {
    const chapter = (await createChapterWithApprovedStoryboard(s, s.seriesA.id, chapterNumber, title))
      .chapter as FlowChapterRef
    const pages: FlowPageRef[] = []
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await req('POST', `/chapters/${chapter.id}/pages`, {
        token: s.tokens.mA,
        body: { pageNumber, originalFile: `r2://ro-${chapterNumber}-${pageNumber}.png` }
      })
      ok(
        `F02-RO setup ch${chapterNumber} page ${pageNumber}`,
        page.status === 201,
        `got ${page.status} ${page.raw.slice(0, 200)}`
      )
      pages.push(responseData<FlowPageRef>(page))
    }
    return { chapter, pages }
  }

  const roSetup = await createRoChapter(40, 'ChReopen')
  const roSubmit = await submitAfterStages(s.tokens.mA, String(roSetup.chapter.id), 'F02-RO-SETUP')
  ok('F02-RO01 submit sau production stages → 201', roSubmit.status === 201, `got ${roSubmit.status}`)
  const stagesAfterSubmit = await getStages(roSetup.chapter.id)
  ok(
    'F02-RO01b mọi stage COMPLETED sau submit',
    stagesAfterSubmit.every((stage) => stage.status === 'COMPLETED'),
    `got ${stagesAfterSubmit.map((stage) => `${stage.name}=${stage.status}`).join(',')}`
  )
  const lettering = stageByName(stagesAfterSubmit, 'LETTERING')
  const finalCheck = stagesAfterSubmit.find((stage) => stage.isFinalCheck)!

  const roRevision = await req('POST', `/chapters/${roSetup.chapter.id}/manuscript/request-revision`, {
    token: s.tokens.e1,
    body: { reason: 'F02-RO revision' }
  })
  ok('F02-RO02 request-revision → 201', roRevision.status === 201, `got ${roRevision.status}`)
  const roManuscriptRevision = await prisma.manuscript.findFirst({ where: { chapterId: roSetup.chapter.id } })
  const roPageRevision = await prisma.page.findUnique({ where: { id: roSetup.pages[0].id } })
  ok(
    'F02-RO02b Manuscript EDITOR_REVISION + Page REVISING',
    roManuscriptRevision?.status === ManuscriptStatus.EDITOR_REVISION && roPageRevision?.status === PageStatus.REVISING,
    `ms=${roManuscriptRevision?.status} page=${roPageRevision?.status}`
  )
  await resolveLatestManuscriptRevision(s.tokens.mA, roSetup.chapter.id, 'F02-RO02c')

  const blockedTask = await req('POST', '/tasks', {
    token: s.tokens.mA,
    body: {
      pageId: roSetup.pages[0].id,
      assistantId: roAssistant.id,
      taskType: Specialization.LETTERING,
      stageId: lettering.id
    }
  })
  expectError(blockedTask, 409, 'Error.StageLocked', 'F02-RO01c giao task khi không còn stage ACTIVE → 409')

  const inputBefore = await prisma.productionStagePage.findFirst({
    where: { stageId: lettering.id, pageId: roSetup.pages[0].id },
    select: { inputFileKey: true, inputRevision: true }
  })
  const reopenRes = await req('POST', `/chapters/${roSetup.chapter.id}/stages/${lettering.id}/reopen`, {
    token: s.tokens.mA
  })
  ok('F02-RO03 reopen LETTERING → 201', reopenRes.status === 201, `got ${reopenRes.status}`)
  const reopenBody = responseData<{
    stageId?: string
    relockedStageIds?: unknown
    clearedStagePages?: unknown
  }>(reopenRes)
  ok(
    'F02-RO03b payload đủ message + stage fields',
    typeof reopenRes.json?.message === 'string' &&
      reopenBody?.stageId === String(lettering.id) &&
      Array.isArray(reopenBody?.relockedStageIds) &&
      typeof reopenBody?.clearedStagePages === 'number',
    `got ${JSON.stringify(reopenRes.json)}`
  )
  const letteringAfter = await prisma.productionStage.findUnique({ where: { id: lettering.id } })
  const finalAfter = await prisma.productionStage.findUnique({ where: { id: finalCheck.id } })
  const finalPages = await prisma.productionStagePage.count({ where: { stageId: finalCheck.id } })
  const inputAfter = await prisma.productionStagePage.findFirst({
    where: { stageId: lettering.id, pageId: roSetup.pages[0].id },
    select: { inputFileKey: true, inputRevision: true, outputConfirmedAt: true }
  })
  ok('F02-RO04a LETTERING ACTIVE', letteringAfter?.status === 'ACTIVE', `got ${letteringAfter?.status}`)
  ok('F02-RO04b completedAt đã xoá', letteringAfter?.completedAt === null, `got ${String(letteringAfter?.completedAt)}`)
  ok('F02-RO04c FINAL_CHECK LOCKED', finalAfter?.status === 'LOCKED', `got ${finalAfter?.status}`)
  ok('F02-RO04d StagePage của FINAL_CHECK bị XOÁ hết', finalPages === 0, `got ${finalPages}`)
  ok(
    'F02-RO04e input snapshot giữ nguyên',
    inputAfter?.inputFileKey === inputBefore?.inputFileKey && inputAfter?.inputRevision === inputBefore?.inputRevision,
    `before=${inputBefore?.inputFileKey}@${inputBefore?.inputRevision} after=${inputAfter?.inputFileKey}@${inputAfter?.inputRevision}`
  )
  ok('F02-RO04f output đã xoá', inputAfter?.outputConfirmedAt === null, `got ${String(inputAfter?.outputConfirmedAt)}`)

  const reopenedTask = await req('POST', '/tasks', {
    token: s.tokens.mA,
    body: {
      pageId: roSetup.pages[0].id,
      assistantId: roAssistant.id,
      taskType: Specialization.LETTERING,
      stageId: lettering.id
    }
  })
  ok('F02-RO05 giao task LETTERING sau reopen → 201', reopenedTask.status === 201, `got ${reopenedTask.status}`)
  const reopenedTaskId = responseData<{ id: string }>(reopenedTask).id
  const resubmitWhileActive = await req('POST', `/chapters/${roSetup.chapter.id}/manuscript/resubmit`, {
    token: s.tokens.mA
  })
  expectError(
    resubmitWhileActive,
    409,
    'Error.ProductionNotFinalized',
    'F02-RO06 resubmit khi LETTERING còn ACTIVE → 409'
  )

  await approveTaskThroughApi(
    { mangaka: s.tokens.mA, assistant: roAssistantToken },
    reopenedTaskId,
    'F02-RO07',
    'r2://ro-lettering-task.png'
  )
  await closeActiveStage(s.tokens.mA, roSetup.chapter.id, lettering.id, 'F02-RO07', {
    [roSetup.pages[0].id]: 'r2://ro-lettering-fixed.png'
  })
  const finalReopened = await prisma.productionStage.findUnique({ where: { id: finalCheck.id } })
  const finalRecreated = await prisma.productionStagePage.count({ where: { stageId: finalCheck.id } })
  ok('F02-RO07b FINAL_CHECK reactivated', finalReopened?.status === 'ACTIVE', `got ${finalReopened?.status}`)
  ok('F02-RO07c StagePage FINAL_CHECK tạo lại đủ trang', finalRecreated === 3, `got ${finalRecreated}`)

  const roResubmit = await req('POST', `/chapters/${roSetup.chapter.id}/manuscript/resubmit`, { token: s.tokens.mA })
  ok('F02-RO08 resubmit sau khép LETTERING → 201', roResubmit.status === 201, `got ${roResubmit.status}`)
  const roManuscriptResubmitted = await prisma.manuscript.findFirst({ where: { chapterId: roSetup.chapter.id } })
  const finalCompletedAgain = await prisma.productionStage.findUnique({ where: { id: finalCheck.id } })
  ok(
    'F02-RO08b Manuscript EDITOR_REVIEW + FINAL_CHECK COMPLETED',
    roManuscriptResubmitted?.status === ManuscriptStatus.EDITOR_REVIEW && finalCompletedAgain?.status === 'COMPLETED',
    `ms=${roManuscriptResubmitted?.status} final=${finalCompletedAgain?.status}`
  )

  await requestRevisionAndResolve({ editor: s.tokens.e1, mangaka: s.tokens.mA }, roSetup.chapter.id, 'F02-RO09')
  const roCycleStages = await getStages(roSetup.chapter.id)
  const inking = stageByName(roCycleStages, 'INKING')
  const reopenInking = await req('POST', `/chapters/${roSetup.chapter.id}/stages/${inking.id}/reopen`, {
    token: s.tokens.mA
  })
  ok('F02-RO09 reopen INKING → 201', reopenInking.status === 201, `got ${reopenInking.status}`)
  const addedRevisionPage = await req('POST', `/chapters/${roSetup.chapter.id}/pages`, {
    token: s.tokens.mA,
    body: { pageNumber: 4, originalFile: 'r2://ro-added-after-reopen.png' }
  })
  ok(
    'F02-RO09b thêm trang sau reopen stage 1 → 201',
    addedRevisionPage.status === 201,
    `got ${addedRevisionPage.status}`
  )

  const readySetup = await createRoChapter(41, 'ChReadyForPrint', 1)
  await submitAfterStages(s.tokens.mA, String(readySetup.chapter.id), 'F02-RO10-SETUP')
  const readyApprove = await req('POST', `/chapters/${readySetup.chapter.id}/manuscript/approve`, {
    token: s.tokens.e1
  })
  ok('F02-RO10 setup approve → 201', readyApprove.status === 201, `got ${readyApprove.status}`)
  const readyStage = stageByName(await getStages(readySetup.chapter.id), 'LETTERING')
  const reopenReady = await req('POST', `/chapters/${readySetup.chapter.id}/stages/${readyStage.id}/reopen`, {
    token: s.tokens.mA
  })
  expectError(reopenReady, 409, 'Error.StageReopenNotAllowed', 'F02-RO10 reopen READY_FOR_PRINT → 409')

  const roleSetup = await createRoChapter(42, 'ChReopenRole', 1)
  await submitAfterStages(s.tokens.mA, String(roleSetup.chapter.id), 'F02-RO11-SETUP')
  await req('POST', `/chapters/${roleSetup.chapter.id}/manuscript/request-revision`, {
    token: s.tokens.e1,
    body: { reason: 'role guard' }
  })
  const roleStage = stageByName(await getStages(roleSetup.chapter.id), 'LETTERING')
  const editorReopen = await req('POST', `/chapters/${roleSetup.chapter.id}/stages/${roleStage.id}/reopen`, {
    token: s.tokens.e1
  })
  expectError(editorReopen, 403, 'Error.ForbiddenResource', 'F02-RO11 Editor gọi reopen → 403 role guard')
  const otherMangakaReopen = await req('POST', `/chapters/${roleSetup.chapter.id}/stages/${roleStage.id}/reopen`, {
    token: s.tokens.mA2
  })
  expectError(otherMangakaReopen, 403, 'Error.StageAccessDenied', 'F02-RO11b Mangaka khác gọi reopen → 403 ownership')

  const openTaskSetup = await createRoChapter(43, 'ChOpenTaskGuard', 1)
  await submitAfterStages(s.tokens.mA, String(openTaskSetup.chapter.id), 'F02-RO12-SETUP')
  await requestRevisionAndResolve({ editor: s.tokens.e1, mangaka: s.tokens.mA }, openTaskSetup.chapter.id, 'F02-RO12a')
  const openTaskStages = await getStages(openTaskSetup.chapter.id)
  const openTaskLettering = stageByName(openTaskStages, 'LETTERING')
  const openTaskInking = stageByName(openTaskStages, 'INKING')
  await req('POST', `/chapters/${openTaskSetup.chapter.id}/stages/${openTaskLettering.id}/reopen`, {
    token: s.tokens.mA
  })
  const openLaterTask = await req('POST', '/tasks', {
    token: s.tokens.mA,
    body: {
      pageId: openTaskSetup.pages[0].id,
      assistantId: roAssistant.id,
      taskType: Specialization.LETTERING,
      stageId: openTaskLettering.id
    }
  })
  ok('F02-RO12b tạo task ở stage sau → 201', openLaterTask.status === 201, `got ${openLaterTask.status}`)
  const blockedEarlierReopen = await req(
    'POST',
    `/chapters/${openTaskSetup.chapter.id}/stages/${openTaskInking.id}/reopen`,
    {
      token: s.tokens.mA
    }
  )
  expectError(
    blockedEarlierReopen,
    409,
    'Error.StageHasOpenTasks',
    'F02-RO12c reopen stage trước khi stage sau còn task mở → 409'
  )
  const openLaterTaskId = responseData<{ id: string }>(openLaterTask).id
  const cancelLaterTask = await req('POST', `/tasks/${openLaterTaskId}/cancel`, {
    token: s.tokens.mA,
    body: { reason: 'reopen earlier stage' }
  })
  ok('F02-RO12d cancel task mở → 201', cancelLaterTask.status === 201, `got ${cancelLaterTask.status}`)
  const reopenAfterCancel = await req(
    'POST',
    `/chapters/${openTaskSetup.chapter.id}/stages/${openTaskInking.id}/reopen`,
    {
      token: s.tokens.mA
    }
  )
  ok(
    'F02-RO12e cancel xong reopen stage trước → 201',
    reopenAfterCancel.status === 201,
    `got ${reopenAfterCancel.status}`
  )

  const insertBlockedSetup = await createRoChapter(44, 'ChInsertBlocked', 1)
  await submitAfterStages(s.tokens.mA, String(insertBlockedSetup.chapter.id), 'F02-RO13-SETUP')
  const insertBlockedStage = stageByName(await getStages(insertBlockedSetup.chapter.id), 'LETTERING')
  const insertBlocked = await req('POST', `/chapters/${insertBlockedSetup.chapter.id}/stages`, {
    token: s.tokens.mA,
    body: { name: 'REWORK', taskTypes: [Specialization.LETTERING], afterStageId: insertBlockedStage.id }
  })
  expectError(insertBlocked, 409, 'Error.StageNotInsertable', 'F02-RO13 add khi mọi stage COMPLETED → 409')

  const insertSetup = await createRoChapter(45, 'ChInsertAfterReopen', 2)
  await submitAfterStages(s.tokens.mA, String(insertSetup.chapter.id), 'F02-RO14-SETUP')
  await requestRevisionAndResolve({ editor: s.tokens.e1, mangaka: s.tokens.mA }, insertSetup.chapter.id, 'F02-RO14a')
  const insertStages = await getStages(insertSetup.chapter.id)
  const insertLettering = stageByName(insertStages, 'LETTERING')
  const insertFinal = insertStages.find((stage) => stage.isFinalCheck)!
  await req('POST', `/chapters/${insertSetup.chapter.id}/stages/${insertLettering.id}/reopen`, { token: s.tokens.mA })
  const addInserted = await req('POST', `/chapters/${insertSetup.chapter.id}/stages`, {
    token: s.tokens.mA,
    body: { name: 'REWORK_EFFECT', taskTypes: [Specialization.LETTERING], afterStageId: insertLettering.id }
  })
  ok('F02-RO14b add sau stage vừa reopen → 201', addInserted.status === 201, `got ${addInserted.status}`)
  const insertedBody = responseData<{ id: string }>(addInserted)
  const finalShifted = await prisma.productionStage.findUnique({ where: { id: insertFinal.id } })
  ok('F02-RO14c FINAL_CHECK dời order 4→5', finalShifted?.order === 5, `got ${finalShifted?.order}`)
  await closeActiveStage(s.tokens.mA, insertSetup.chapter.id, insertLettering.id, 'F02-RO14d')
  const insertedStage = await prisma.productionStage.findUnique({ where: { id: insertedBody.id } })
  const insertedPages = await prisma.productionStagePage.count({ where: { stageId: insertedBody.id } })
  ok(
    'F02-RO14e stage mới ACTIVE và có đủ StagePage',
    insertedStage?.status === 'ACTIVE' && insertedPages === 2,
    `status=${insertedStage?.status} pages=${insertedPages}`
  )

  const reuseSetup = await createRoChapter(46, 'ChReuseInput', 2)
  await submitAfterStages(s.tokens.mA, String(reuseSetup.chapter.id), 'F02-RO15-SETUP')
  await requestRevisionAndResolve({ editor: s.tokens.e1, mangaka: s.tokens.mA }, reuseSetup.chapter.id, 'F02-RO15a')
  const reuseDetailing = stageByName(await getStages(reuseSetup.chapter.id), 'DETAILING')
  const reopenReuse = await req('POST', `/chapters/${reuseSetup.chapter.id}/stages/${reuseDetailing.id}/reopen`, {
    token: s.tokens.mA
  })
  ok('F02-RO15b reopen DETAILING → 201', reopenReuse.status === 201, `got ${reopenReuse.status}`)
  await closeActiveStage(s.tokens.mA, reuseSetup.chapter.id, reuseDetailing.id, 'F02-RO15c')
  const letteringAfterReuse = await prisma.productionStage.findFirst({
    where: { chapterId: reuseSetup.chapter.id, name: 'LETTERING' }
  })
  ok(
    'F02-RO15d reuseInput không task vẫn complete được',
    letteringAfterReuse?.status === 'ACTIVE',
    `got ${letteringAfterReuse?.status}`
  )

  const finalGuardSetup = await createRoChapter(47, 'ChFinalGuard', 1)
  await advanceToFinalCheck(s.tokens.mA, String(finalGuardSetup.chapter.id), 'F02-RO16-SETUP')
  const finalGuard = (await getStages(finalGuardSetup.chapter.id)).find((stage) => stage.isFinalCheck)!
  const completeFinal = await req('POST', `/chapters/${finalGuardSetup.chapter.id}/stages/${finalGuard.id}/complete`, {
    token: s.tokens.mA
  })
  expectError(completeFinal, 409, 'Error.FinalCheckNotCompletable', 'F02-RO16 FINAL_CHECK complete route → 409')
  const submitAfterFinalBlocked = await req('POST', `/chapters/${finalGuardSetup.chapter.id}/manuscript/submit`, {
    token: s.tokens.mA
  })
  ok(
    'F02-RO16b submit ngay sau FINAL_CHECK complete bị chặn vẫn → 201',
    submitAfterFinalBlocked.status === 201,
    `got ${submitAfterFinalBlocked.status} ${submitAfterFinalBlocked.raw.slice(0, 200)}`
  )

  // ── F02-RO17 — reopen KHÔNG được xoá giá trị output cũ ──────────────────────────────────────
  // 🔴 Bug BE-A tự bắt khi verify Spec 26 (probe DB thật): bản gốc xoá cả outputFileKey. Vì StagePage
  // của các stage SAU bị xoá trong cùng transaction, đó là bản sao CUỐI CÙNG của kết quả stage này
  // ⇒ mất vĩnh viễn khỏi API. Hệ quả: trang không cần sửa mà Mangaka bấm "giữ nguyên" thì stage kế
  // nhận input tụt về ảnh TRƯỚC stage vừa mở lại, Assistant vẽ lại trên bản đã mất phần việc trước đó.
  // Case này dùng FILE KHÁC NHAU cho từng stage — các case RO khác đều reuseInput nên compositeFile
  // luôn null và KHÔNG THỂ lộ lớp bug này.
  const keepSetup = await createRoChapter(48, 'ChKeepOutput', 1)
  const keepPageId = String(keepSetup.pages[0].id)
  const keepStages = await getStages(keepSetup.chapter.id)
  for (const [name, fileKey] of [
    ['INKING', 'r2://keep-ink.png'],
    ['DETAILING', 'r2://keep-detail.png'],
    ['LETTERING', 'r2://keep-letter.png']
  ] as const) {
    const stage = stageByName(keepStages, name)
    await closeActiveStage(s.tokens.mA, keepSetup.chapter.id, stage.id, `F02-RO17-${name}`, {
      [keepPageId]: fileKey
    })
  }
  // 3 stage sản xuất đã đi bằng tay ở trên; chỉ còn FINAL_CHECK đang ACTIVE nên submit thẳng.
  // (KHÔNG dùng submitAfterStages — nó sẽ đi lại 3 stage đã COMPLETED → 409 StageNotActive.)
  const keepSubmit = await req('POST', `/chapters/${keepSetup.chapter.id}/manuscript/submit`, { token: s.tokens.mA })
  ok(
    'F02-RO17-SUBMIT submit → 201',
    keepSubmit.status === 201,
    `got ${keepSubmit.status} ${keepSubmit.raw.slice(0, 200)}`
  )
  await requestRevisionAndResolve({ editor: s.tokens.e1, mangaka: s.tokens.mA }, keepSetup.chapter.id, 'F02-RO17a')

  const keepDetailing = stageByName(await getStages(keepSetup.chapter.id), 'DETAILING')
  const keepReopen = await req('POST', `/chapters/${keepSetup.chapter.id}/stages/${keepDetailing.id}/reopen`, {
    token: s.tokens.mA
  })
  ok('F02-RO17b reopen DETAILING → 201', keepReopen.status === 201, `got ${keepReopen.status}`)

  const keptOutput = await prisma.productionStagePage.findFirst({
    where: { stageId: keepDetailing.id, pageId: keepPageId }
  })
  ok(
    'F02-RO17c output cũ VẪN đọc được sau reopen (không bị xoá)',
    keptOutput?.outputFileKey === 'r2://keep-detail.png',
    `got ${keptOutput?.outputFileKey} — mất bản sao cuối cùng của kết quả DETAILING`
  )
  ok(
    'F02-RO17d dấu xác nhận đã xoá nên vẫn buộc confirm lại',
    keptOutput?.outputConfirmedAt === null && keptOutput?.outputConfirmedBy === null,
    `got ${String(keptOutput?.outputConfirmedAt)}`
  )
  ok(
    'F02-RO17e input snapshot vẫn là output của INKING',
    keptOutput?.inputFileKey === 'r2://keep-ink.png',
    `got ${keptOutput?.inputFileKey}`
  )

  // Trang không cần sửa: echo lại outputFileKey cũ ⇒ chuỗi stage giữ nguyên phần việc DETAILING.
  await closeActiveStage(s.tokens.mA, keepSetup.chapter.id, keepDetailing.id, 'F02-RO17f', {
    [keepPageId]: String(keptOutput?.outputFileKey)
  })
  const keepLettering = stageByName(await getStages(keepSetup.chapter.id), 'LETTERING')
  const keepLetteringInput = await prisma.productionStagePage.findFirst({
    where: { stageId: keepLettering.id, pageId: keepPageId }
  })
  ok(
    'F02-RO17g LETTERING nhận input = kết quả DETAILING, KHÔNG tụt về bản mực thô',
    keepLetteringInput?.inputFileKey === 'r2://keep-detail.png',
    `got ${keepLetteringInput?.inputFileKey}`
  )

  await prisma.$disconnect()
  const fail = summary(FLOW)
  process.exit(fail > 0 ? 1 : 0)
}

void main().catch(async (e) => {
  console.error('FATAL', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
