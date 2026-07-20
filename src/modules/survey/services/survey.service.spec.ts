import { SurveyService } from './survey.service'
import { SurveyMessages } from '../survey.messages'
import { DomainEvent } from 'src/core/events/domain-events'
import { IdentityHashService } from 'src/infrastructure/crypto/identity-hash.service'
import { ReaderVoteBodySchema, VoteOtpRequestBodySchema } from '../schemas/survey-schemas'
import { AuditEntityType } from '@prisma/client'
import { CaptchaRejectedException } from '../errors/survey.errors'
import { asCacheService, makeCacheServiceMock } from 'src/infrastructure/redis/cache.service.mock'

// Real (not mocked) so identity/ip hashing determinism is exercised end-to-end in submitVote tests.
const identityHash = new IdentityHashService('test-pepper')

type Mocks = {
  surveyRepository: any
  authOtpService: any
  identityHashService: IdentityHashService
  rateLimitService: any
  domainEventBus: any
  notificationService: any
  surveyConfigService: any
  appConfigService: any
  auditService: any
  recaptchaService: any
  redisService: any
}

function makeMocks(): Mocks {
  return {
    surveyRepository: {
      findSurveyPeriodById: jest.fn(),
      getSurveyDataByPeriod: jest.fn().mockResolvedValue([]),
      getReaderVotesByPeriod: jest.fn().mockResolvedValue([]),
      findPreviousSurveyPeriod: jest.fn().mockResolvedValue(null),
      getRankingRecordsByPeriod: jest.fn().mockResolvedValue([]),
      getRankingRecordsBySeries: jest.fn().mockResolvedValue([]),
      findReaderVoteByPeriodAndIdentity: jest.fn(),
      countReaderVotesByPeriodAndIp: jest.fn().mockResolvedValue(0),
      createReaderVote: jest.fn().mockResolvedValue({}),
      createRankingRecord: jest.fn().mockResolvedValue({}),
      updateSurveyPeriodStatus: jest.fn().mockResolvedValue({}),
      countPublishedChaptersBySeriesIds: jest.fn().mockResolvedValue(new Map()),
      findHeldChapterSeriesIds: jest.fn().mockResolvedValue(new Set<string>()),
      findSeriesOwnershipByIds: jest.fn().mockResolvedValue([]),
      findBoardMemberIds: jest.fn().mockResolvedValue([]),
      // Fix-1 G-2
      findLatestOpenSurveyPeriod: jest.fn().mockResolvedValue(null),
      findLatestReflectedPeriod: jest.fn().mockResolvedValue(null),
      findReflectedPeriods: jest.fn().mockResolvedValue([]),
      findManySerializedSeriesPublic: jest.fn().mockResolvedValue([]),
      findSeriesTitlesByIds: jest.fn().mockResolvedValue([])
    },
    authOtpService: { sendOTPService: jest.fn(), validateOtpCode: jest.fn(), burnOtp: jest.fn() },
    identityHashService: identityHash,
    rateLimitService: { checkAndConsume: jest.fn().mockResolvedValue({ allowed: true }) },
    domainEventBus: { emit: jest.fn() },
    notificationService: { notifySafe: jest.fn().mockResolvedValue(undefined) },
    surveyConfigService: {
      get: jest.fn().mockResolvedValue({
        maxSeriesPerVote: 3,
        captchaThreshold: 0.3,
        phoneRateLimit: 3,
        ipRateLimit: 10,
        otpCooldownSeconds: 60,
        ipVotesPerPeriod: 10
      })
    },
    appConfigService: {
      get: jest.fn().mockResolvedValue({
        lowVoteReliabilityThreshold: 10,
        hiatusTooLongDays: 30
      })
    },
    auditService: { record: jest.fn().mockResolvedValue(undefined) },
    recaptchaService: {
      verify: jest.fn().mockResolvedValue({ ok: true, score: null, degraded: false })
    },
    redisService: {
      incrWithTtl: jest.fn().mockResolvedValue(1),
      decrSafe: jest.fn().mockResolvedValue(undefined)
    }
  }
}

function makeService(m: Mocks) {
  return new SurveyService(
    m.surveyRepository as never,
    m.authOtpService as never,
    m.identityHashService,
    m.rateLimitService as never,
    m.domainEventBus as never,
    m.notificationService as never,
    m.surveyConfigService as never,
    m.appConfigService as never,
    m.auditService as never,
    m.recaptchaService as never,
    m.redisService as never,
    asCacheService(makeCacheServiceMock())
  )
}

describe('SurveyService.finalizeRanking — RankingFinalized event payload (B-VOT-07/§4.2)', () => {
  it('emits RankingFinalized with rankings[] sorted by score (rank = index+1)', async () => {
    const m = makeMocks()

    m.surveyRepository.findSurveyPeriodById.mockResolvedValue({ id: '507f1f77bcf86cd799439011', status: 'CLOSED' })

    m.surveyRepository.getSurveyDataByPeriod.mockResolvedValue([])

    // Two reader votes give two different series weighted scores.
    m.surveyRepository.getReaderVotesByPeriod.mockResolvedValue([
      { seriesIds: ['sA'], voteWeight: 5 },
      { seriesIds: ['sB'], voteWeight: 1 }
    ])

    m.surveyRepository.findPreviousSurveyPeriod.mockResolvedValue(null)
    // Add enough chapters so sA/sB are not excluded (< 8 chapters)
    m.surveyRepository.countPublishedChaptersBySeriesIds.mockResolvedValue(
      new Map([
        ['sA', 20],
        ['sB', 20]
      ])
    )
    m.surveyRepository.findSeriesOwnershipByIds.mockResolvedValue([
      { id: 'sA', status: 'SERIALIZED', mangakaId: 'mA', editorId: null },
      { id: 'sB', status: 'SERIALIZED', mangakaId: 'mB', editorId: null }
    ])

    await makeService(m).finalizeRanking('507f1f77bcf86cd799439011')

    // Expect emit was called with DomainEvent.RankingFinalized and a rankings array
    // sorted descending by score. seriesId of highest score must be at rank 1.
    const emitCalls = m.domainEventBus.emit.mock.calls.filter(
      ([eventName]: [string, unknown]) => eventName === DomainEvent.RankingFinalized
    )
    expect(emitCalls).toHaveLength(1)

    const [, payload] = emitCalls[0]
    expect(payload).toMatchObject({ surveyPeriodId: '507f1f77bcf86cd799439011' })
    expect(payload.rankings).toEqual([
      { seriesId: 'sA', rank: 1 },
      { seriesId: 'sB', rank: 2 }
    ])
  })

  it('emits an empty rankings array when no votes/data exist', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue({ id: '507f1f77bcf86cd799439012', status: 'CLOSED' })
    m.surveyRepository.getSurveyDataByPeriod.mockResolvedValue([])
    m.surveyRepository.getReaderVotesByPeriod.mockResolvedValue([])
    m.surveyRepository.findPreviousSurveyPeriod.mockResolvedValue(null)

    await makeService(m).finalizeRanking('507f1f77bcf86cd799439012')

    const emitCalls = m.domainEventBus.emit.mock.calls.filter(
      ([eventName]: [string, unknown]) => eventName === DomainEvent.RankingFinalized
    )
    expect(emitCalls).toHaveLength(1)
    const [, payload] = emitCalls[0]
    expect(payload.surveyPeriodId).toBe('507f1f77bcf86cd799439012')
    expect(payload.rankings).toEqual([])
  })
})

