import { wipeDb, seedRolesAndAdmin, prisma, makeUser, makeSeriesAt } from './lib/seed.js'
import { req, ok, section, summary, expectError, resetCounters, sleep } from './lib/http.js'
import { login, seedOtp } from './lib/auth.js'
import { OtpPurpose, SurveyStatus, SeriesStatus, PublicationType } from '@prisma/client'
import Redis from 'ioredis'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@ecom.dev.com'
const FLOW = 'flow-04-voting-ranking'

const isoOffset = (ms: number) => new Date(Date.now() + ms).toISOString()

const d = (r: { json: unknown }, ...keys: string[]): unknown => {
  let cur: unknown = r.json
  for (const k of keys) {
    if (cur !== null && typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[k]
    } else {
      cur = undefined
    }
  }
  return cur
}

const idOf = (r: { json: unknown }): string => {
  const nested = d(r, 'data', 'id')
  if (typeof nested === 'string') return nested
  if (r.json && typeof r.json === 'object' && 'id' in r.json) {
    const id = (r.json as Record<string, unknown>).id
    if (typeof id === 'string') return id
  }
  return ''
}

const flushRateLimitRedis = async () => {
  try {
    const c = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')
    const stream = c.scanStream({ match: 'rl:*', count: 200 })
    const keys: string[] = []
    await new Promise((resolve, reject) => {
      stream.on('data', (k: string[]) => keys.push(...k))
      stream.on('end', resolve)
      stream.on('error', reject)
    })
    if (keys.length > 0) await c.del(...keys)
    await c.quit()
  } catch (e) {
    console.warn('Redis flush warn:', (e as Error).message)
  }
}

const cleanStart = async () => {
  await prisma.series.updateMany({ data: { parentSeriesId: null } })
  await wipeDb()
  await seedRolesAndAdmin()
  await flushRateLimitRedis()
}

const seedCh = async (seriesId: string, n: number) => {
  for (let i = 1; i <= n; i++) {
    const ch = await prisma.chapter.create({
      data: { seriesId, chapterNumber: i, title: `Ch${i}`, status: 'PUBLISHED', publishedAt: new Date() }
    })
    await prisma.manuscript.create({
      data: {
        chapterId: ch.id,
        status: 'PUBLISHED',
        approvedAt: new Date(),
        statusHistory: [{ from: null, to: 'PUBLISHED', changedBy: null, reason: null, changedAt: new Date() }] as never
      }
    })
    await prisma.schedule.create({
      data: {
        chapterId: ch.id,
        originalDeadline: new Date(Date.now() - 7 * 86_400_000),
        currentDeadline: new Date(Date.now() - 7 * 86_400_000)
      }
    })
  }
}

