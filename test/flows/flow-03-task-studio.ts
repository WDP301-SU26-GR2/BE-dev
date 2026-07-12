/**
 * FLOW 3 + 9 — Task Assignment & Studio Directory (A4 + A7)
 * Spec §8 — 55 case.
 *
 * Nhóm:
 *   S1 Studio/directory (14) — GET /assistants, CollaborationInvite lifecycle → StudioAssignment
 *   S2 Region (10)           — manual create/patch/delete + cascade CANCELLED + AI tắt 503
 *   S3 Task lifecycle (19)   — BR-ASSIST-01, start/submit/review loop, cascade A4→A3, ON_HOLD/reassign, cancel
 *   S4 Asset + misc (12)     — presign PUT/GET validate, scoping, filter, studio overview
 */

import {
  SeriesStatus,
  ManuscriptStatus,
  PageStatus,
  TaskStatus,
  StudioAssignmentStatus,
  RoleCode,
  Specialization as Spec
} from '@prisma/client'
import {
  wipeDb,
  seedRolesAndAdmin,
  prisma,
  makeUser,
  makeSeriesAt,
  makeChapterAt,
  makePageAt,
  makeStudioAssignment,
  makeTaskAt
} from './lib/seed.js'
import { req, ok, section, summary, expectError, resetCounters, sleep } from './lib/http.js'
import { login } from './lib/auth.js'

const FLOW = 'flow-03-task-studio'
const FAKE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString()