describe('SurveyService.submitVote — deterministic identity hashing (B-VOT-03) + config consume (B-VOT-06)', () => {
  const OPEN_PERIOD = { id: '507f1f77bcf86cd799439011', status: 'OPEN' }
  const SERIES_A = '507f1f77bcf86cd799439021'
  const SERIES_B = '507f1f77bcf86cd799439022'
  const VOTE_BODY = {
    surveyPeriodId: '507f1f77bcf86cd799439011',
    seriesIds: [SERIES_A],
    identity: 'reader@example.com',
    otpCode: '123456',
    captchaToken: 'tok'
  }
  const IP = '203.0.113.9'
  const serializedOwnership = (ids: string[]) =>
    ids.map((id) => ({ id, status: 'SERIALIZED', mangakaId: 'm', editorId: null }))

  it('uses HMAC identityHash for BOTH the dedup lookup and the stored vote (so one identity = one vote/period)', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue(OPEN_PERIOD)
    m.surveyRepository.findSeriesOwnershipByIds.mockResolvedValue(serializedOwnership([SERIES_A]))
    m.surveyRepository.findReaderVoteByPeriodAndIdentity.mockResolvedValue(null)

    await makeService(m).submitVote(VOTE_BODY, IP)

    const expectedIdentityHash = identityHash.hash(VOTE_BODY.identity)
    const expectedIpHash = identityHash.hash(IP)

    // dedup lookup keyed by the deterministic hash
    expect(m.surveyRepository.findReaderVoteByPeriodAndIdentity).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expectedIdentityHash
    )
    // stored vote carries the SAME deterministic hash (unique constraint can now catch repeats)
    expect(m.surveyRepository.createReaderVote).toHaveBeenCalledWith(
      expect.objectContaining({ identityHash: expectedIdentityHash, ipHash: expectedIpHash })
    )
  })

  it('rejects a second vote from the same identity in the same period (dedup hit)', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue(OPEN_PERIOD)
    m.surveyRepository.findSeriesOwnershipByIds.mockResolvedValue(serializedOwnership([SERIES_A]))
    m.surveyRepository.findReaderVoteByPeriodAndIdentity.mockResolvedValue({ id: 'existing' })

    await expect(makeService(m).submitVote(VOTE_BODY as never, IP)).rejects.toBeDefined()
    expect(m.surveyRepository.createReaderVote).not.toHaveBeenCalled()
  })

  it('rejects when seriesIds exceeds config.maxSeriesPerVote (dynamic)', async () => {
    const m = makeMocks()
    m.surveyConfigService.get.mockResolvedValue({
      maxSeriesPerVote: 1,
      captchaThreshold: 0.3,
      phoneRateLimit: 3,
      ipRateLimit: 10
    })
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue(OPEN_PERIOD)
    m.surveyRepository.findReaderVoteByPeriodAndIdentity.mockResolvedValue(null)

    await expect(
      makeService(m).submitVote(
        {
          surveyPeriodId: '507f1f77bcf86cd799439011',
          seriesIds: ['sA', 'sB'],
          identity: 'reader@example.com',
          otpCode: '123456',
          captchaToken: 'tok'
        },
        '1.1.1.1'
      )
    ).rejects.toBeDefined()
    expect(m.surveyRepository.createReaderVote).not.toHaveBeenCalled()
  })

  // PB-03 (6): seriesIds không trùng + mọi series phải SERIALIZED — validate TRƯỚC khi đụng OTP.
  it('rejects duplicate seriesIds in one ballot (422, OTP untouched)', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue(OPEN_PERIOD)
    await expect(
      makeService(m).submitVote({ ...VOTE_BODY, seriesIds: [SERIES_A, SERIES_A] }, IP)
    ).rejects.toMatchObject({ status: 422 })
    expect(m.surveyRepository.findSeriesOwnershipByIds).not.toHaveBeenCalled()
    expect(m.authOtpService.validateOtpCode).not.toHaveBeenCalled()
    expect(m.surveyRepository.createReaderVote).not.toHaveBeenCalled()
  })

  it('rejects malformed (non-24-hex) seriesId with 422 — never reaches Prisma (no P2023/500)', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue(OPEN_PERIOD)
    await expect(makeService(m).submitVote({ ...VOTE_BODY, seriesIds: ['garbage'] }, IP)).rejects.toMatchObject({
      status: 422
    })
    expect(m.surveyRepository.findSeriesOwnershipByIds).not.toHaveBeenCalled()
    expect(m.authOtpService.validateOtpCode).not.toHaveBeenCalled()
  })

  it('rejects vote for a series that is not SERIALIZED (422, OTP not burned)', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue(OPEN_PERIOD)
    m.surveyRepository.findSeriesOwnershipByIds.mockResolvedValue([
      { id: SERIES_A, status: 'SERIALIZED', mangakaId: 'm', editorId: null },
      { id: SERIES_B, status: 'DRAFT', mangakaId: 'm', editorId: null }
    ])
    await expect(
      makeService(m).submitVote({ ...VOTE_BODY, seriesIds: [SERIES_A, SERIES_B] }, IP)
    ).rejects.toMatchObject({ status: 422 })
    expect(m.authOtpService.validateOtpCode).not.toHaveBeenCalled()
    expect(m.authOtpService.burnOtp).not.toHaveBeenCalled()
    expect(m.surveyRepository.createReaderVote).not.toHaveBeenCalled()
  })
})