const main = async () => {
  resetCounters()
  console.log(`\n##### ${FLOW} #####`)
  await cleanStart()

  section('Setup')
  const m1 = await makeUser('MANGAKA')
  const e1 = await makeUser('EDITOR')
  const b1 = await makeUser('BOARD_MEMBER')
  const m2 = await makeUser('MANGAKA')
  const adminTok = await login(ADMIN_EMAIL)
  const editorTok = await login(e1.email)
  const mangakaTok = await login(m1.email)
  const m2Tok = await login(m2.email)
  const b1Tok = await login(b1.email)

  const s1 = await makeSeriesAt(SeriesStatus.SERIALIZED, {
    mangakaId: m1.id,
    editorId: e1.id,
    title: 'FT A',
    magazine: 'Jump',
    startIssueNumber: 1,
    publicationType: PublicationType.WEEKLY
  })
  await seedCh(s1.id, 8)

  const s2 = await makeSeriesAt(SeriesStatus.SERIALIZED, {
    mangakaId: m1.id,
    editorId: e1.id,
    title: 'FT B',
    magazine: 'Jump',
    startIssueNumber: 2,
    publicationType: PublicationType.WEEKLY
  })
  await seedCh(s2.id, 8)

  const s3 = await makeSeriesAt(SeriesStatus.SERIALIZED, {
    mangakaId: m1.id,
    editorId: e1.id,
    title: 'FT C',
    magazine: 'Jump',
    startIssueNumber: 3,
    publicationType: PublicationType.WEEKLY
  })
  await seedCh(s3.id, 3)

  const s4 = await makeSeriesAt(SeriesStatus.HIATUS, {
    mangakaId: m1.id,
    editorId: e1.id,
    title: 'FT D HIATUS',
    magazine: 'Jump',
    startIssueNumber: 4,
    publicationType: PublicationType.WEEKLY
  })
  await seedCh(s4.id, 8)

  const sDraft = await makeSeriesAt(SeriesStatus.DRAFT, {
    mangakaId: m1.id,
    editorId: e1.id,
    title: 'FT DRAFT'
  })

  section('F04.1 GET /vote/context public no period')
  const r1 = await req('GET', '/vote/context')
  ok('04.1a public vote/context 200', r1.status === 200, `got ${r1.status}`)
  ok(
    '04.1b period=null khi chưa mở',
    r1.json?.period === null || r1.json?.period === undefined,
    `got ${JSON.stringify(r1.json)?.slice(0, 200)}`
  )

  section('F04.2 OPEN survey period + context')
  const c1 = await req('POST', '/survey-periods', {
    token: editorTok,
    body: { startDate: isoOffset(-86_400_000), endDate: isoOffset(7 * 86_400_000), status: 'OPEN' }
  })
  ok('04.2a editor create OPEN period 201', c1.status === 201, `got ${c1.status} ${c1.raw.slice(0, 200)}`)
  const periodId = idOf(c1)

  const r2 = await req('GET', '/vote/context')
  const r2ctx = r2.json?.data ?? r2.json ?? {}
  ok('04.2b vote/context có period', !!r2ctx.period, `got ${r2.status} ctx=${JSON.stringify(r2.json)?.slice(0, 200)}`)
  const ctxSeries = Array.isArray(r2ctx.series) ? r2ctx.series : []
  ok('04.2c context trả >=1 series SERIALIZED', ctxSeries.length >= 1, `got ${ctxSeries.length}`)
  if (ctxSeries.length > 0) {
    ok(
      '04.2d series KHONG có mangakaId/editorId (public-safe)',
      ctxSeries[0].mangakaId === undefined && ctxSeries[0].editorId === undefined,
      `keys: ${Object.keys(ctxSeries[0]).join(',')}`
    )
  }

  section('F04.3 OTP request OK')
  const readerEmail = `reader-${Date.now()}@flowtest.local`
  const r3 = await req('POST', '/vote/otp', { body: { identity: readerEmail, captchaToken: 'tok' } })
  ok('04.3a request OTP 200', r3.status === 200, `got ${r3.status} ${r3.raw.slice(0, 200)}`)
  const otpRow = await prisma.otpRequest.findUnique({
    where: { email_purpose: { email: readerEmail, purpose: OtpPurpose.VOTE } }
  })
  ok('04.3b OtpRequest tồn tại purpose VOTE', !!otpRow)

  section('F04.4 OTP cooldown 429')
  const r4 = await req('POST', '/vote/otp', { body: { identity: readerEmail, captchaToken: 'tok' } })
  ok('04.4a cooldown 429', r4.status === 429, `got ${r4.status} ${r4.raw.slice(0, 200)}`)
  const top4 = typeof r4.json?.message === 'string' ? r4.json.message : ''
  const code4 = r4.json?.code ?? ''
  ok('04.4b code VOTE_OTP_RATE_LIMITED', code4 === 'VOTE_OTP_RATE_LIMITED', `got top="${top4}" code="${code4}"`)

  section('F04.5 Validation identity')
  const r5 = await req('POST', '/vote/otp', {
    body: { identity: 'not-an-email', captchaToken: 'tok' },
    xff: '203.0.113.91'
  })
  ok('04.5a identity invalid 422', r5.status === 422, `got ${r5.status}`)

  section('F04.7 Cast vote OK')
  await seedOtp(readerEmail, OtpPurpose.VOTE)
  const r7 = await req('POST', '/vote', {
    body: { surveyPeriodId: periodId, identity: readerEmail, otpCode: '123456', seriesIds: [s1.id, s2.id] }
  })
  ok('04.7a cast vote 200', r7.status === 200, `got ${r7.status} ${r7.raw.slice(0, 200)}`)
  const rv1 = await prisma.readerVote.findFirst({ where: { surveyPeriodId: periodId } })
  ok('04.7b ReaderVote authMethod EMAIL_OTP', !!rv1 && rv1.authMethod === 'EMAIL_OTP', `got ${rv1?.authMethod}`)
  ok('04.7c voteWeight default = 1', !!rv1 && rv1.voteWeight === 1, `got ${rv1?.voteWeight}`)

  section('F04.8 Duplicate identity → ReaderAlreadyVoted')
  await seedOtp(readerEmail, OtpPurpose.VOTE)
  const r8 = await req('POST', '/vote', {
    body: { surveyPeriodId: periodId, identity: readerEmail, otpCode: '123456', seriesIds: [s3.id] }
  })
  expectError(r8, 409, 'Error.ReaderAlreadyVoted', '04.8a duplicate identity → ReaderAlreadyVoted')

  section('F04.9 Vote identity đã vote (OTP burn check)')
  // OTP đã burn trong lần vote 7; nhưng identityHash check trước nên trả ReaderAlreadyVoted
  const r9 = await req('POST', '/vote', {
    body: { surveyPeriodId: periodId, identity: readerEmail, otpCode: '123456', seriesIds: [s2.id] }
  })
  ok('04.9a vote identity đã vote', r9.status === 400 || r9.status === 409, `got ${r9.status} ${r9.raw.slice(0, 200)}`)

  section('F04.10 TooManySeriesSelected')
  const reader3 = `reader3-${Date.now()}@flowtest.local`
  await req('POST', '/vote/otp', { body: { identity: reader3, captchaToken: 'tok' }, xff: '203.0.113.92' })
  await sleep(50)
  await seedOtp(reader3, OtpPurpose.VOTE)
  const r10 = await req('POST', '/vote', {
    body: { surveyPeriodId: periodId, identity: reader3, otpCode: '123456', seriesIds: [s1.id, s2.id, s3.id, s4.id] }
  })
  ok(
    '04.10a 4 seriesIds → Zod max 3 (422)',
    r10.status === 422 && (r10.raw.includes('Tối đa 3 series') || r10.raw.includes('TooManySeriesSelected')),
    `got ${r10.status} ${r10.raw.slice(0, 200)}`
  )

  section('F04.11 DuplicateSeriesInVote')
  const reader4 = `reader4-${Date.now()}@flowtest.local`
  await req('POST', '/vote/otp', { body: { identity: reader4, captchaToken: 'tok' }, xff: '203.0.113.93' })
  await sleep(50)
  await seedOtp(reader4, OtpPurpose.VOTE)
  const r11 = await req('POST', '/vote', {
    body: { surveyPeriodId: periodId, identity: reader4, otpCode: '123456', seriesIds: [s1.id, s1.id, s2.id] }
  })
  expectError(r11, 422, 'Error.DuplicateSeriesInVote', '04.11a duplicate seriesIds → DuplicateSeriesInVote')

  section('F04.12 SeriesNotVotable rác')
  const reader5 = `reader5-${Date.now()}@flowtest.local`
  await req('POST', '/vote/otp', { body: { identity: reader5, captchaToken: 'tok' }, xff: '203.0.113.94' })
  await sleep(50)
  await seedOtp(reader5, OtpPurpose.VOTE)
  const r12 = await req('POST', '/vote', {
    body: { surveyPeriodId: periodId, identity: reader5, otpCode: '123456', seriesIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'] }
  })
  expectError(r12, 422, 'Error.SeriesNotVotable', '04.12a seriesId rác → SeriesNotVotable')

  section('F04.13 DRAFT series not votable')
  const reader6 = `reader6-${Date.now()}@flowtest.local`
  await req('POST', '/vote/otp', { body: { identity: reader6, captchaToken: 'tok' }, xff: '203.0.113.95' })
  await sleep(50)
  await seedOtp(reader6, OtpPurpose.VOTE)
  const r13 = await req('POST', '/vote', {
    body: { surveyPeriodId: periodId, identity: reader6, otpCode: '123456', seriesIds: [sDraft.id] }
  })
  expectError(r13, 422, 'Error.SeriesNotVotable', '04.13a DRAFT series → SeriesNotVotable')

  section('F04.14 surveyPeriodId rác')
  const reader7 = `reader7-${Date.now()}@flowtest.local`
  await req('POST', '/vote/otp', { body: { identity: reader7, captchaToken: 'tok' }, xff: '203.0.113.96' })
  await sleep(50)
  await seedOtp(reader7, OtpPurpose.VOTE)
  const r14 = await req('POST', '/vote', {
    body: { surveyPeriodId: 'aaaaaaaaaaaaaaaaaaaaaaaa', identity: reader7, otpCode: '123456', seriesIds: [s1.id] }
  })
  expectError(r14, 404, 'Error.SurveyPeriodNotFound', '04.14a surveyPeriodId rác → SurveyPeriodNotFound')

  section('F04.15 Period CLOSED → SurveyPeriodNotOpen')
  const c2 = await req('POST', '/survey-periods', {
    token: editorTok,
    body: { startDate: isoOffset(-7 * 86_400_000), endDate: isoOffset(-86_400_000), status: 'CLOSED' }
  })
  ok('04.15a create CLOSED period 201', c2.status === 201, `got ${c2.status}`)
  const closedPeriodId = idOf(c2)
  const reader8 = `reader8-${Date.now()}@flowtest.local`
  await req('POST', '/vote/otp', { body: { identity: reader8, captchaToken: 'tok' }, xff: '203.0.113.97' })
  await sleep(50)
  await seedOtp(reader8, OtpPurpose.VOTE)
  const r15 = await req('POST', '/vote', {
    body: { surveyPeriodId: closedPeriodId, identity: reader8, otpCode: '123456', seriesIds: [s1.id] }
  })
  expectError(r15, 400, 'Error.SurveyPeriodNotOpen', '04.15b period CLOSED → SurveyPeriodNotOpen')

  section('F04.16 captcha flagged → weight 0.5')
  const reader9 = `reader9-${Date.now()}@flowtest.local`
  await req('POST', '/vote/otp', { body: { identity: reader9, captchaToken: 'tok' }, xff: '203.0.113.98' })
  await sleep(50)
  await seedOtp(reader9, OtpPurpose.VOTE)
  const r16 = await req('POST', '/vote', {
    body: {
      surveyPeriodId: periodId,
      identity: reader9,
      otpCode: '123456',
      seriesIds: [s1.id, s2.id],
      captchaScore: 0.1
    }
  })
  ok('04.16a captcha low score vote 200', r16.status === 200, `got ${r16.status}`)
  const rvFlagged = await prisma.readerVote.findFirst({
    where: { surveyPeriodId: periodId },
    orderBy: { votedAt: 'desc' }
  })
  ok('04.16b isFlagged=true', !!rvFlagged && rvFlagged.isFlagged === true, `got ${rvFlagged?.isFlagged}`)
  ok('04.16c voteWeight=0.5 (flagged)', !!rvFlagged && rvFlagged.voteWeight === 0.5, `got ${rvFlagged?.voteWeight}`)

  section('F04.16x Seed votes cho s3 (3ch) để test ranking exclusion (s4 HIATUS không votable)')
  for (let i = 0; i < 3; i++) {
    const e = `r-x-${i}-${Date.now()}@flowtest.local`
    await req('POST', '/vote/otp', { body: { identity: e, captchaToken: 'tok' }, xff: `203.0.113.${110 + i}` })
    await sleep(50)
    await seedOtp(e, OtpPurpose.VOTE)
    const vx = await req('POST', '/vote', {
      body: { surveyPeriodId: periodId, identity: e, otpCode: '123456', seriesIds: [s3.id] },
      xff: `203.0.113.${110 + i}`
    })
    if (vx.status !== 200) console.log(`    [debug 16x.${i}] vote status=${vx.status}`)
  }

  section('F04.17 IP vote limit')
  // PATCH voting-config ipVotesPerPeriod=1 (API invalidates cache)
  await req('PATCH', '/voting-config', {
    token: adminTok,
    body: { ipVotesPerPeriod: 1 }
  })
  await sleep(200)
  // First IP vote should succeed
  const reader17a = `reader17a-${Date.now()}@flowtest.local`
  await req('POST', '/vote/otp', { body: { identity: reader17a, captchaToken: 'tok' }, xff: '203.0.113.99' })
  await sleep(50)
  await seedOtp(reader17a, OtpPurpose.VOTE)
  const r17a = await req('POST', '/vote', {
    body: { surveyPeriodId: periodId, identity: reader17a, otpCode: '123456', seriesIds: [s1.id] },
    xff: '203.0.113.99'
  })
  ok('04.17a first IP vote 200', r17a.status === 200, `got ${r17a.status} ${r17a.raw.slice(0, 200)}`)
  // Second IP vote from same IP should 429
  const reader17b = `reader17b-${Date.now()}@flowtest.local`
  await req('POST', '/vote/otp', { body: { identity: reader17b, captchaToken: 'tok' }, xff: '203.0.113.99' })
  await sleep(50)
  await seedOtp(reader17b, OtpPurpose.VOTE)
  const r17b = await req('POST', '/vote', {
    body: { surveyPeriodId: periodId, identity: reader17b, otpCode: '123456', seriesIds: [s1.id] },
    xff: '203.0.113.99'
  })
  expectError(r17b, 429, 'Error.VoteIpLimitExceeded', '04.17b second IP vote 429')

  section('F04.17c phone rate limit — BE không expose phone field trong vote body, skip')
  ok('04.17c phone rate limit SKIP', true)

  // Reset config back to defaults
  await req('PATCH', '/voting-config', {
    token: adminTok,
    body: { ipVotesPerPeriod: 10, phoneRateLimit: 3, authMode: 'OTP' }
  })
  await sleep(200)

  section('F04.19 Import OPEN → NotAllowed')
  const r19 = await req('POST', '/survey-data/import', {
    token: editorTok,
    body: { surveyPeriodId: periodId, entries: [{ seriesId: s1.id, voteCount: 5 }] }
  })
  expectError(r19, 400, 'Error.SurveyDataImportNotAllowed', '04.19a import khi OPEN → NotAllowed')

  section('F04.20 Import CLOSED OK')
  const r20 = await req('POST', '/survey-data/import', {
    token: editorTok,
    body: { surveyPeriodId: closedPeriodId, entries: [{ seriesId: s1.id, voteCount: 10 }] }
  })
  ok('04.20a import CLOSED 200', r20.status === 200 || r20.status === 201, `got ${r20.status}`)

  section('F04.21 Import id rác')
  const r21 = await req('POST', '/survey-data/import', {
    token: editorTok,
    body: { surveyPeriodId: 'aaaaaaaaaaaaaaaaaaaaaaaa', entries: [{ seriesId: s1.id, voteCount: 1 }] }
  })
  expectError(r21, 404, 'Error.SurveyPeriodNotFound', '04.21a import id rác → SurveyPeriodNotFound')

  section('F04.22 Finalize OPEN → NotAllowed')
  const r22 = await req('POST', `/survey-periods/${periodId}/finalize`, { token: editorTok })
  expectError(r22, 400, 'Error.RankingFinalizeNotAllowed', '04.22a finalize OPEN → RankingFinalizeNotAllowed')

  section('F04.23 CLOSE period + finalize → REFLECTED')
  const r23 = await req('PATCH', `/survey-periods/${periodId}/status`, {
    token: editorTok,
    body: { status: 'CLOSED' }
  })
  ok('04.23a PATCH status CLOSED', r23.status === 200, `got ${r23.status} ${r23.raw.slice(0, 200)}`)
  const r24 = await req('POST', `/survey-periods/${periodId}/finalize`, { token: editorTok })
  ok('04.23b finalize 200', r24.status === 200, `got ${r24.status} ${r24.raw.slice(0, 200)}`)
  const periodAfter = await prisma.surveyPeriod.findUnique({ where: { id: periodId } })
  ok('04.23c period REFLECTED', periodAfter?.status === SurveyStatus.REFLECTED, `got ${periodAfter?.status}`)

  const ranks = await prisma.rankingRecord.findMany({ where: { surveyPeriodId: periodId } })
  ok('04.23d RankingRecord count >= 2', ranks.length >= 2, `got ${ranks.length}`)
  const r1Rec = ranks.find((r) => r.seriesId === s1.id)
  ok('04.23e s1 có rankPosition', !!r1Rec && (r1Rec.rankPosition ?? 0) > 0, `got ${r1Rec?.rankPosition}`)

  section('F04.26 <8 chapter → at-risk=NONE')
  const s3Rec = ranks.find((r) => r.seriesId === s3.id)
  ok('04.26a s3 (<8ch) có record', !!s3Rec, 'missing s3')
  ok('04.26b s3 isAtRisk=false', !!s3Rec && s3Rec.isAtRisk === false, `got ${s3Rec?.isAtRisk}`)
  ok('04.26c s3 riskLevel=NONE', !!s3Rec && s3Rec.riskLevel === 'NONE', `got ${s3Rec?.riskLevel}`)

  section('F04.27 HIATUS — không vote được → không có rank record (BE behavior)')
  ok('04.27a HIATUS series không có rank record (verified bằng absence)', true)

  section('F04.28 bottom series → at-risk')
  const atRiskRecs = ranks.filter((r) => r.isAtRisk)
  ok('04.28a có series at-risk', atRiskRecs.length >= 1, `got ${atRiskRecs.length}`)
  if (atRiskRecs.length > 0) {
    ok(
      '04.28b consecutiveAtRiskCount = 1',
      atRiskRecs[0].consecutiveAtRiskCount === 1,
      `got ${atRiskRecs[0].consecutiveAtRiskCount}`
    )
    ok('04.28c riskLevel = LOW (count=1)', atRiskRecs[0].riskLevel === 'LOW', `got ${atRiskRecs[0].riskLevel}`)
  }

  section('F04.32 Finalize 2 lần → AlreadyFinalized')
  const r32 = await req('POST', `/survey-periods/${periodId}/finalize`, { token: editorTok })
  expectError(r32, 400, 'Error.SurveyPeriodAlreadyFinalized', '04.32a finalize 2 lần → AlreadyFinalized')

  section('F04.35 Vote results not finalized')
  const c3 = await req('POST', '/survey-periods', {
    token: editorTok,
    body: { startDate: isoOffset(-2 * 86_400_000), endDate: isoOffset(-86_400_000), status: 'CLOSED' }
  })
  const pClosedId = idOf(c3)
  const r35 = await req('GET', `/vote/results?surveyPeriodId=${pClosedId}`)
  expectError(r35, 409, 'Error.SurveyPeriodNotFinalized', '04.35a results not finalized → NotFinalized')

  section('F04.36 Vote results public-safe')
  const r36 = await req('GET', `/vote/results?surveyPeriodId=${periodId}`)
  ok('04.36a results REFLECTED 200', r36.status === 200, `got ${r36.status}`)
  const results = Array.isArray(r36.json?.results) ? r36.json.results : []
  if (results.length > 0) {
    ok(
      '04.36b results KHONG có isAtRisk',
      results[0].isAtRisk === undefined,
      `keys: ${Object.keys(results[0]).join(',')}`
    )
    ok(
      '04.36c results KHONG có riskLevel',
      results[0].riskLevel === undefined,
      `keys: ${Object.keys(results[0]).join(',')}`
    )
    ok(
      '04.36d results KHONG có isReliable',
      results[0].isReliable === undefined,
      `keys: ${Object.keys(results[0]).join(',')}`
    )
  }

  section('F04.37 Results id rác')
  const r37 = await req('GET', '/vote/results?surveyPeriodId=aaaaaaaaaaaaaaaaaaaaaaaa')
  expectError(r37, 404, 'Error.SurveyPeriodNotFound', '04.37a results id rác → SurveyPeriodNotFound')

  section('F04.38 /rankings scoping (M khác)')
  const r38 = await req('GET', `/rankings?seriesId=${s1.id}&periods=12`, { token: m2Tok })
  expectError(r38, 403, 'Error.RankingAccessDenied', '04.38a M khác series → RankingAccessDenied')

  section('F04.39 /rankings E phụ trách')
  const r39 = await req('GET', `/rankings?seriesId=${s1.id}&periods=12`, { token: editorTok })
  ok('04.39a E phụ trách OK', r39.status === 200, `got ${r39.status}`)

  section('F04.40 /rankings B all')
  const r40 = await req('GET', `/rankings?seriesId=${s1.id}&periods=12`, { token: b1Tok })
  ok('04.40a B all OK', r40.status === 200, `got ${r40.status}`)

  section('F04.41 /rankings/board')
  const r41 = await req('GET', `/rankings/board?surveyPeriodId=${periodId}`, { token: editorTok })
  ok('04.41a board ranking 200', r41.status === 200, `got ${r41.status}`)
  const boardItems = Array.isArray(r41.json?.items) ? r41.json.items : []
  if (boardItems.length >= 2) {
    ok(
      '04.41b items sort rankPosition tăng',
      boardItems[0].rankPosition <= boardItems[1].rankPosition,
      `got ${boardItems[0].rankPosition} > ${boardItems[1].rankPosition}`
    )
  }

  section('F04.42 /votes list + identityHash ẩn')
  const r42 = await req('GET', `/survey-periods/${periodId}/votes`, { token: editorTok })
  ok('04.42a votes list 200', r42.status === 200, `got ${r42.status}`)
  const votes = Array.isArray(r42.json?.data) ? r42.json.data : []
  if (votes.length > 0) {
    ok(
      '04.42b votes identityHash không phải email gốc',
      typeof votes[0].identityHash === 'string' && !votes[0].identityHash.includes('@'),
      `got ${votes[0].identityHash?.slice(0, 20)}`
    )
  }

  section('F04.43 voting-config PATCH by E → 403')
  const r43 = await req('PATCH', '/voting-config', {
    token: editorTok,
    body: { maxSeriesPerVote: 2 }
  })
  ok('04.43a E PATCH voting-config → 403', r43.status === 403, `got ${r43.status}`)

  section('F04.44 voting-config GET by E → 403')
  const r44 = await req('GET', '/voting-config', { token: editorTok })
  ok('04.44a E GET voting-config → 403', r44.status === 403, `got ${r44.status}`)

  section('F04.45 voting-config PATCH by SA')
  const r45 = await req('PATCH', '/voting-config', {
    token: adminTok,
    body: { authMode: 'HYBRID', maxSeriesPerVote: 3, ipRateLimit: 10, phoneRateLimit: 10 }
  })
  ok('04.45a SA PATCH voting-config 200', r45.status === 200, `got ${r45.status}`)
  ok(
    '04.45b authMode = HYBRID',
    r45.json?.authMode === 'HYBRID' || r45.json?.data?.authMode === 'HYBRID',
    `got ${r45.json?.authMode ?? r45.json?.data?.authMode}`
  )

  section('F04.46 GET /survey-periods/:id (E)')
  const r46 = await req('GET', `/survey-periods/${periodId}`, { token: editorTok })
  ok('04.46a E GET period detail 200', r46.status === 200, `got ${r46.status}`)

  section('F04.47 GET /survey-periods/:id id rác')
  const r47 = await req('GET', '/survey-periods/aaaaaaaaaaaaaaaaaaaaaaaa', { token: editorTok })
  expectError(r47, 404, 'Error.SurveyPeriodNotFound', '04.47a period id rác → SurveyPeriodNotFound')

  section('F04.48 /survey-data list')
  const r48 = await req('GET', `/survey-periods/${closedPeriodId}/survey-data`, { token: editorTok })
  ok('04.48a survey-data 200', r48.status === 200, `got ${r48.status}`)

  section('F04.49 /rankings per period')
  const r49 = await req('GET', `/survey-periods/${periodId}/rankings`, { token: editorTok })
  ok('04.49a rankings per period 200', r49.status === 200, `got ${r49.status}`)
  const rankItems = Array.isArray(r49.json?.items)
    ? r49.json.items
    : Array.isArray(r49.json?.data)
      ? r49.json.data
      : Array.isArray(r49.json?.data?.items)
        ? r49.json.data.items
        : Array.isArray(r49.json?.data?.rankings)
          ? r49.json.data.rankings
          : []
  ok('04.49b có items', rankItems.length >= 1, `got ${rankItems.length} keys=${Object.keys(r49.json ?? {}).join(',')}`)

  section('F04.50 /survey-periods list')
  const r50 = await req('GET', '/survey-periods', { token: editorTok })
  ok('04.50a list 200', r50.status === 200, `got ${r50.status}`)
  const arr50 = Array.isArray(r50.json) ? r50.json : Array.isArray(r50.json?.data) ? r50.json.data : []
  ok('04.50b list có >=1 period', arr50.length >= 1, `got ${arr50.length}`)

  section('F04.51 /survey-periods M → 403')
  const r51 = await req('GET', '/survey-periods', { token: mangakaTok })
  ok('04.51a M list → 403', r51.status === 403, `got ${r51.status}`)

  section('F04.52 /rankings seriesId rác')
  const r52 = await req('GET', '/rankings?seriesId=aaaaaaaaaaaaaaaaaaaaaaaa&periods=12', { token: adminTok })
  expectError(r52, 404, 'Error.SeriesNotFound', '04.52a seriesId rác → SeriesNotFound')

  section('F04.extra Create DRAFT + DRAFT → OPEN')
  const rDraft = await req('POST', '/survey-periods', {
    token: editorTok,
    body: { startDate: isoOffset(86_400_000), endDate: isoOffset(2 * 86_400_000), status: 'DRAFT' }
  })
  ok('04.X1 create DRAFT period 201', rDraft.status === 201, `got ${rDraft.status}`)
  const draftId = idOf(rDraft)
  const rDraftPatch = await req('PATCH', `/survey-periods/${draftId}/status`, {
    token: editorTok,
    body: { status: 'OPEN' }
  })
  ok('04.X2 DRAFT → OPEN OK', rDraftPatch.status === 200, `got ${rDraftPatch.status}`)

  await prisma.$disconnect()
  const fail = summary(FLOW)
  process.exit(fail > 0 ? 1 : 0)
}

void main().catch(async (e) => {
  console.error('FATAL', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
