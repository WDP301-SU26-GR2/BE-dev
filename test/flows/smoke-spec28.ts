// Comprehensive smoke test for Spec 28 - Storyboard & Proposal Consolidation
// Tests complete data flow through real API endpoint
import { wipeDb, seedRolesAndAdmin, prisma, makeUser } from './lib/seed.js'

import { login, clearTokenCache, ensureMangakaProfile } from './lib/auth.js'

import { req, ok, section, summary } from './lib/http.js'

const FLOW = 'smoke-spec28'

// Helper: build a stringified `extra` from an object — `ok` expects string.
const asExtra = (obj: unknown): string => (typeof obj === 'string' ? obj : JSON.stringify(obj ?? {}))

async function setup() {
  await wipeDb()
  await seedRolesAndAdmin()
  // Bypass require-once-by-email by clearing cache + make same set anew
}

async function main() {
  // Step 1: Wipe DB + seed admin/roles/users
  section('Setup')
  await setup()
  clearTokenCache()
  const m1 = await makeUser('MANGAKA')
  const m2 = await makeUser('MANGAKA')
  const e1 = await makeUser('EDITOR')
  console.log(`  Mangaka: ${m1.email}`)
  console.log(`  Editor:  ${e1.email}`)

  // Step 2: Login
  section('1. Login từ API')
  const m1Tok = await login(m1.email)
  const m2Tok = await login(m2.email)
  // BR 2026-08-04: submit yêu cầu Mangaka có hồ sơ.
  await ensureMangakaProfile(m1Tok, 'FT S28 M1')
  await ensureMangakaProfile(m2Tok, 'FT S28 M2')
  const e1Tok = await login(e1.email)
  ok('Token mangaka dài > 50', m1Tok.length > 50)
  ok('Token editor dài > 50', e1Tok.length > 50)

  // Step 3: Create proposal với storyboardPages
  section('2. POST /series/proposals — tạo DRAFT proposal có storyboardPages')
  const r1 = await req('POST', '/series/proposals', {
    token: m1Tok,
    body: {
      title: 'Smoke Spec 28 - Manga XYZ',
      genres: ['ACTION', 'FANTASY'],
      demographic: 'SHONEN',
      synopsis: 'Tóm tắt ban đầu của bộ truyện Smoke Spec 28',
      characterDesigns: ['char-manga-1.png', 'char-manga-2.png'],
      storyboardPages: [
        { pageNumber: 1, fileUrl: 'storyboard-page-1.png' },
        { pageNumber: 2, fileUrl: 'storyboard-page-2.png' }
      ]
    }
  })
  ok('01. status 201 Created', r1.status === 201, asExtra({ status: r1.status, body: r1.raw.slice(0, 300) }))
  ok('02. response có proposal', !!r1.json?.data?.proposal)
  ok('03. proposal.status = DRAFT', r1.json?.data?.proposal?.status === 'DRAFT')
  ok(
    '04. storyboardPages có 2 phần tử',
    Array.isArray(r1.json?.data?.proposal?.storyboardPages) && r1.json.data.proposal.storyboardPages.length === 2,
    asExtra({ count: r1.json?.data?.proposal?.storyboardPages?.length })
  )
  ok('05. KHÔNG có storyboardId trong proposal', r1.json?.data?.proposal?.storyboardId === undefined)

  const seriesId = r1.json?.data?.id as string
  console.log(`  Series created: ${seriesId}`)

  // Step 4: Verify DB - Series có composite proposal, KHÔNG có row Name proposal
  section('3. Verify DB — proposal dùng composite embedded, không có Storyboard row riêng')
  const dbSeries = await prisma.series.findUnique({ where: { id: seriesId } })
  ok('06. DB có Series', !!dbSeries)
  ok('07. proposal là composite (có storyboardPages)', Array.isArray(dbSeries?.proposal?.storyboardPages))
  ok('08. proposal KHÔNG có storyboardId', !dbSeries?.proposal || !('storyboardId' in dbSeries.proposal))
  const proposalNameCount = await prisma.storyboard.count({ where: { seriesId } })
  ok('09. ZERO standalone Storyboard rows for proposal', proposalNameCount === 0, asExtra({ count: proposalNameCount }))

  // Step 5: Submit → IN_REVIEW
  section('4. POST /series/:id/submit — DRAFT → IN_REVIEW trong một vòng proposal')
  const r2 = await req('POST', `/series/${seriesId}/submit`, { token: m1Tok })
  ok(
    '10. submit 2xx',
    r2.status === 200 || r2.status === 201,
    asExtra({ status: r2.status, body: r2.raw.slice(0, 200) })
  )
  ok(
    '11. series.status = IN_REVIEW',
    r2.json?.data?.status === 'IN_REVIEW',
    asExtra({
      actual: r2.json?.data?.status
    })
  )
  ok('12. proposal.status = PROPOSAL_REVIEW', r2.json?.data?.proposal?.status === 'PROPOSAL_REVIEW')

  // Step 6: Editor claim
  section('5. POST /series/:id/claim — Editor claim')
  const r3a = await req('POST', `/series/${seriesId}/claim`, { token: e1Tok })
  ok('13. claim status 2xx', r3a.status === 200 || r3a.status === 201, asExtra({ status: r3a.status }))

  // Step 7: Editor request revision (PROPOSAL_REVIEW → PROPOSAL_REVISION)
  section('6. POST /series/:id/proposal/request-revision')
  const r3b = await req('POST', `/series/${seriesId}/proposal/request-revision`, {
    token: e1Tok,
    body: { reason: 'Cần chỉnh sửa nhịp truyện' }
  })
  ok(
    '14. request-revision 2xx',
    r3b.status === 200 || r3b.status === 201,
    asExtra({
      status: r3b.status,
      body: r3b.raw.slice(0, 200)
    })
  )
  ok(
    '15. proposal.status = PROPOSAL_REVISION',
    r3b.json?.data?.proposal?.status === 'PROPOSAL_REVISION',
    asExtra({
      actual: r3b.json?.data?.proposal?.status
    })
  )

  // Step 8: PUT proposal update — storyboardPages, KHÔNG mất synopsis
  section('7. PUT /series/proposals/:id — update storyboardPages, giữ synopsis')
  const synopsisBefore = r3b.json?.data?.proposal?.synopsis
  const characterDesignsBefore = r3b.json?.data?.proposal?.characterDesigns
  const r4 = await req('PUT', `/series/proposals/${seriesId}`, {
    token: m1Tok,
    body: {
      storyboardPages: [
        { pageNumber: 1, fileUrl: 'storyboard-page-1.png' },
        { pageNumber: 2, fileUrl: 'storyboard-page-2.png' },
        { pageNumber: 3, fileUrl: 'storyboard-page-3.png' }
      ]
    }
  })
  ok('16. PUT status 200', r4.status === 200, asExtra({ status: r4.status, body: r4.raw.slice(0, 300) }))
  ok('17. synopsis preserved (CAS)', r4.json?.data?.proposal?.synopsis === synopsisBefore)
  ok(
    '18. characterDesigns preserved (CAS)',
    JSON.stringify(r4.json?.data?.proposal?.characterDesigns) === JSON.stringify(characterDesignsBefore)
  )
  ok(
    '19. storyboardPages có 3 phần tử',
    r4.json?.data?.proposal?.storyboardPages?.length === 3,
    asExtra({
      count: r4.json?.data?.proposal?.storyboardPages?.length
    })
  )

  // Step 9: Resubmit → PROPOSAL_REVIEW
  section('8. POST /series/:id/proposal/resubmit — PROPOSAL_REVISION → PROPOSAL_REVIEW')
  const r5 = await req('POST', `/series/${seriesId}/proposal/resubmit`, { token: m1Tok })
  ok('20. resubmit 2xx', r5.status === 200 || r5.status === 201, asExtra({ status: r5.status }))
  ok('21. proposal.status = PROPOSAL_REVIEW', r5.json?.data?.proposal?.status === 'PROPOSAL_REVIEW')

  // Step 10: Editor approve → READY_TO_PITCH (trực tiếp)
  section('9. POST /series/:id/proposal/approve — PROPOSAL_REVIEW → READY_TO_PITCH')
  const r6 = await req('POST', `/series/${seriesId}/proposal/approve`, { token: e1Tok })
  ok(
    '22. approve 2xx',
    r6.status === 200 || r6.status === 201,
    asExtra({
      status: r6.status,
      body: r6.raw.slice(0, 200)
    })
  )
  ok(
    '23. series.status = READY_TO_PITCH',
    r6.json?.data?.status === 'READY_TO_PITCH',
    asExtra({
      actual: r6.json?.data?.status
    })
  )
  ok('24. proposal.status = PROPOSAL_APPROVED', r6.json?.data?.proposal?.status === 'PROPOSAL_APPROVED')

  // Step 11: Verify DB
  section('10. Verify DB sau approve')
  const dbSeriesAfter = await prisma.series.findUnique({ where: { id: seriesId } })
  ok('25. DB có Series với status READY_TO_PITCH', dbSeriesAfter?.status === 'READY_TO_PITCH')
  ok('26. proposal.storyboardPages preserved', dbSeriesAfter?.proposal?.storyboardPages.length === 3)
  ok('27. proposal có status PROPOSAL_APPROVED', dbSeriesAfter?.proposal?.status === 'PROPOSAL_APPROVED')

  // Step 12: Verify the proposal does not create standalone Storyboard rows.
  section('11. Final verification — proposal pages remain embedded')
  const proposalNameRows = await prisma.storyboard.count({ where: { seriesId } })
  ok(
    '28. ZERO standalone Storyboard rows for this proposal',
    proposalNameRows === 0,
    asExtra({ count: proposalNameRows })
  )

  // Step 13: Test chapter-storyboard vẫn hoạt động sau khi series đã được serialize.
  section('12. Chapter storyboard (Spec 28 — Storyboard entity chỉ phục vụ chapter)')
  await prisma.series.update({ where: { id: seriesId }, data: { status: 'SERIALIZED' } })
  const rCh = await req('POST', '/chapters', {
    token: m1Tok,
    body: { seriesId, chapterNumber: 1, title: 'Chapter 1' }
  })
  ok(
    '29. chapter 2xx',
    rCh.status === 200 || rCh.status === 201,
    asExtra({ status: rCh.status, body: rCh.raw.slice(0, 200) })
  )
  const chapterId = rCh.json?.data?.id ?? rCh.json?.data?.chapter?.id
  if (chapterId) {
    const rStoryboard = await req('POST', `/chapters/${chapterId}/storyboards`, {
      token: m1Tok,
      body: { storyboardPages: [{ pageNumber: 1, fileUrl: 'chapter-storyboard-page-1.png' }] }
    })
    ok(
      '30. chapter-storyboard created',
      rStoryboard.status === 201,
      asExtra({
        status: rStoryboard.status,
        body: rStoryboard.raw.slice(0, 200)
      })
    )
    ok('31. storyboard.chapterId = chapterId', rStoryboard.json?.data?.chapterId === chapterId)

    const storyboardId = rStoryboard.json?.data?.id as string
    const createAnnotation = await req('POST', '/annotations', {
      token: m1Tok,
      body: {
        targetType: 'STORYBOARD',
        targetId: storyboardId,
        annotationType: 'TEXT',
        content: 'Storyboard scope uses the real Storyboard collection'
      }
    })
    ok(
      '32. owner creates STORYBOARD annotation through the real repository',
      createAnnotation.status === 201,
      asExtra({ status: createAnnotation.status, body: createAnnotation.raw.slice(0, 200) })
    )
    const listAnnotations = await req('GET', `/annotations?targetType=STORYBOARD&targetId=${storyboardId}`, {
      token: e1Tok
    })
    ok(
      '33. assigned Editor reads STORYBOARD annotations',
      listAnnotations.status === 200 && listAnnotations.json?.data?.items?.length === 1,
      asExtra({ status: listAnnotations.status, body: listAnnotations.raw.slice(0, 200) })
    )
    const annotationCount = await prisma.annotation.count({
      where: { targetType: 'STORYBOARD', targetId: storyboardId }
    })
    ok('34. annotation persisted against the Storyboard target', annotationCount === 1, asExtra({ annotationCount }))
    const forbiddenAnnotation = await req('POST', '/annotations', {
      token: m2Tok,
      body: {
        targetType: 'STORYBOARD',
        targetId: storyboardId,
        annotationType: 'TEXT',
        content: 'must be rejected'
      }
    })
    ok(
      '35. unrelated Mangaka cannot annotate another series Storyboard',
      forbiddenAnnotation.status === 403,
      asExtra({ status: forbiddenAnnotation.status, body: forbiddenAnnotation.raw.slice(0, 200) })
    )
  }

  const fail = summary(FLOW)
  await prisma.$disconnect()
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(async (e) => {
  console.error('[smoke-spec28] FATAL', e)
  await prisma.$disconnect().catch(() => undefined)
  process.exit(1)
})