describe('SurveyService.finalizeRanking — at-risk tiering + exclusion + reliability (B-VOT-05/07)', () => {
  const CLOSED = { id: '507f1f77bcf86cd799439011', status: 'CLOSED' }

  function threeSeriesVotes() {
    // sA=3, sB=2, sC=1 → ranks 1,2,3; N=3, bottom ceil(3/3)=1 → chỉ sC at-risk (nếu không loại trừ).
    return [
      { seriesIds: ['sA'], voteWeight: 3 },
      { seriesIds: ['sB'], voteWeight: 2 },
      { seriesIds: ['sC'], voteWeight: 1 }
    ]
  }

  it('excludes series with < 8 published chapters and HIATUS series from at-risk', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue(CLOSED)
    m.surveyRepository.getReaderVotesByPeriod.mockResolvedValue(threeSeriesVotes())
    // sC bottom nhưng chỉ 3 chương PUBLISHED → loại trừ (< 8).
    m.surveyRepository.countPublishedChaptersBySeriesIds.mockResolvedValue(
      new Map([
        ['sA', 20],
        ['sB', 20],
        ['sC', 3]
      ])
    )
    m.surveyRepository.findSeriesOwnershipByIds.mockResolvedValue([
      { id: 'sA', status: 'SERIALIZED', mangakaId: 'mA', editorId: 'eA' },
      { id: 'sB', status: 'SERIALIZED', mangakaId: 'mB', editorId: null },
      { id: 'sC', status: 'SERIALIZED', mangakaId: 'mC', editorId: null }
    ])

    await makeService(m).finalizeRanking('507f1f77bcf86cd799439011')

    const calls = (m.surveyRepository.createRankingRecord.mock.calls as unknown[][]).map(
      ([a]) => a as Record<string, unknown>
    )
    const sC = calls.find((c) => c.seriesId === 'sC') as Record<string, unknown>
    expect(sC.isAtRisk).toBe(false)
    expect(sC.riskLevel).toBe('NONE')
    expect(sC.consecutiveAtRiskCount).toBe(0)
  })

  it('tiers a qualifying at-risk series to SEVERE after 5 consecutive periods', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue(CLOSED)
    m.surveyRepository.getReaderVotesByPeriod.mockResolvedValue(threeSeriesVotes())
    m.surveyRepository.countPublishedChaptersBySeriesIds.mockResolvedValue(
      new Map([
        ['sA', 20],
        ['sB', 20],
        ['sC', 20]
      ])
    )
    m.surveyRepository.findSeriesOwnershipByIds.mockResolvedValue([
      { id: 'sA', status: 'SERIALIZED', mangakaId: 'mA', editorId: null },
      { id: 'sB', status: 'SERIALIZED', mangakaId: 'mB', editorId: null },
      { id: 'sC', status: 'SERIALIZED', mangakaId: 'mC', editorId: null }
    ])
    // previous period: sC đã at-risk 4 kỳ liên tiếp.
    m.surveyRepository.findPreviousSurveyPeriod.mockResolvedValue({ id: '507f1f77bcf86cd799439010' })
    m.surveyRepository.getRankingRecordsByPeriod.mockResolvedValue([
      { seriesId: 'sC', rankPosition: 3, consecutiveAtRiskCount: 4 }
    ])

    await makeService(m).finalizeRanking('507f1f77bcf86cd799439011')

    const sC = (m.surveyRepository.createRankingRecord.mock.calls as unknown[][])
      .map(([a]) => a as Record<string, unknown>)
      .find((c) => c.seriesId === 'sC') as Record<string, unknown>
    expect(sC.isAtRisk).toBe(true)
    expect(sC.consecutiveAtRiskCount).toBe(5)
    expect(sC.riskLevel).toBe('SEVERE')
  })

  it('marks ALL records isReliable=false when period total < lowVoteReliabilityThreshold', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue(CLOSED)
    m.surveyRepository.getReaderVotesByPeriod.mockResolvedValue([{ seriesIds: ['sA'], voteWeight: 1 }]) // total=1 < 10
    m.surveyRepository.countPublishedChaptersBySeriesIds.mockResolvedValue(new Map([['sA', 20]]))
    m.surveyRepository.findSeriesOwnershipByIds.mockResolvedValue([
      { id: 'sA', status: 'SERIALIZED', mangakaId: 'mA', editorId: null }
    ])

    await makeService(m).finalizeRanking('507f1f77bcf86cd799439011')

    const sA = (m.surveyRepository.createRankingRecord.mock.calls as unknown[][])
      .map(([a]) => a as Record<string, unknown>)
      .find((c) => c.seriesId === 'sA') as Record<string, unknown>
    expect(sA.isReliable).toBe(false)
    // low-data → không notify (B-VOT-05)
    expect(m.notificationService.notifySafe).not.toHaveBeenCalled()
  })

  it('marks a series isReliable=false when it has a long-held chapter', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue(CLOSED)
    m.surveyRepository.getReaderVotesByPeriod.mockResolvedValue(threeSeriesVotes()) // total=6
    // Set threshold to 1 so the period total is above it; test the per-series held-chapter path only.
    m.appConfigService.get.mockResolvedValue({ lowVoteReliabilityThreshold: 1, hiatusTooLongDays: 30 })
    m.surveyRepository.countPublishedChaptersBySeriesIds.mockResolvedValue(
      new Map([
        ['sA', 20],
        ['sB', 20],
        ['sC', 20]
      ])
    )
    m.surveyRepository.findSeriesOwnershipByIds.mockResolvedValue([
      { id: 'sA', status: 'SERIALIZED', mangakaId: 'mA', editorId: null },
      { id: 'sB', status: 'SERIALIZED', mangakaId: 'mB', editorId: null },
      { id: 'sC', status: 'SERIALIZED', mangakaId: 'mC', editorId: null }
    ])
    m.surveyRepository.findHeldChapterSeriesIds.mockResolvedValue(new Set(['sB']))

    await makeService(m).finalizeRanking('507f1f77bcf86cd799439011')

    const calls = (m.surveyRepository.createRankingRecord.mock.calls as unknown[][]).map(
      ([a]) => a as Record<string, unknown>
    )
    expect((calls.find((c) => c.seriesId === 'sB') as Record<string, unknown>).isReliable).toBe(false)
    expect((calls.find((c) => c.seriesId === 'sA') as Record<string, unknown>).isReliable).toBe(true)
  })

  it('resets consecutiveAtRiskCount when a series is excluded (HIATUS) mid-streak', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue(CLOSED)
    m.surveyRepository.getReaderVotesByPeriod.mockResolvedValue(threeSeriesVotes())
    m.surveyRepository.countPublishedChaptersBySeriesIds.mockResolvedValue(
      new Map([
        ['sA', 20],
        ['sB', 20],
        ['sC', 20]
      ])
    )
    // sC ở vị trí bottom nhưng HIATUS → loại trừ → count reset về 0.
    m.surveyRepository.findSeriesOwnershipByIds.mockResolvedValue([
      { id: 'sA', status: 'SERIALIZED', mangakaId: 'mA', editorId: null },
      { id: 'sB', status: 'SERIALIZED', mangakaId: 'mB', editorId: null },
      { id: 'sC', status: 'HIATUS', mangakaId: 'mC', editorId: null }
    ])
    m.surveyRepository.findPreviousSurveyPeriod.mockResolvedValue({ id: '507f1f77bcf86cd799439010' })
    // sC previous kỳ đang MEDIUM (3 kỳ liên tiếp) → kỳ này loại trừ → reset.
    m.surveyRepository.getRankingRecordsByPeriod.mockResolvedValue([
      { seriesId: 'sC', rankPosition: 3, consecutiveAtRiskCount: 3 }
    ])

    await makeService(m).finalizeRanking('507f1f77bcf86cd799439011')

    const sC = (m.surveyRepository.createRankingRecord.mock.calls as unknown[][])
      .map(([a]) => a as Record<string, unknown>)
      .find((c) => c.seriesId === 'sC') as Record<string, unknown>
    expect(sC.isAtRisk).toBe(false)
    expect(sC.riskLevel).toBe('NONE')
    expect(sC.consecutiveAtRiskCount).toBe(0)
  })
})