const main = async () => {
  resetCounters()
  console.log(`\n##### ${FLOW} #####`)
  await wipeDb()
  await seedRolesAndAdmin()

  const m1 = await makeUser(RoleCode.MANGAKA)
  const m2 = await makeUser(RoleCode.MANGAKA) // không sở hữu series
  const a1 = await makeUser(RoleCode.ASSISTANT)
  const a2 = await makeUser(RoleCode.ASSISTANT)
  const a3 = await makeUser(RoleCode.ASSISTANT) // không được thuê
  const e1 = await makeUser(RoleCode.EDITOR)
  const m1Tok = await login(m1.email)
  const m2Tok = await login(m2.email)
  const a1Tok = await login(a1.email)
  const a2Tok = await login(a2.email)
  const e1Tok = await login(e1.email)

  const series = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m1.id, editorId: e1.id })
  const chapter = await makeChapterAt({
    seriesId: series.id,
    chapterNumber: 1,
    manuscriptStatus: ManuscriptStatus.IN_PRODUCTION
  })
  const page = await makePageAt({ chapterId: chapter.id, pageNumber: 1, status: PageStatus.IN_PROGRESS })

  // ══════════════ S1 — STUDIO DIRECTORY + INVITE (14) ══════════════
  section('S1 Danh bạ trợ lý + CollaborationInvite → StudioAssignment (Flow 9)')

  const rProfile = await req('PUT', '/me/assistant-profile', {
    token: a1Tok,
    body: { specializations: [Spec.INKING, Spec.BACKGROUND], experienceLevel: 'SENIOR', portfolioFiles: [] }
  })
  ok(
    'F03-000 A1 upsert assistant-profile → 200',
    rProfile.status === 200,
    `got ${rProfile.status} ${rProfile.raw.slice(0, 160)}`
  )
  const rDir = await req('GET', `/assistants?specialization=${Spec.INKING}`, { token: m1Tok })
  const dirItems = (rDir.json?.data?.items ?? []) as Array<Record<string, unknown>>
  ok('F03-001a GET /assistants filter specialization → 200', rDir.status === 200, `got ${rDir.status}`)
  ok(
    'F03-001b danh bạ ẨN email/phone (privacy) + có userId/reputation',
    dirItems.length > 0 &&
      dirItems.every((it) => !('email' in it) && !('phoneNumber' in it) && 'userId' in it && 'isRecommended' in it),
    `count=${dirItems.length} sample=${JSON.stringify(dirItems[0] ?? {}).slice(0, 160)}`
  )
  const rDirLvl = await req('GET', '/assistants?level=SENIOR', { token: m1Tok })
  ok('F03-002 GET /assistants filter level → 200', rDirLvl.status === 200, `got ${rDirLvl.status}`)
  const rDirAsst = await req('GET', '/assistants', { token: a1Tok })
  ok('F03-002b ASSISTANT xem danh bạ → 403 (route M/E/B/SA)', rDirAsst.status === 403, `got ${rDirAsst.status}`)

  const rInv = await req('POST', '/collaboration-invites', {
    token: m1Tok,
    body: {
      assistantId: a1.id,
      seriesId: series.id,
      hireStart: iso(0),
      hireEnd: iso(30 * 86_400_000),
      taskTypes: [Spec.INKING]
    }
  })
  ok('F03-003 M mời A1 → 201', rInv.status === 201, `got ${rInv.status} ${rInv.raw.slice(0, 160)}`)
  const invId = rInv.json?.data?.id as string

  const rInvBadPeriod = await req('POST', '/collaboration-invites', {
    token: m1Tok,
    body: {
      assistantId: a2.id,
      hireStart: iso(30 * 86_400_000),
      hireEnd: iso(0), // start > end
      taskTypes: [Spec.INKING]
    }
  })
  expectError(rInvBadPeriod, 422, 'Error.InvalidHirePeriod', 'F03-004 hireStart > hireEnd → 422 InvalidHirePeriod')

  const rInvNotAsst = await req('POST', '/collaboration-invites', {
    token: m1Tok,
    body: { assistantId: e1.id, hireStart: iso(0), hireEnd: iso(86_400_000), taskTypes: [Spec.INKING] }
  })
  expectError(rInvNotAsst, 422, 'Error.TargetNotAssistant', 'F03-005 mời user không phải ASSISTANT → 422')

  const rAcc = await req('POST', `/collaboration-invites/${invId}/accept`, { token: a1Tok, body: {} })
  ok('F03-006a A1 accept invite → 201', rAcc.status === 201, `got ${rAcc.status} ${rAcc.raw.slice(0, 160)}`)
  const asg1 = await prisma.studioAssignment.findFirst({ where: { mangakaId: m1.id, assistantId: a1.id } })
  ok(
    'F03-006b accept → StudioAssignment ACTIVE',
    asg1?.status === StudioAssignmentStatus.ACTIVE,
    `status=${String(asg1?.status)}`
  )

  const rInv2 = await req('POST', '/collaboration-invites', {
    token: m1Tok,
    body: { assistantId: a2.id, hireStart: iso(0), hireEnd: iso(30 * 86_400_000), taskTypes: [Spec.SCREENTONE] }
  })
  const inv2Id = rInv2.json?.data?.id as string
  const rAccWrong = await req('POST', `/collaboration-invites/${inv2Id}/accept`, { token: a1Tok, body: {} })
  expectError(rAccWrong, 403, 'Error.NotInvitee', 'F03-007 A1 accept invite của A2 → 403 NotInvitee')

  const rInvDup = await req('POST', '/collaboration-invites', {
    token: m1Tok,
    body: { assistantId: a1.id, hireStart: iso(0), hireEnd: iso(30 * 86_400_000), taskTypes: [Spec.INKING] }
  })
  expectError(
    rInvDup,
    409,
    'Error.DuplicateActiveCollaboration',
    'F03-008 invite trùng cặp đang active → 409 DuplicateActiveCollaboration'
  )

  const rDecline = await req('POST', `/collaboration-invites/${inv2Id}/decline`, { token: a2Tok, body: {} })
  ok('F03-011 A2 decline invite → 201', rDecline.status === 201, `got ${rDecline.status}`)
  const rAccDeclined = await req('POST', `/collaboration-invites/${inv2Id}/accept`, { token: a2Tok, body: {} })
  expectError(rAccDeclined, 409, 'Error.InviteNotPending', 'F03-010 accept invite đã DECLINED → 409 InviteNotPending')

  const rInv3 = await req('POST', '/collaboration-invites', {
    token: m1Tok,
    body: { assistantId: a2.id, hireStart: iso(0), hireEnd: iso(30 * 86_400_000), taskTypes: [Spec.SCREENTONE] }
  })
  const inv3Id = rInv3.json?.data?.id as string
  const rCancelWrong = await req('POST', `/collaboration-invites/${inv3Id}/cancel`, { token: m2Tok, body: {} })
  expectError(rCancelWrong, 403, 'Error.NotInviteOwner', 'F03-009a cancel bởi mangaka khác → 403 NotInviteOwner')
  const rCancel = await req('POST', `/collaboration-invites/${inv3Id}/cancel`, { token: m1Tok, body: {} })
  ok('F03-009b M cancel invite PENDING → 201', rCancel.status === 201, `got ${rCancel.status}`)

  // A2 có assignment ACTIVE (dùng cho reassign sau) — tạo qua Prisma cho gọn
  const asg2 = await makeStudioAssignment({ mangakaId: m1.id, assistantId: a2.id, seriesId: series.id })

  const rTermNotOwner = await req('POST', `/studio-assignments/${asg2.id}/terminate`, {
    token: m2Tok,
    body: { reason: 'x' }
  })
  ok('F03-012a terminate bởi mangaka khác → 403', rTermNotOwner.status === 403, `got ${rTermNotOwner.status}`)

  const asgTemp = await makeStudioAssignment({ mangakaId: m1.id, assistantId: a3.id })
  const rTerm = await req('POST', `/studio-assignments/${asgTemp.id}/terminate`, {
    token: m1Tok,
    body: { reason: 'hết việc' }
  })
  ok('F03-012b M terminate assignment → 201 TERMINATED', rTerm.status === 201, `got ${rTerm.status}`)
  const rTerm2 = await req('POST', `/studio-assignments/${asgTemp.id}/terminate`, {
    token: m1Tok,
    body: { reason: 'lần 2' }
  })
  expectError(
    rTerm2,
    409,
    'Error.AssignmentNotActive',
    'F03-013 terminate assignment không ACTIVE → 409 AssignmentNotActive'
  )

  const rAsgM = await req('GET', '/studio-assignments', { token: m1Tok })
  const rAsgA = await req('GET', '/studio-assignments', { token: a1Tok })
  ok(
    'F03-014 GET /studio-assignments scoping 2 phía (M + A đều 200)',
    rAsgM.status === 200 && rAsgA.status === 200,
    `m=${rAsgM.status} a=${rAsgA.status}`
  )

  // ══════════════ S2 — REGION (10) ══════════════
  section('S2 Region manual + cascade + AI tắt')

  const rReg = await req('POST', `/pages/${page.id}/regions`, {
    token: m1Tok,
    body: { coordinates: { x: 10, y: 10, width: 100, height: 80 }, regionType: 'PANEL' }
  })
  const regId = rReg.json?.data?.id as string
  const regRow = regId ? await prisma.region.findUnique({ where: { id: regId } }) : null
  ok(
    'F03-015 M tạo region manual → 201 (createdBy=MANUAL, confidence=null)',
    rReg.status === 201 && regRow?.createdBy === 'MANUAL' && regRow?.confidenceScore == null,
    `got ${rReg.status} createdBy=${String(regRow?.createdBy)}`
  )

  const rRegW0 = await req('POST', `/pages/${page.id}/regions`, {
    token: m1Tok,
    body: { coordinates: { x: 0, y: 0, width: 0, height: 50 }, regionType: 'PANEL' }
  })
  ok('F03-016 coords width = 0 → 422', rRegW0.status === 422, `got ${rRegW0.status}`)
  const rRegNeg = await req('POST', `/pages/${page.id}/regions`, {
    token: m1Tok,
    body: { coordinates: { x: -1, y: 0, width: 10, height: 10 }, regionType: 'PANEL' }
  })
  ok('F03-017 coords x âm → 422', rRegNeg.status === 422, `got ${rRegNeg.status}`)

  const rRegNotOwner = await req('POST', `/pages/${page.id}/regions`, {
    token: m2Tok,
    body: { coordinates: { x: 1, y: 1, width: 10, height: 10 }, regionType: 'PANEL' }
  })
  expectError(rRegNotOwner, 403, 'Error.NotSeriesOwner', 'F03-018 M2 tạo region trên page của M1 → 403 NotSeriesOwner')

  const rRegPatch = await req('PATCH', `/regions/${regId}`, { token: m1Tok, body: { confirmedByMangaka: true } })
  ok(
    'F03-019 PATCH region confirm → confirmedByMangaka=true',
    rRegPatch.status === 200 && (await prisma.region.findUnique({ where: { id: regId } }))?.confirmedByMangaka === true,
    `got ${rRegPatch.status}`
  )

  const regFree = await prisma.region.create({
    data: { pageId: page.id, coordinates: { x: 5, y: 5, width: 20, height: 20 }, regionType: 'PANEL' }
  })
  const rDelFree = await req('DELETE', `/regions/${regFree.id}`, { token: m1Tok })
  ok('F03-020 DELETE region không có task → 200', rDelFree.status === 200, `got ${rDelFree.status}`)

  // region có task APPROVED → chặn xoá
  const regApproved = await prisma.region.create({
    data: { pageId: page.id, coordinates: { x: 6, y: 6, width: 20, height: 20 }, regionType: 'PANEL' }
  })
  await makeTaskAt({ pageId: page.id, regionId: regApproved.id, assistantId: a1.id, status: TaskStatus.APPROVED })
  const rDelApproved = await req('DELETE', `/regions/${regApproved.id}`, { token: m1Tok })
  expectError(
    rDelApproved,
    409,
    'Error.RegionHasApprovedTasks',
    'F03-021 DELETE region có task APPROVED → 409 RegionHasApprovedTasks'
  )

  // region có task ASSIGNED → cascade CANCELLED + notify
  const regCascade = await prisma.region.create({
    data: { pageId: page.id, coordinates: { x: 7, y: 7, width: 20, height: 20 }, regionType: 'PANEL' }
  })
  const taskCascade = await makeTaskAt({
    pageId: page.id,
    regionId: regCascade.id,
    assistantId: a1.id,
    status: TaskStatus.ASSIGNED
  })
  const rDelCascade = await req('DELETE', `/regions/${regCascade.id}`, { token: m1Tok })
  await sleep(600)
  const taskAfterCascade = await prisma.task.findUnique({ where: { id: taskCascade.id } })
  ok(
    'F03-022a DELETE region có task ASSIGNED → task CANCELLED (cascade)',
    rDelCascade.status === 200 && taskAfterCascade?.status === TaskStatus.CANCELLED,
    `got ${rDelCascade.status} task=${String(taskAfterCascade?.status)}`
  )
  ok(
    'F03-022b cascade → notify Assistant',
    (await prisma.notification.count({ where: { recipientId: a1.id, referenceId: taskCascade.id } })) > 0
  )

  // Guard order thật: PageHasNoFile check TRƯỚC AiNotEnabled → page phải có originalFile mới tới nhánh 503.
  const rSegNoFile = await req('POST', `/pages/${page.id}/segment`, { token: m1Tok, body: { mode: 'MODEL' } })
  expectError(rSegNoFile, 422, 'Error.PageHasNoFile', 'F03-023a segment page chưa có file → 422 PageHasNoFile')

  const pageWithFile = await makePageAt({
    chapterId: chapter.id,
    pageNumber: 9,
    status: PageStatus.IN_PROGRESS,
    originalFile: 'r2/page9.png'
  })
  const rSeg = await req('POST', `/pages/${pageWithFile.id}/segment`, { token: m1Tok, body: { mode: 'MODEL' } })
  expectError(rSeg, 503, 'Error.AiNotEnabled', 'F03-023b AI tắt (AI_SERVICE_URL rỗng) → 503 AiNotEnabled')

  const rRegList = await req('GET', `/pages/${page.id}/regions`, { token: m1Tok })
  ok('F03-024a GET /pages/:id/regions → 200', rRegList.status === 200, `got ${rRegList.status}`)
  const rRegList404 = await req('GET', `/pages/${FAKE_ID}/regions`, { token: m1Tok })
  ok('F03-024b GET regions page không tồn tại → 404', rRegList404.status === 404, `got ${rRegList404.status}`)

  // ══════════════ S3 — TASK LIFECYCLE (19) ══════════════
  section('S3 Task lifecycle + BR-ASSIST-01 + cascade A4→A3')

  const mkTask = async (assistantId: string, regionId?: string) => {
    const r = await req('POST', '/tasks', {
      token: m1Tok,
      body: { pageId: page.id, assistantId, taskType: Spec.INKING, ...(regionId ? { regionId } : {}) }
    })
    return { status: r.status, raw: r.raw, id: r.json?.data?.id as string | undefined }
  }

  const t1 = await mkTask(a1.id)
  ok(
    'F03-025 M giao task cho A1 (assignment ACTIVE) → 201 ASSIGNED',
    t1.status === 201,
    `got ${t1.status} ${t1.raw.slice(0, 160)}`
  )

  const rNotHired = await req('POST', '/tasks', {
    token: m1Tok,
    body: { pageId: page.id, assistantId: a3.id, taskType: Spec.INKING }
  })
  expectError(
    rNotHired,
    409,
    'Error.AssistantNotHired',
    'F03-026 giao cho assistant KHÔNG có assignment ACTIVE → 409 AssistantNotHired'
  )

  // hire period đã hết (lazy expire) → cũng AssistantNotHired
  const aExpired = await makeUser(RoleCode.ASSISTANT)
  await makeStudioAssignment({
    mangakaId: m1.id,
    assistantId: aExpired.id,
    hireStart: new Date(Date.now() - 60 * 86_400_000),
    hireEnd: new Date(Date.now() - 86_400_000) // hết hạn hôm qua
  })
  const rExpired = await req('POST', '/tasks', {
    token: m1Tok,
    body: { pageId: page.id, assistantId: aExpired.id, taskType: Spec.INKING }
  })
  expectError(rExpired, 409, 'Error.AssistantNotHired', 'F03-027 hire period đã hết (lazy expire) → 409')

  const rBatchBad = await req('POST', '/tasks/batch', {
    token: m1Tok,
    body: {
      items: [
        { pageId: page.id, assistantId: a1.id, taskType: Spec.INKING },
        { pageId: page.id, assistantId: a3.id, taskType: Spec.INKING } // không hired → cả batch fail
      ]
    }
  })
  const batchTaskCount = await prisma.task.count({ where: { pageId: page.id, assistantId: a3.id } })
  ok(
    'F03-028 batch all-or-nothing: 1 item sai → CẢ batch fail (không task nào của a3 được tạo)',
    rBatchBad.status >= 400 && batchTaskCount === 0,
    `got ${rBatchBad.status} a3Tasks=${batchTaskCount}`
  )

  const rStart = await req('POST', `/tasks/${t1.id}/start`, { token: a1Tok, body: {} })
  ok('F03-029 A1 start → IN_PROGRESS', rStart.status === 201, `got ${rStart.status} ${rStart.raw.slice(0, 160)}`)

  const rStartWrong = await req('POST', `/tasks/${t1.id}/start`, { token: a2Tok, body: {} })
  expectError(rStartWrong, 403, 'Error.NotTaskAssignee', 'F03-030 A2 start task của A1 → 403 NotTaskAssignee')

  const rSubmit = await req('POST', `/tasks/${t1.id}/submit`, { token: a1Tok, body: { file: 'r2/key-v1.png' } })
  const t1Row = await prisma.task.findUnique({ where: { id: t1.id! } })
  ok(
    'F03-031 A1 submit → SUBMITTED + TaskVersion v1 PENDING',
    rSubmit.status === 201 &&
      t1Row?.status === TaskStatus.SUBMITTED &&
      (t1Row?.versions ?? []).length === 1 &&
      (t1Row?.versions?.[0] as unknown as { reviewStatus?: string })?.reviewStatus === 'PENDING',
    `got ${rSubmit.status} versions=${(t1Row?.versions ?? []).length}`
  )

  const rRev = await req('POST', `/tasks/${t1.id}/request-revision`, {
    token: m1Tok,
    body: { reviewerNote: 'sửa panel 3' }
  })
  ok(
    'F03-032 M request-revision → REVISION_REQUESTED + reviewerNote',
    rRev.status === 201 &&
      (await prisma.task.findUnique({ where: { id: t1.id! } }))?.status === TaskStatus.REVISION_REQUESTED,
    `got ${rRev.status}`
  )

  await req('POST', `/tasks/${t1.id}/start`, { token: a1Tok, body: {} })
  const rSubmit2 = await req('POST', `/tasks/${t1.id}/submit`, { token: a1Tok, body: { file: 'r2/key-v2.png' } })
  const t1Row2 = await prisma.task.findUnique({ where: { id: t1.id! } })
  ok(
    'F03-033 A1 re-submit → TaskVersion v2',
    rSubmit2.status === 201 && (t1Row2?.versions ?? []).length === 2,
    `got ${rSubmit2.status} versions=${(t1Row2?.versions ?? []).length}`
  )

  const rApprove = await req('POST', `/tasks/${t1.id}/approve`, { token: m1Tok, body: {} })
  const t1Row3 = await prisma.task.findUnique({ where: { id: t1.id! } })
  ok(
    'F03-034 M approve → APPROVED + version APPROVED',
    rApprove.status === 201 && t1Row3?.status === TaskStatus.APPROVED,
    `got ${rApprove.status} status=${String(t1Row3?.status)}`
  )

  const rStartApproved = await req('POST', `/tasks/${t1.id}/start`, { token: a1Tok, body: {} })
  expectError(
    rStartApproved,
    409,
    'Error.InvalidTaskTransition',
    'F03-035 start khi APPROVED → 409 InvalidTaskTransition'
  )

  const tNoStart = await mkTask(a1.id)
  const rSubmitNoStart = await req('POST', `/tasks/${tNoStart.id}/submit`, { token: a1Tok, body: { file: 'x.png' } })
  expectError(
    rSubmitNoStart,
    409,
    'Error.InvalidTaskTransition',
    'F03-036 submit khi ASSIGNED (chưa start) → 409 InvalidTaskTransition'
  )

  // Cascade A4→A3: page RIÊNG, mọi task SUBMITTED → Page COMPOSITE_READY + Manuscript COMPOSITE_REVIEW
  const chapCas = await makeChapterAt({
    seriesId: series.id,
    chapterNumber: 2,
    manuscriptStatus: ManuscriptStatus.IN_PRODUCTION
  })
  const pageCas = await makePageAt({ chapterId: chapCas.id, pageNumber: 1, status: PageStatus.IN_PROGRESS })
  const rCas = await req('POST', '/tasks', {
    token: m1Tok,
    body: { pageId: pageCas.id, assistantId: a1.id, taskType: Spec.INKING }
  })
  const casTaskId = rCas.json?.data?.id as string
  await req('POST', `/tasks/${casTaskId}/start`, { token: a1Tok, body: {} })
  await req('POST', `/tasks/${casTaskId}/submit`, { token: a1Tok, body: { file: 'cas.png' } })
  await sleep(800)
  ok(
    'F03-037 cascade: mọi task của page SUBMITTED → Page COMPOSITE_READY',
    (await prisma.page.findUnique({ where: { id: pageCas.id } }))?.status === PageStatus.COMPOSITE_READY,
    `page=${String((await prisma.page.findUnique({ where: { id: pageCas.id } }))?.status)}`
  )
  ok(
    'F03-038 cascade: mọi task của chapter SUBMITTED + Manuscript IN_PRODUCTION → COMPOSITE_REVIEW',
    (await prisma.manuscript.findFirst({ where: { chapterId: chapCas.id } }))?.status ===
      ManuscriptStatus.COMPOSITE_REVIEW,
    `ms=${String((await prisma.manuscript.findFirst({ where: { chapterId: chapCas.id } }))?.status)}`
  )

  const tCancel = await mkTask(a1.id)
  const rCancelTask = await req('POST', `/tasks/${tCancel.id}/cancel`, { token: m1Tok, body: { reason: 'đổi ý' } })
  const tCancelRow = await prisma.task.findUnique({ where: { id: tCancel.id! } })
  ok(
    'F03-039 M cancel task → CANCELLED + statusReason',
    rCancelTask.status === 201 &&
      tCancelRow?.status === TaskStatus.CANCELLED &&
      (tCancelRow?.statusReason ?? '').length > 0,
    `got ${rCancelTask.status}`
  )
  const rCancelApproved = await req('POST', `/tasks/${t1.id}/cancel`, { token: m1Tok, body: { reason: 'x' } })
  expectError(rCancelApproved, 409, 'Error.TaskNotCancellable', 'F03-040 cancel task APPROVED → 409 TaskNotCancellable')

  // ON_HOLD qua availability event + reassign
  const tHold = await mkTask(a1.id)
  await req('POST', `/tasks/${tHold.id}/start`, { token: a1Tok, body: {} })
  const tSubmitted = await mkTask(a1.id)
  await req('POST', `/tasks/${tSubmitted.id}/start`, { token: a1Tok, body: {} })
  await req('POST', `/tasks/${tSubmitted.id}/submit`, { token: a1Tok, body: { file: 'sub.png' } })

  const rLeave = await req('PUT', '/me/assistant-profile', {
    token: a1Tok,
    body: {
      specializations: [Spec.INKING],
      experienceLevel: 'SENIOR',
      portfolioFiles: [],
      availabilityStatus: 'ON_LEAVE'
    }
  })
  ok(
    'F03-041a A1 đổi availability → ON_LEAVE (2xx)',
    rLeave.status === 200 || rLeave.status === 201,
    `got ${rLeave.status}`
  )
  await sleep(1200)
  const tHoldRow = await prisma.task.findUnique({ where: { id: tHold.id! } })
  const tSubRow = await prisma.task.findUnique({ where: { id: tSubmitted.id! } })
  ok(
    'F03-041b ON_LEAVE → task IN_PROGRESS chuyển ON_HOLD (event-driven)',
    tHoldRow?.status === TaskStatus.ON_HOLD,
    `got ${String(tHoldRow?.status)}`
  )
  ok(
    'F03-041c task SUBMITTED (ở sân Mangaka) KHÔNG bị hold',
    tSubRow?.status === TaskStatus.SUBMITTED,
    `got ${String(tSubRow?.status)}`
  )

  const rReassign = await req('POST', `/tasks/${tHold.id}/reassign`, { token: m1Tok, body: { assistantId: a2.id } })
  const tReassigned = await prisma.task.findUnique({ where: { id: tHold.id! } })
  ok(
    'F03-042 M reassign task ON_HOLD → A2 (có assignment) → ASSIGNED',
    rReassign.status === 201 && tReassigned?.status === TaskStatus.ASSIGNED && tReassigned?.assistantId === a2.id,
    `got ${rReassign.status} status=${String(tReassigned?.status)}`
  )
  const rReassignBad = await req('POST', `/tasks/${t1.id}/reassign`, { token: m1Tok, body: { assistantId: a2.id } })
  expectError(
    rReassignBad,
    409,
    'Error.TaskNotReassignable',
    'F03-043 reassign task APPROVED → 409 TaskNotReassignable'
  )

  // ══════════════ S4 — ASSET + MISC (12) ══════════════
  section('S4 Storage presign (A7) + scoping + read endpoints')

  const rSignBad = await req('POST', '/uploads/sign', {
    token: m1Tok,
    body: { fileName: 'a.exe', contentType: 'application/x-msdownload', contentLength: 1000 }
  })
  ok('F03-044 uploads/sign contentType không hợp lệ → 422', rSignBad.status === 422, `got ${rSignBad.status}`)

  const rSignBig = await req('POST', '/uploads/sign', {
    token: m1Tok,
    body: { fileName: 'big.png', contentType: 'image/png', contentLength: 20 * 1024 * 1024 }
  })
  expectError(rSignBig, 422, 'Error.FileTooLarge', 'F03-045 contentLength > maxUploadBytes → 422 FileTooLarge')

  const rSign = await req('POST', '/uploads/sign', {
    token: m1Tok,
    body: { fileName: 'page.png', contentType: 'image/png', contentLength: 1024 }
  })
  const signData = rSign.json?.data as
    | { assetId?: string; key?: string; uploadUrl?: string; requiredHeaders?: Record<string, string> }
    | undefined
  ok(
    'F03-046 uploads/sign OK → assetId + uploadUrl + requiredHeaders CHỈ Content-Type',
    rSign.status === 201 &&
      !!signData?.assetId &&
      !!signData?.uploadUrl &&
      Object.keys(signData?.requiredHeaders ?? {}).length === 1 &&
      'Content-Type' in (signData?.requiredHeaders ?? {}),
    `got ${rSign.status} headers=${JSON.stringify(signData?.requiredHeaders)}`
  )

  const rTaskBadAsset = await req('POST', '/tasks', {
    token: m1Tok,
    body: { pageId: page.id, assistantId: a1.id, taskType: Spec.INKING, assetIds: [FAKE_ID] }
  })
  expectError(rTaskBadAsset, 422, 'Error.AssetNotFound', 'F03-047 task assetIds không tồn tại → 422 AssetNotFound')

  const rDlMissing = await req('POST', '/uploads/sign-download', { token: m1Tok, body: { key: 'no/such/key.png' } })
  expectError(rDlMissing, 404, 'Error.AssetNotFound', 'F03-048 sign-download key không tồn tại → 404 AssetNotFound')

  const rDlForbidden = await req('POST', '/uploads/sign-download', {
    token: a2Tok, // không phải uploader, không phải E/B/SA
    body: { key: signData?.key ?? '' }
  })
  expectError(
    rDlForbidden,
    403,
    'Error.DownloadForbidden',
    'F03-049 sign-download asset người khác (không E/B/SA) → 403 DownloadForbidden'
  )

  // MANGAKA BẮT BUỘC truyền pageId (scoping theo sở hữu page); ASSISTANT không cần (lọc theo assistantId).
  const rTasksM = await req('GET', `/tasks?pageId=${page.id}`, { token: m1Tok })
  const rTasksA = await req('GET', '/tasks', { token: a2Tok })
  const mItems = (rTasksM.json?.data?.items ?? []) as Array<{ assistantId?: string }>
  const aItems = (rTasksA.json?.data?.items ?? []) as Array<{ assistantId?: string }>
  ok(
    'F03-050a GET /tasks?pageId= (MANGAKA sở hữu) → thấy task của page',
    rTasksM.status === 200 && mItems.length > 0,
    `got ${rTasksM.status} items=${mItems.length}`
  )
  ok(
    'F03-050b GET /tasks (ASSISTANT) → CHỈ task của mình',
    rTasksA.status === 200 && aItems.length > 0 && aItems.every((t) => t.assistantId === a2.id),
    `items=${aItems.length}`
  )
  const rTasksNotOwner = await req('GET', `/tasks?pageId=${page.id}`, { token: m2Tok })
  ok(
    'F03-050c MANGAKA khác xin page không sở hữu → 200 rỗng (không lộ data)',
    rTasksNotOwner.status === 200 && ((rTasksNotOwner.json?.data?.items ?? []) as unknown[]).length === 0,
    `got ${rTasksNotOwner.status}`
  )

  const rTasksRegion = await req('GET', `/tasks?pageId=${page.id}&regionId=${regApproved.id}`, { token: m1Tok })
  const rTasksRegionJunk = await req('GET', `/tasks?pageId=${page.id}&regionId=garbage`, { token: m1Tok })
  ok(
    'F03-051 GET /tasks?regionId= filter + id rác → 200 rỗng (không 500)',
    rTasksRegion.status === 200 &&
      ((rTasksRegion.json?.data?.items ?? []) as unknown[]).length === 1 &&
      rTasksRegionJunk.status === 200 &&
      ((rTasksRegionJunk.json?.data?.items ?? []) as unknown[]).length === 0,
    `filter=${rTasksRegion.status} junk=${rTasksRegionJunk.status}`
  )

  const tPatch = await mkTask(a2.id)
  const rPatchTask = await req('PATCH', `/tasks/${tPatch.id}`, {
    token: m1Tok,
    body: { priority: 5, deadline: iso(7 * 86_400_000) }
  })
  ok(
    'F03-052 PATCH /tasks/:id sửa deadline/priority → 200',
    rPatchTask.status === 200 && (await prisma.task.findUnique({ where: { id: tPatch.id! } }))?.priority === 5,
    `got ${rPatchTask.status}`
  )

  const rOverview = await req('GET', '/studio/overview', { token: m1Tok })
  ok('F03-053 GET /studio/overview (MANGAKA) → 200', rOverview.status === 200, `got ${rOverview.status}`)

  const rTaskDetail = await req('GET', `/tasks/${t1.id}`, { token: m1Tok })
  const detailVersions = (rTaskDetail.json?.data?.versions ?? []) as unknown[]
  ok(
    'F03-054 GET /tasks/:id kèm versions[]',
    rTaskDetail.status === 200 && detailVersions.length === 2,
    `got ${rTaskDetail.status} versions=${detailVersions.length}`
  )

  // Task trên chapter đang HOLD → chặn
  const chHold = await makeChapterAt({
    seriesId: series.id,
    chapterNumber: 3,
    manuscriptStatus: ManuscriptStatus.IN_PRODUCTION,
    holdComposite: true,
    heldBy: e1.id
  })
  const pageHold = await makePageAt({ chapterId: chHold.id, pageNumber: 1, status: PageStatus.IN_PROGRESS })
  const rTaskHold = await req('POST', '/tasks', {
    token: m1Tok,
    body: { pageId: pageHold.id, assistantId: a2.id, taskType: Spec.INKING }
  })
  expectError(rTaskHold, 409, 'Error.ChapterOnHold', 'F03-055 giao task trên chapter đang HOLD → 409 ChapterOnHold')

  const rTask404 = await req('POST', `/tasks/${FAKE_ID}/start`, { token: a1Tok, body: {} })
  expectError(rTask404, 404, 'Error.TaskNotFound', 'F03-055b task id không tồn tại → 404 TaskNotFound')

  const rTaskByEditor = await req('POST', '/tasks', {
    token: e1Tok,
    body: { pageId: page.id, assistantId: a1.id, taskType: Spec.INKING }
  })
  ok('F03-055c EDITOR tạo task → 403 (route MANGAKA)', rTaskByEditor.status === 403, `got ${rTaskByEditor.status}`)

  await prisma.$disconnect()
  const fail = summary(FLOW)
  await sleep(300)
  process.exit(fail > 0 ? 1 : 0)
}

void main().catch(async (e) => {
  console.error('FATAL', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
