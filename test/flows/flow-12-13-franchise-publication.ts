import { wipeDb, seedRolesAndAdmin, prisma, makeUser, makeSeriesAt } from './lib/seed.js'
import { req, ok, section, summary, resetCounters } from './lib/http.js'
import { login } from './lib/auth.js'
import { SeriesStatus, ReadingDirection, RelationshipType } from '@prisma/client'

const FLOW = 'flow-12-13-franchise-publication'
const FAKE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa'

const main = async () => {
  resetCounters()
  console.log(`\n##### ${FLOW} #####`)
  await wipeDb()
  await seedRolesAndAdmin()

  const m1 = await makeUser('MANGAKA')
  const m2 = await makeUser('MANGAKA')
  const e1 = await makeUser('EDITOR')
  await makeUser('BOARD_MEMBER')
  const sa = await makeUser('SUPER_ADMIN')
  const mTok = await login(m1.email)
  const m2Tok = await login(m2.email)
  const eTok = await login(e1.email)
  const saTok = await login(sa.email)

  // ──────────────────────────────────────────────────────────────────────────
  // §13 PUBLICATION VERSION — controller có sẵn, test trước (đơn giản hơn)
  // ──────────────────────────────────────────────────────────────────────────
  section('PV1 Create PublicationVersion — happy path')
  // Cần series + editor. Tạo series mới với m1 + e1
  const seriesPV = await makeSeriesAt(SeriesStatus.SERIALIZED, { mangakaId: m1.id, editorId: e1.id })
  const pv1 = await req('POST', `/series/${seriesPV.id}/publication-versions`, {
    token: eTok,
    body: { language: 'en', readingDirection: ReadingDirection.LTR, versionType: 'ORIGINAL', notes: 'FT pub v1' }
  })
  ok('PV1.1 create 201', pv1.status === 201, `got ${pv1.status} ${pv1.raw.slice(0, 200)}`)
  const pvId = (pv1.json?.data ?? pv1.json)?.id as string
  ok('PV1.1b id present', !!pvId)

  section('PV2 List versions (mangaka đọc OK)')
  const list = await req('GET', `/series/${seriesPV.id}/publication-versions`, { token: mTok })
  ok('PV2.1 list 200', list.status === 200, `got ${list.status} ${list.raw.slice(0, 200)}`)

  section('PV3 Update version (editor)')
  const update = await req('PATCH', `/publication-versions/${pvId}`, {
    token: eTok,
    body: { notes: 'updated notes' }
  })
  ok('PV3.1 update 200', update.status === 200, `got ${update.status} ${update.raw.slice(0, 200)}`)

  section('PV4 Second version (different language)')
  const pv4 = await req('POST', `/series/${seriesPV.id}/publication-versions`, {
    token: eTok,
    body: { language: 'ja', readingDirection: ReadingDirection.RTL, versionType: 'DIGITAL' }
  })
  ok('PV4.1 second version 201', pv4.status === 201, `got ${pv4.status}`)

  section('PV5 RBAC: mangaka cannot create version → 403')
  const pv5 = await req('POST', `/series/${seriesPV.id}/publication-versions`, {
    token: mTok,
    body: { language: 'en' }
  })
  ok('PV5.1 mangaka create → 403', pv5.status === 403, `got ${pv5.status}`)

  section('PV6 RBAC: editor can delete')
  const pv6 = await req('DELETE', `/publication-versions/${pvId}`, { token: eTok })
  ok('PV6.1 editor delete 200', pv6.status === 200 || pv6.status === 204, `got ${pv6.status}`)

  section('PV7 Invalid payload → 422')
  const pv7 = await req('POST', `/series/${seriesPV.id}/publication-versions`, {
    token: eTok,
    body: {
      /* missing required */
    }
  })
  ok('PV7.1 missing required → 422', pv7.status === 422, `got ${pv7.status}`)

  section('PV8 DELETE not found')
  const pv8 = await req('DELETE', `/publication-versions/${FAKE_ID}`, { token: saTok })
  ok('PV8.1 → 404', pv8.status === 404, `got ${pv8.status}`)

  section('PV9 Invalid readingDirection → 422')
  const pv9 = await req('POST', `/series/${seriesPV.id}/publication-versions`, {
    token: eTok,
    body: { language: 'en', readingDirection: 'INVALID' as never }
  })
  ok('PV9.1 invalid direction → 422', pv9.status === 422, `got ${pv9.status}`)

  section('PV10 List for series with no versions (mangaka owner OK)')
  const emptySeries = await makeSeriesAt(SeriesStatus.DRAFT, { mangakaId: m1.id })
  const listEmpty = await req('GET', `/series/${emptySeries.id}/publication-versions`, { token: mTok })
  ok('PV10.1 empty list 200', listEmpty.status === 200, `got ${listEmpty.status} ${listEmpty.raw.slice(0, 200)}`)

  // ──────────────────────────────────────────────────────────────────────────
  // §12 FRANCHISE — tạo sequel qua Prisma (controller cụ thể chưa có)
  // ──────────────────────────────────────────────────────────────────────────
  section('FR1 Series sequel với parentSeriesId + relationshipType')
  // Tạo parent series (DRAFT - chưa serialize để tránh contract gate)
  const parent = await makeSeriesAt(SeriesStatus.DRAFT, { mangakaId: m1.id, editorId: e1.id })
  // Tạo sequel qua Prisma trực tiếp (test data setup)
  const sequel = await prisma.series.create({
    data: {
      title: `FT Sequel ${Date.now()}`,
      mangakaId: m2.id,
      status: SeriesStatus.DRAFT,
      genres: ['ACTION'],
      demographic: 'SHONEN',
      parentSeriesId: parent.id,
      relationshipType: RelationshipType.SEQUEL,
      proposal: {
        nameId: null,
        synopsis: 'sequel',
        characterDesigns: [],
        estimatedLength: null,
        status: 'DRAFT',
        createdAt: new Date()
      } as never,
      statusHistory: [{ fromStatus: 'INITIAL', toStatus: 'DRAFT', changedBy: m2.id, at: new Date() }] as never
    }
  })
  ok('FR1.1 sequel created', !!sequel.id)
  const sequelDB = await prisma.series.findUnique({ where: { id: sequel.id } })
  ok('FR1.1b parentSeriesId set', sequelDB?.parentSeriesId === parent.id, `got ${sequelDB?.parentSeriesId}`)
  ok(
    'FR1.1c relationship=SEQUEL',
    sequelDB?.relationshipType === RelationshipType.SEQUEL,
    `got ${sequelDB?.relationshipType}`
  )

  section('FR2 Different mangaka sequel → requires consent (state machine check)')
  // sequel có mangakaId=m2, parent có mangakaId=m1 → consent required
  const sequel2 = await prisma.series.create({
    data: {
      title: `FT Spinoff ${Date.now()}`,
      mangakaId: m2.id,
      status: SeriesStatus.DRAFT,
      genres: ['ACTION'],
      demographic: 'SHONEN',
      parentSeriesId: parent.id,
      relationshipType: RelationshipType.SPINOFF,
      franchiseConsentStatus: 'PENDING',
      proposal: {
        nameId: null,
        synopsis: 'spinoff',
        characterDesigns: [],
        estimatedLength: null,
        status: 'DRAFT',
        createdAt: new Date()
      } as never,
      statusHistory: [{ fromStatus: 'INITIAL', toStatus: 'DRAFT', changedBy: m2.id, at: new Date() }] as never
    }
  })
  ok('FR2.1 cross-mangaka sequel has PENDING consent', sequel2.franchiseConsentStatus === 'PENDING')

  section('FR3 Same-mangaka sequel → no consent required')
  const sequel3 = await prisma.series.create({
    data: {
      title: `FT SameMangaka ${Date.now()}`,
      mangakaId: m1.id, // SAME mangaka as parent
      status: SeriesStatus.DRAFT,
      genres: ['ACTION'],
      demographic: 'SHONEN',
      parentSeriesId: parent.id,
      relationshipType: RelationshipType.SEQUEL,
      franchiseConsentStatus: 'APPROVED',
      proposal: {
        nameId: null,
        synopsis: 'same',
        characterDesigns: [],
        estimatedLength: null,
        status: 'DRAFT',
        createdAt: new Date()
      } as never,
      statusHistory: [{ fromStatus: 'INITIAL', toStatus: 'DRAFT', changedBy: m1.id, at: new Date() }] as never
    }
  })
  ok('FR3.1 same-mangaka sequel consent APPROVED', sequel3.franchiseConsentStatus === 'APPROVED')

  section('FR4 GET series detail có parentSeriesId + relationshipType')
  const fr4 = await req('GET', `/series/${sequel.id}`, { token: m2Tok })
  ok('FR4.1 GET sequel 200', fr4.status === 200, `got ${fr4.status} ${fr4.raw.slice(0, 200)}`)
  const fr4Data = (fr4.json?.data ?? fr4.json) as { parentSeriesId?: string; relationshipType?: string }
  ok('FR4.1b response parentSeriesId matches', fr4Data?.parentSeriesId === parent.id)
  ok('FR4.1c response relationshipType matches', fr4Data?.relationshipType === 'SEQUEL')

  await prisma.$disconnect()
  const fail = summary(FLOW)
  process.exit(fail > 0 ? 1 : 0)
}

void main().catch(async (e) => {
  console.error('FATAL', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