describe('SurveyService.finalizeRanking — notifications (B-VOT-05 AC5)', () => {
  it('notifies at-risk mangaka + assigned editor, and sends a SEVERE digest to board members', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue({ id: '507f1f77bcf86cd799439011', status: 'CLOSED' })
    m.surveyRepository.getReaderVotesByPeriod.mockResolvedValue([
      { seriesIds: ['sA'], voteWeight: 30 },
      { seriesIds: ['sB'], voteWeight: 20 },
      { seriesIds: ['sC'], voteWeight: 10 }
    ])
    m.surveyRepository.countPublishedChaptersBySeriesIds.mockResolvedValue(
      new Map([
        ['sA', 20],
        ['sB', 20],
        ['sC', 20]
      ])
    )
    m.surveyRepository.findSeriesOwnershipByIds.mockResolvedValue([
      { id: 'sA', status: 'SERIALIZED', mangakaId: 'mA', editorId: 'eA' },
      { id: 'sB', status: 'SERIALIZED', mangakaId: 'mB', editorId: 'eB' },
      { id: 'sC', status: 'SERIALIZED', mangakaId: 'mC', editorId: 'eC' }
    ])
    // sC at-risk 4 kỳ trước → kỳ này 5 → SEVERE.
    m.surveyRepository.findPreviousSurveyPeriod.mockResolvedValue({ id: '507f1f77bcf86cd799439010' })
    m.surveyRepository.getRankingRecordsByPeriod.mockResolvedValue([
      { seriesId: 'sC', rankPosition: 3, consecutiveAtRiskCount: 4 }
    ])
    m.surveyRepository.findBoardMemberIds.mockResolvedValue(['b1', 'b2'])

    await makeService(m).finalizeRanking('507f1f77bcf86cd799439011')

    const recips = (m.notificationService.notifySafe.mock.calls as unknown[][]).map(
      ([a]) => (a as { recipientId: string }).recipientId
    )
    expect(recips).toEqual(expect.arrayContaining(['mC', 'eC', 'b1', 'b2'])) // at-risk mangaka + editor + board digest
    // series không at-risk KHÔNG bị cảnh báo
    expect(recips).not.toContain('mA')
  })
})

describe('SurveyService — OBJECT_ID_RE guard for :id routes (Spec 5 §7)', () => {
  it.each([
    ['getSurveyPeriodById', 'not-an-objectid'],
    ['getSurveyPeriodVotes', 'not-an-objectid'],
    ['getSurveyPeriodSurveyData', 'not-an-objectid'],
    ['updateSurveyPeriodStatus', 'not-an-objectid'],
    ['finalizeRanking', 'not-an-objectid'],
    ['getRankingRecords', 'not-an-objectid']
  ])('%s rejects malformed id with NotFound (no 500)', async (method, id) => {
    const m = makeMocks()
    const svc = makeService(m) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>
    if (method === 'updateSurveyPeriodStatus') {
      await expect(svc[method](id, { status: 'CLOSED' }, 'uid')).rejects.toBeDefined()
    } else if (method === 'finalizeRanking') {
      await expect(svc[method](id, 'uid')).rejects.toBeDefined()
    } else {
      await expect(svc[method](id)).rejects.toBeDefined()
    }
    // Critical: NO Prisma call when id is malformed (would otherwise yield P2023 → 500).
    expect(m.surveyRepository.findSurveyPeriodById).not.toHaveBeenCalled()
  })
})

describe('SurveyService.getSeriesTrend — PB-04 scoping', () => {
  const VALID_ID = '507f1f77bcf86cd799439011'

  it('denies a mangaka viewing a series they do not own', async () => {
    const m = makeMocks()
    m.surveyRepository.findSeriesOwnershipByIds.mockResolvedValue([
      { id: VALID_ID, status: 'SERIALIZED', mangakaId: 'other', editorId: null }
    ])
    await expect(
      makeService(m).getSeriesTrend(VALID_ID, 12, { userId: 'me', roleName: 'MANGAKA' })
    ).rejects.toBeDefined()
  })

  it('returns trend records for the owner mangaka', async () => {
    const m = makeMocks()
    m.surveyRepository.findSeriesOwnershipByIds.mockResolvedValue([
      { id: VALID_ID, status: 'SERIALIZED', mangakaId: 'me', editorId: null }
    ])
    m.surveyRepository.getRankingRecordsBySeries = jest.fn().mockResolvedValue([
      {
        seriesId: VALID_ID,
        rankPosition: 2,
        voteCount: 5,
        previousRank: 3,
        rankChange: 1,
        isAtRisk: false,
        riskLevel: 'NONE',
        isReliable: true,
        recordedAt: new Date()
      }
    ])
    const res = await makeService(m).getSeriesTrend(VALID_ID, 12, { userId: 'me', roleName: 'MANGAKA' })
    expect(res.items).toHaveLength(1)
    expect(res.items[0].riskLevel).toBe('NONE')
  })

  it('returns 404 for malformed seriesId (OBJECT_ID_RE guard)', async () => {
    const m = makeMocks()
    await expect(
      makeService(m).getSeriesTrend('not-an-objectid', 12, { userId: 'admin', roleName: 'SUPER_ADMIN' })
    ).rejects.toBeDefined()
  })
})

describe('SurveyService.getVoteContext (Fix-1 G-2)', () => {
  const P = '507f1f77bcf86cd799439011'

  it('returns latest OPEN period + serialized series + maxSeriesPerVote', async () => {
    const m = makeMocks()
    m.surveyRepository.findLatestOpenSurveyPeriod = jest.fn().mockResolvedValue({
      id: P,
      issueNumber: 12,
      reflectedIssueNumber: 10,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-15T00:00:00.000Z'),
      status: 'OPEN'
    })
    m.surveyRepository.findManySerializedSeriesPublic = jest
      .fn()
      .mockResolvedValue([{ id: 'ser1', title: 'One', coverImage: null, genres: ['ACTION'], demographic: 'SHONEN' }])
    const out = await makeService(m).getVoteContext()
    expect(out.period).toMatchObject({
      id: P,
      issueNumber: 12,
      reflectedIssueNumber: 10,
      startDate: '2026-07-01T00:00:00.000Z',
      endDate: '2026-07-15T00:00:00.000Z'
    })
    expect(out.series).toEqual([
      { id: 'ser1', title: 'One', coverImage: null, genres: ['ACTION'], demographic: 'SHONEN' }
    ])
    expect(out.maxSeriesPerVote).toBe(3)
  })

  it('no OPEN period → period null + series rỗng, vẫn 200-shape, KHÔNG gọi series query', async () => {
    const m = makeMocks()
    m.surveyRepository.findLatestOpenSurveyPeriod = jest.fn().mockResolvedValue(null)
    m.surveyRepository.findManySerializedSeriesPublic = jest.fn()
    const out = await makeService(m).getVoteContext()
    expect(out).toEqual({ period: null, series: [], maxSeriesPerVote: 3 })
    expect(m.surveyRepository.findManySerializedSeriesPublic).not.toHaveBeenCalled()
  })
})

