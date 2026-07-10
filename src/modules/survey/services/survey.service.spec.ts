import { SurveyService } from './survey.service'
import { DomainEvent } from 'src/core/events/domain-events'
import { IdentityHashService } from 'src/infrastructure/crypto/identity-hash.service'

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
      createReaderVote: jest.fn().mockResolvedValue({}),
      createRankingRecord: jest.fn().mockResolvedValue({}),
      updateSurveyPeriodStatus: jest.fn().mockResolvedValue({}),
      countPublishedChaptersBySeriesIds: jest.fn().mockResolvedValue(new Map()),
      findHeldChapterSeriesIds: jest.fn().mockResolvedValue(new Set<string>()),
      findSeriesOwnershipByIds: jest.fn().mockResolvedValue([]),
      findBoardMemberIds: jest.fn().mockResolvedValue([])
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
        ipRateLimit: 10
      })
    },
    appConfigService: {
      get: jest.fn().mockResolvedValue({
        lowVoteReliabilityThreshold: 10,
        hiatusTooLongDays: 30
      })
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
    m.appConfigService as never
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
    phoneNumber: '+84900000000',
    otpCode: '123456'
  }
  const IP = '203.0.113.9'
  const serializedOwnership = (ids: string[]) =>
    ids.map((id) => ({ id, status: 'SERIALIZED', mangakaId: 'm', editorId: null }))

  it('uses HMAC identityHash for BOTH the dedup lookup and the stored vote (so "1 phone = 1 vote/period" holds)', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue(OPEN_PERIOD)
    m.surveyRepository.findSeriesOwnershipByIds.mockResolvedValue(serializedOwnership([SERIES_A]))
    m.surveyRepository.findReaderVoteByPeriodAndIdentity.mockResolvedValue(null)

    await makeService(m).submitVote(VOTE_BODY, IP)

    const expectedIdentityHash = identityHash.hash(VOTE_BODY.phoneNumber)
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

  it('rejects a second vote from the same phone in the same period (dedup hit)', async () => {
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
          phoneNumber: '+84900000000',
          otpCode: '123456'
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