describe('SurveyService.getVoteResults (Fix-1 G-2)', () => {
  const P = '507f1f77bcf86cd799439011'
  const S1 = '507f1f77bcf86cd799439021'
  const S2 = '507f1f77bcf86cd799439022'

  it('id rác → 404 (OBJECT_ID_RE guard)', async () => {
    const m = makeMocks()
    await expect(makeService(m).getVoteResults('garbage')).rejects.toMatchObject({ status: 404 })
    expect(m.surveyRepository.findSurveyPeriodById).not.toHaveBeenCalled()
  })

  it('period không tồn tại → 404', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue(null)
    await expect(makeService(m).getVoteResults(P)).rejects.toMatchObject({ status: 404 })
  })

  it('period còn OPEN → 409 SurveyPeriodNotFinalized', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue({ id: P, status: 'OPEN', issueNumber: 12 })
    await expect(makeService(m).getVoteResults(P)).rejects.toMatchObject({ status: 409 })
  })

  it('period REFLECTED → ranked results với title, KHÔNG lộ field nội bộ', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue({ id: P, status: 'REFLECTED', issueNumber: 12 })
    m.surveyRepository.getRankingRecordsByPeriod = jest.fn().mockResolvedValue([
      {
        seriesId: S1,
        rankPosition: 1,
        voteCount: 10.5,
        rankChange: 2,
        isAtRisk: true,
        riskLevel: 'SEVERE',
        isReliable: false
      },
      {
        seriesId: S2,
        rankPosition: 2,
        voteCount: 3,
        rankChange: null,
        isAtRisk: false,
        riskLevel: 'NONE',
        isReliable: true
      }
    ])
    m.surveyRepository.findSeriesTitlesByIds = jest
      .fn()
      .mockResolvedValue([{ id: S1, title: 'One', publicationType: 'WEEKLY' }])
    const out = await makeService(m).getVoteResults(P)
    expect(out.surveyPeriodId).toBe(P)
    expect(out.issueNumber).toBe(12)
    expect(out.results).toEqual([
      { rankPosition: 1, seriesId: S1, seriesTitle: 'One', publicationType: 'WEEKLY', voteCount: 10.5, rankChange: 2 },
      { rankPosition: 2, seriesId: S2, seriesTitle: null, publicationType: null, voteCount: 3, rankChange: null }
    ])
    const serialized = JSON.stringify(out)
    expect(serialized).not.toContain('riskLevel')
    expect(serialized).not.toContain('isAtRisk')
    expect(serialized).not.toContain('isReliable')
    expect(serialized).not.toContain('SEVERE')
  })
})

describe('SurveyService captcha verification (Spec 15 Part C)', () => {
  const PERIOD_ID = '507f1f77bcf86cd799439011'
  const SERIES_ID = '507f1f77bcf86cd799439021'
  const IP = '1.1.1.1'
  const validVoteBody = {
    surveyPeriodId: PERIOD_ID,
    identity: 'reader@example.com',
    otpCode: '123456',
    seriesIds: [SERIES_ID],
    captchaToken: 'tok'
  }

  function primeVote(m: Mocks) {
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue({ id: PERIOD_ID, status: 'OPEN' })
    m.surveyRepository.findSeriesOwnershipByIds.mockResolvedValue([{ id: SERIES_ID, status: 'SERIALIZED' }])
    m.surveyRepository.findReaderVoteByPeriodAndIdentity.mockResolvedValue(null)
  }

  it('requestOtp: captcha ok=false → 403 và không gửi OTP', async () => {
    const m = makeMocks()
    m.recaptchaService.verify.mockResolvedValue({ ok: false, score: null, degraded: false })

    await expect(makeService(m).requestOtp({ identity: 'r@x.com', captchaToken: 'bad' }, IP)).rejects.toBe(
      CaptchaRejectedException
    )

    expect(m.recaptchaService.verify).toHaveBeenCalledWith('bad', IP)
    expect(m.authOtpService.sendOTPService).not.toHaveBeenCalled()
  })

  it('requestOtp: score dưới threshold → 403 và không gửi OTP', async () => {
    const m = makeMocks()
    m.recaptchaService.verify.mockResolvedValue({ ok: true, score: 0.1, degraded: false })

    await expect(makeService(m).requestOtp({ identity: 'r@x.com', captchaToken: 'tok' }, IP)).rejects.toBe(
      CaptchaRejectedException
    )

    expect(m.authOtpService.sendOTPService).not.toHaveBeenCalled()
  })

  it('requestOtp: score=null dev/degraded → gửi OTP bình thường', async () => {
    const m = makeMocks()
    m.recaptchaService.verify.mockResolvedValue({ ok: true, score: null, degraded: true })

    await expect(makeService(m).requestOtp({ identity: 'r@x.com', captchaToken: 'tok' }, IP)).resolves.toBeDefined()

    expect(m.authOtpService.sendOTPService).toHaveBeenCalled()
  })

  it('requestOtp: IP rate-limit chặn trước captcha', async () => {
    const m = makeMocks()
    m.rateLimitService.checkAndConsume
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfter: 30 })

    await expect(makeService(m).requestOtp({ identity: 'r@x.com', captchaToken: 'tok' }, IP)).rejects.toMatchObject({
      status: 429
    })

    expect(m.recaptchaService.verify).not.toHaveBeenCalled()
    expect(m.authOtpService.sendOTPService).not.toHaveBeenCalled()
  })

  it('submitVote: ok=false → 403 sau IP-limit nhưng trước validate/burn OTP', async () => {
    const m = makeMocks()
    primeVote(m)
    m.recaptchaService.verify.mockResolvedValue({ ok: false, score: null, degraded: false })

    await expect(makeService(m).submitVote(validVoteBody, IP)).rejects.toBe(CaptchaRejectedException)

    expect(m.surveyRepository.countReaderVotesByPeriodAndIp).toHaveBeenCalled()
    expect(m.recaptchaService.verify).toHaveBeenCalledWith('tok', IP)
    expect(m.authOtpService.validateOtpCode).not.toHaveBeenCalled()
    expect(m.authOtpService.burnOtp).not.toHaveBeenCalled()
    expect(m.surveyRepository.createReaderVote).not.toHaveBeenCalled()
  })

  it('submitVote: IP cap chặn trước captcha và OTP', async () => {
    const m = makeMocks()
    primeVote(m)
    m.surveyRepository.countReaderVotesByPeriodAndIp.mockResolvedValue(10)

    await expect(makeService(m).submitVote(validVoteBody, IP)).rejects.toMatchObject({ status: 429 })

    expect(m.recaptchaService.verify).not.toHaveBeenCalled()
    expect(m.authOtpService.validateOtpCode).not.toHaveBeenCalled()
    expect(m.authOtpService.burnOtp).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'score thấp',
      captcha: { ok: true, score: 0.1, degraded: false },
      expected: { voteWeight: 0.5, isFlagged: true, captchaScore: 0.1 }
    },
    {
      name: 'score cao',
      captcha: { ok: true, score: 0.9, degraded: false },
      expected: { voteWeight: 1, isFlagged: false, captchaScore: 0.9 }
    },
    {
      name: 'Google degraded',
      captcha: { ok: true, score: null, degraded: true },
      expected: { voteWeight: 1, isFlagged: true, captchaScore: null }
    },
    {
      name: 'dev-mode',
      captcha: { ok: true, score: null, degraded: false },
      expected: { voteWeight: 1, isFlagged: false, captchaScore: null }
    }
  ])('submitVote: $name → lưu đúng score/weight/flag', async ({ captcha, expected }) => {
    const m = makeMocks()
    primeVote(m)
    m.recaptchaService.verify.mockResolvedValue(captcha)

    await makeService(m).submitVote(validVoteBody, IP)

    expect(m.surveyRepository.createReaderVote).toHaveBeenCalledWith(expect.objectContaining(expected))
  })
})

describe('SurveyService public ranking discovery (Spec 15 Part B)', () => {
  it('không có kỳ REFLECTED → {period:null, results:[]}, KHÔNG 404', async () => {
    const m = makeMocks()
    m.surveyRepository.findLatestReflectedPeriod.mockResolvedValue(null)

    await expect(makeService(m).getLatestVoteResults()).resolves.toEqual({ period: null, results: [] })
  })

  it('có kỳ → period map ISO + results tái dùng getVoteResults theo id kỳ đó', async () => {
    const m = makeMocks()
    m.surveyRepository.findLatestReflectedPeriod.mockResolvedValue({
      id: 'p1',
      issueNumber: 7,
      reflectedIssueNumber: 5,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-08T00:00:00.000Z'),
      status: 'REFLECTED'
    })
    const service = makeService(m)
    const spy = jest.spyOn(service, 'getVoteResults').mockResolvedValue({
      surveyPeriodId: 'p1',
      issueNumber: 7,
      results: [
        { rankPosition: 1, seriesId: 's1', seriesTitle: 'T', publicationType: null, voteCount: 3, rankChange: null }
      ]
    })

    const result = await service.getLatestVoteResults()

    expect(spy).toHaveBeenCalledWith('p1', undefined)
    expect(result.period).toEqual({
      id: 'p1',
      issueNumber: 7,
      reflectedIssueNumber: 5,
      startDate: '2026-07-01T00:00:00.000Z',
      endDate: '2026-07-08T00:00:00.000Z'
    })
    expect(result.results).toHaveLength(1)
  })

  it('danh sách kỳ map ISO + null-safe và truyền limit xuống repository', async () => {
    const m = makeMocks()
    m.surveyRepository.findReflectedPeriods.mockResolvedValue([
      {
        id: 'p1',
        issueNumber: 7,
        reflectedIssueNumber: null,
        startDate: null,
        endDate: new Date('2026-07-08T00:00:00.000Z')
      }
    ])

    const result = await makeService(m).getReflectedPeriods(5)

    expect(m.surveyRepository.findReflectedPeriods).toHaveBeenCalledWith(5)
    expect(result.items).toEqual([
      {
        id: 'p1',
        issueNumber: 7,
        reflectedIssueNumber: null,
        startDate: null,
        endDate: '2026-07-08T00:00:00.000Z'
      }
    ])
  })
})

describe('Fix-2 G-5 - identity semantics', () => {
  const PERIOD_ID = '507f1f77bcf86cd799439011'
  const SERIES_ID = '507f1f77bcf86cd799439021'

  it('schemas accept identity email and reject the legacy identity-field body', () => {
    const legacyField = ['phone', 'Number'].join('')
    expect(VoteOtpRequestBodySchema.safeParse({ identity: 'reader@example.com', captchaToken: 'tok' }).success).toBe(
      true
    )
    expect(VoteOtpRequestBodySchema.safeParse({ [legacyField]: '+84900000000', captchaToken: 'tok' }).success).toBe(
      false
    )
    expect(
      ReaderVoteBodySchema.safeParse({
        surveyPeriodId: PERIOD_ID,
        identity: 'reader@example.com',
        otpCode: '123456',
        seriesIds: [SERIES_ID],
        captchaToken: 'tok'
      }).success
    ).toBe(true)
    expect(
      ReaderVoteBodySchema.safeParse({
        surveyPeriodId: PERIOD_ID,
        identity: 'reader@example.com',
        otpCode: '123456',
        seriesIds: [SERIES_ID]
      }).success
    ).toBe(false)
    expect(
      ReaderVoteBodySchema.safeParse({
        surveyPeriodId: PERIOD_ID,
        identity: 'reader@example.com',
        otpCode: '123456',
        seriesIds: [SERIES_ID],
        captchaScore: 0.9
      }).success
    ).toBe(false)
  })

  it('requestOtp sends OTP to the identity email', async () => {
    const m = makeMocks()
    const svc = makeService(m)

    await svc.requestOtp({ identity: 'reader@example.com', captchaToken: 'tok' }, '1.2.3.4')

    expect(m.authOtpService.sendOTPService).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'reader@example.com' })
    )
    expect(m.rateLimitService.checkAndConsume).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'survey:otp:identity:reader@example.com' })
    )
  })

  it('submitVote stores authMethod=EMAIL_OTP and validates OTP against identity', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue({ id: PERIOD_ID, status: 'OPEN' })
    m.surveyRepository.findSeriesOwnershipByIds.mockResolvedValue([{ id: SERIES_ID, status: 'SERIALIZED' }])
    m.surveyRepository.findReaderVoteByPeriodAndIdentity.mockResolvedValue(null)

    await makeService(m).submitVote(
      {
        surveyPeriodId: PERIOD_ID,
        identity: 'reader@example.com',
        otpCode: '123456',
        seriesIds: [SERIES_ID],
        captchaToken: 'tok'
      },
      '1.2.3.4'
    )

    expect(m.surveyRepository.createReaderVote).toHaveBeenCalledWith(
      expect.objectContaining({ authMethod: 'EMAIL_OTP' })
    )
    expect(m.authOtpService.validateOtpCode).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'reader@example.com' })
    )
    expect(m.authOtpService.burnOtp).toHaveBeenCalledWith('reader@example.com', expect.anything())
  })
})

describe('Fix-2 G-4a - OTP cooldown', () => {
  it('requestOtp passes cooldownSec from VotingConfig', async () => {
    const m = makeMocks()
    m.surveyConfigService.get.mockResolvedValue({
      maxSeriesPerVote: 3,
      captchaThreshold: 0.3,
      phoneRateLimit: 3,
      ipRateLimit: 10,
      otpCooldownSeconds: 45,
      ipVotesPerPeriod: 10
    })

    await makeService(m).requestOtp({ identity: 'r@example.com', captchaToken: 't' }, '1.2.3.4')

    expect(m.rateLimitService.checkAndConsume).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'survey:otp:identity:r@example.com', max: 3, cooldownSec: 45 })
    )
  })

  it('cooldown or quota hit returns 429 with retryAfter metadata', async () => {
    const m = makeMocks()
    m.rateLimitService.checkAndConsume.mockResolvedValue({
      allowed: false,
      reason: 'COOLDOWN',
      retryAfter: 42
    })

    await expect(
      makeService(m).requestOtp({ identity: 'r@example.com', captchaToken: 't' }, '1.2.3.4')
    ).rejects.toMatchObject({
      status: 429,
      response: expect.objectContaining({ message: 'Error.VoteOtpRateLimit', retryAfter: 42 })
    })
    expect(m.authOtpService.sendOTPService).not.toHaveBeenCalled()
  })
})

describe('SurveyService — ObjectId guard cho id lấy từ BODY (Spec 11 §1.1)', () => {
  it('submitVote: surveyPeriodId rác → 404, KHÔNG chạm repo', async () => {
    const m = makeMocks()
    await expect(
      makeService(m).submitVote(
        {
          surveyPeriodId: 'not-an-objectid',
          seriesIds: ['507f1f77bcf86cd799439021'],
          identity: 'a@b.com',
          otpCode: '123456',
          captchaToken: 'tok'
        },
        '203.0.113.9'
      )
    ).rejects.toMatchObject({ status: 404 })

    expect(m.surveyRepository.findSurveyPeriodById).not.toHaveBeenCalled()
    expect(m.authOtpService.validateOtpCode).not.toHaveBeenCalled()
    expect(m.authOtpService.burnOtp).not.toHaveBeenCalled()
  })

  it('importSurveyData: surveyPeriodId rác → 404, KHÔNG chạm repo', async () => {
    const m = makeMocks()
    await expect(
      makeService(m).importSurveyData({ surveyPeriodId: 'xxx', entries: [] }, '507f1f77bcf86cd799439011')
    ).rejects.toMatchObject({ status: 404 })

    expect(m.surveyRepository.findSurveyPeriodById).not.toHaveBeenCalled()
  })
})

describe('Fix-2 G-4b - IP vote limit per period', () => {
  const PERIOD_ID = '507f1f77bcf86cd799439011'
  const SERIES_ID = '507f1f77bcf86cd799439021'
  const body = {
    surveyPeriodId: PERIOD_ID,
    identity: 'r@example.com',
    otpCode: '123456',
    seriesIds: [SERIES_ID],
    captchaToken: 'tok'
  }

  function primeHappyPath(m: Mocks) {
    m.surveyConfigService.get.mockResolvedValue({
      maxSeriesPerVote: 3,
      captchaThreshold: 0.3,
      phoneRateLimit: 3,
      ipRateLimit: 10,
      otpCooldownSeconds: 60,
      ipVotesPerPeriod: 2
    })
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue({ id: PERIOD_ID, status: 'OPEN' })
    m.surveyRepository.findSeriesOwnershipByIds.mockResolvedValue([{ id: SERIES_ID, status: 'SERIALIZED' }])
    m.surveyRepository.findReaderVoteByPeriodAndIdentity.mockResolvedValue(null)
  }

  it('under the IP cap creates the vote', async () => {
    const m = makeMocks()
    primeHappyPath(m)
    m.surveyRepository.countReaderVotesByPeriodAndIp.mockResolvedValue(1)

    await makeService(m).submitVote(body, '1.2.3.4')

    expect(m.surveyRepository.createReaderVote).toHaveBeenCalled()
  })

  it('at the IP cap returns 429 before OTP burn or vote creation', async () => {
    const m = makeMocks()
    primeHappyPath(m)
    m.surveyRepository.countReaderVotesByPeriodAndIp.mockResolvedValue(2)

    await expect(makeService(m).submitVote(body as never, '1.2.3.4')).rejects.toMatchObject({
      status: 429,
      response: 'Error.VoteIpLimitExceeded'
    })
    expect(m.authOtpService.burnOtp).not.toHaveBeenCalled()
    expect(m.surveyRepository.createReaderVote).not.toHaveBeenCalled()
  })
})

describe('SurveyService — Spec 11 §1.3 notification catalog (regression guard)', () => {
  it('createSurveyPeriod: notify content lấy từ SurveyMessages.notification (không hard-code)', async () => {
    const m = makeMocks()
    m.surveyRepository.createSurveyPeriod = jest.fn().mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      issueNumber: 1,
      reflectedIssueNumber: null,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-15T00:00:00.000Z'),
      status: 'OPEN'
    })

    await makeService(m).createSurveyPeriod({ issueNumber: 1 } as never, '507f1f77bcf86cd799439012')

    expect(m.notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ content: SurveyMessages.notification.surveyPeriodCreated })
    )
  })
})

describe('SurveyService — AuditService wiring (Spec 11 / Task 13)', () => {
  const PERIOD_ID = '507f1f77bcf86cd799439011'

  it('updateSurveyPeriodStatus records TRANSITION with fromState=current status, toState=requested status', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue({ id: PERIOD_ID, status: 'DRAFT', issueNumber: 1 })
    m.surveyRepository.updateSurveyPeriodStatus.mockResolvedValue({
      id: PERIOD_ID,
      issueNumber: 1,
      reflectedIssueNumber: null,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-15T00:00:00.000Z'),
      status: 'OPEN'
    })

    await makeService(m).updateSurveyPeriodStatus(PERIOD_ID, { status: 'OPEN' }, 'admin-1')

    expect(m.auditService.record).toHaveBeenCalledWith({
      actorId: 'admin-1',
      entityType: AuditEntityType.SURVEY_PERIOD,
      entityId: PERIOD_ID,
      action: 'TRANSITION',
      fromState: 'DRAFT',
      toState: 'OPEN'
    })
  })
})

describe('SurveyService IP quota reservation nguyên tử (Spec 15.1 hardening)', () => {
  const PERIOD_ID = '507f1f77bcf86cd799439011'
  const SERIES_ID = '507f1f77bcf86cd799439021'
  const IP = '9.9.9.9'
  const voteBody = {
    surveyPeriodId: PERIOD_ID,
    identity: 'quota-reader@example.com',
    otpCode: '123456',
    seriesIds: [SERIES_ID],
    captchaToken: 'tok'
  }

  function primeVote(m: Mocks) {
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue({ id: PERIOD_ID, status: 'OPEN' })
    m.surveyRepository.findSeriesOwnershipByIds.mockResolvedValue([{ id: SERIES_ID, status: 'SERIALIZED' }])
    m.surveyRepository.findReaderVoteByPeriodAndIdentity.mockResolvedValue(null)
  }

  it('reservation vượt cap (2 request song song sát trần) → 429 + refund DECR, phiếu KHÔNG ghi', async () => {
    const m = makeMocks()
    primeVote(m)
    // DB count còn dưới trần (9 < 10) nhưng reservation nguyên tử trả 11 > cap → request thua race bị chặn.
    m.surveyRepository.countReaderVotesByPeriodAndIp.mockResolvedValue(9)
    m.redisService.incrWithTtl.mockResolvedValue(11)

    await expect(makeService(m).submitVote(voteBody, IP)).rejects.toMatchObject({ status: 429 })

    expect(m.redisService.incrWithTtl).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^survey:vote:ipq:${PERIOD_ID}:`)),
      expect.any(Number)
    )
    expect(m.redisService.decrSafe).toHaveBeenCalledTimes(1)
    expect(m.authOtpService.validateOtpCode).not.toHaveBeenCalled()
    expect(m.surveyRepository.createReaderVote).not.toHaveBeenCalled()
  })

  it('OTP sai → refund reservation (quota chỉ đếm phiếu ghi thật)', async () => {
    const m = makeMocks()
    primeVote(m)
    m.redisService.incrWithTtl.mockResolvedValue(1)
    m.authOtpService.validateOtpCode.mockRejectedValue(new Error('bad otp'))

    await expect(makeService(m).submitVote(voteBody, IP)).rejects.toBeDefined()

    expect(m.redisService.decrSafe).toHaveBeenCalledTimes(1)
    expect(m.surveyRepository.createReaderVote).not.toHaveBeenCalled()
  })

  it('danh tính đã vote (409) → refund reservation', async () => {
    const m = makeMocks()
    primeVote(m)
    m.redisService.incrWithTtl.mockResolvedValue(2)
    m.surveyRepository.findReaderVoteByPeriodAndIdentity.mockResolvedValue({ id: 'v1' })

    await expect(makeService(m).submitVote(voteBody, IP)).rejects.toMatchObject({ status: 409 })

    expect(m.redisService.decrSafe).toHaveBeenCalledTimes(1)
  })

  it('vote thành công → GIỮ reservation (không refund)', async () => {
    const m = makeMocks()
    primeVote(m)
    m.redisService.incrWithTtl.mockResolvedValue(3)

    await expect(makeService(m).submitVote(voteBody, IP)).resolves.toBeDefined()

    expect(m.surveyRepository.createReaderVote).toHaveBeenCalledTimes(1)
    expect(m.redisService.decrSafe).not.toHaveBeenCalled()
  })

  it('Redis lỗi (incrWithTtl null) → FAIL-OPEN theo DB count, lỗi sau đó KHÔNG refund', async () => {
    const m = makeMocks()
    primeVote(m)
    m.redisService.incrWithTtl.mockResolvedValue(null)
    m.authOtpService.validateOtpCode.mockRejectedValue(new Error('bad otp'))

    await expect(makeService(m).submitVote(voteBody, IP)).rejects.toBeDefined()

    expect(m.redisService.decrSafe).not.toHaveBeenCalled()
  })

  it('Redis lỗi (null) → vote thành công vẫn đi trọn flow (fail-open)', async () => {
    const m = makeMocks()
    primeVote(m)
    m.redisService.incrWithTtl.mockResolvedValue(null)

    await expect(makeService(m).submitVote(voteBody, IP)).resolves.toBeDefined()

    expect(m.surveyRepository.createReaderVote).toHaveBeenCalledTimes(1)
  })

  it('DB count đã đạt trần → 429 TRƯỚC khi reservation (không đụng Redis)', async () => {
    const m = makeMocks()
    primeVote(m)
    m.surveyRepository.countReaderVotesByPeriodAndIp.mockResolvedValue(10)

    await expect(makeService(m).submitVote(voteBody, IP)).rejects.toMatchObject({ status: 429 })

    expect(m.redisService.incrWithTtl).not.toHaveBeenCalled()
  })
})

describe('SurveyService.getVoteResults — filter publicationType (Spec 15.2, bảng con WEEKLY/MONTHLY)', () => {
  const P = '507f1f77bcf86cd799439011'
  const S1 = '507f1f77bcf86cd799439021'
  const S2 = '507f1f77bcf86cd799439022'

  function primeReflected(m: Mocks) {
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue({ id: P, status: 'REFLECTED', issueNumber: 12 })
    m.surveyRepository.getRankingRecordsByPeriod = jest.fn().mockResolvedValue([
      { seriesId: S1, rankPosition: 1, voteCount: 10, rankChange: 2 },
      { seriesId: S2, rankPosition: 2, voteCount: 3, rankChange: null }
    ])
    m.surveyRepository.findSeriesTitlesByIds = jest.fn().mockResolvedValue([
      { id: S1, title: 'Weekly One', publicationType: 'WEEKLY' },
      { id: S2, title: 'Monthly Two', publicationType: 'MONTHLY' }
    ])
  }

  it('filter WEEKLY → chỉ series WEEKLY, GIỮ rankPosition gốc (vị trí bảng tổng)', async () => {
    const m = makeMocks()
    primeReflected(m)
    const out = await makeService(m).getVoteResults(P, 'WEEKLY')
    expect(out.results).toEqual([
      {
        rankPosition: 1,
        seriesId: S1,
        seriesTitle: 'Weekly One',
        publicationType: 'WEEKLY',
        voteCount: 10,
        rankChange: 2
      }
    ])
  })

  it('filter MONTHLY → chỉ series MONTHLY', async () => {
    const m = makeMocks()
    primeReflected(m)
    const out = await makeService(m).getVoteResults(P, 'MONTHLY')
    expect(out.results.map((r) => r.seriesId)).toEqual([S2])
  })

  it('không filter → trả đủ (backward-compatible)', async () => {
    const m = makeMocks()
    primeReflected(m)
    const out = await makeService(m).getVoteResults(P)
    expect(out.results).toHaveLength(2)
  })

  it('getLatestVoteResults truyền filter xuống getVoteResults', async () => {
    const m = makeMocks()
    m.surveyRepository.findLatestReflectedPeriod.mockResolvedValue({
      id: P,
      issueNumber: 12,
      reflectedIssueNumber: null,
      startDate: null,
      endDate: null
    })
    const service = makeService(m)
    const spy = jest.spyOn(service, 'getVoteResults').mockResolvedValue({
      surveyPeriodId: P,
      issueNumber: 12,
      results: []
    })
    await service.getLatestVoteResults('WEEKLY')
    expect(spy).toHaveBeenCalledWith(P, 'WEEKLY')
  })
})
