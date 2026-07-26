import { SurveyRepository } from './survey.repo'

const PERIOD_ID = '507f1f77bcf86cd799439011'

describe('SurveyRepository privacy, state and ranking persistence', () => {
  it('normalizes period input and preserves explicit reflected/status values', async () => {
    const create = jest.fn().mockResolvedValue({ id: PERIOD_ID })
    const repo = new SurveyRepository({ surveyPeriod: { create } } as never)

    await repo.createSurveyPeriod({
      magazine: '  Weekly Jump  ',
      publicationType: 'WEEKLY',
      eligibleSeriesIds: ['s1'],
      issueNumber: 12,
      startDate: '2026-07-01',
      endDate: '2026-07-07'
    } as never)
    await repo.createSurveyPeriod({
      magazine: 'Monthly Jump',
      publicationType: 'MONTHLY',
      eligibleSeriesIds: ['s2'],
      issueNumber: 8,
      reflectedIssueNumber: 10,
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      status: 'OPEN'
    } as never)

    expect(create.mock.calls[0][0].data).toMatchObject({
      magazine: 'Weekly Jump',
      reflectedIssueNumber: null,
      status: 'DRAFT',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-07')
    })
    expect(create.mock.calls[1][0].data).toMatchObject({
      reflectedIssueNumber: 10,
      status: 'OPEN'
    })
  })

  it('stores only hashed guest identity fields and writes optional anti-abuse evidence as explicit null', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'vote1' })
    const repo = new SurveyRepository({ readerVote: { create } } as never)

    await repo.createReaderVote({
      surveyPeriodId: PERIOD_ID,
      seriesIds: ['s1'],
      identityHash: 'identity-hmac',
      publicationType: null,
      voteWeight: 1,
      isFlagged: false
    })
    await repo.createReaderVote({
      surveyPeriodId: PERIOD_ID,
      seriesIds: ['s2'],
      identityHash: 'identity-hmac-2',
      publicationType: 'WEEKLY',
      authMethod: 'EMAIL_OTP',
      ipHash: 'ip-hmac',
      captchaScore: 0.9,
      voteWeight: 0.5,
      isFlagged: true
    })

    expect(create.mock.calls[0][0].data).toEqual({
      surveyPeriodId: PERIOD_ID,
      seriesIds: ['s1'],
      identityHash: 'identity-hmac',
      publicationType: null,
      authMethod: null,
      ipHash: null,
      captchaScore: null,
      voteWeight: 1,
      isFlagged: false
    })
    expect(create.mock.calls[1][0].data).toMatchObject({
      authMethod: 'EMAIL_OTP',
      ipHash: 'ip-hmac',
      captchaScore: 0.9
    })
    expect(JSON.stringify(create.mock.calls)).not.toContain('@')
  })

  it('maps optional import dates and ranking history fields without inventing values', async () => {
    const surveyDataCreate = jest.fn().mockResolvedValue({})
    const rankingCreate = jest.fn().mockResolvedValue({})
    const repo = new SurveyRepository({
      surveyData: { create: surveyDataCreate },
      rankingRecord: { create: rankingCreate }
    } as never)

    await repo.createSurveyData({
      surveyPeriodId: PERIOD_ID,
      importedBy: 'admin1',
      entries: [{ seriesId: 's1', voteCount: 20 }]
    })
    await repo.createSurveyData({
      surveyPeriodId: PERIOD_ID,
      importedBy: 'admin1',
      surveyDate: '2026-07-04',
      entries: []
    })
    await repo.createRankingRecord({
      seriesId: 's1',
      surveyPeriodId: PERIOD_ID,
      voteCount: 20,
      isAtRisk: false,
      riskLevel: 'NONE',
      consecutiveAtRiskCount: 0,
      isReliable: true
    })
    await repo.createRankingRecord({
      seriesId: 's2',
      surveyPeriodId: PERIOD_ID,
      rankPosition: 2,
      voteCount: 10,
      previousRank: 1,
      rankChange: -1,
      isAtRisk: true,
      riskLevel: 'LOW',
      consecutiveAtRiskCount: 1,
      isReliable: false
    })

    expect(surveyDataCreate.mock.calls[0][0].data).toMatchObject({
      surveyDate: null,
      entries: [{ seriesId: 's1', voteCount: 20 }]
    })
    expect(surveyDataCreate.mock.calls[1][0].data.surveyDate).toEqual(new Date('2026-07-04'))
    expect(rankingCreate.mock.calls[0][0].data).toMatchObject({
      rankPosition: null,
      previousRank: null,
      rankChange: null
    })
    expect(rankingCreate.mock.calls[1][0].data).toMatchObject({
      rankPosition: 2,
      previousRank: 1,
      rankChange: -1
    })
  })

  it('freezes public eligibility and avoids database calls for empty identity sets', async () => {
    const seriesFindMany = jest.fn().mockResolvedValue([{ id: 's1' }])
    const rankingFindMany = jest.fn().mockResolvedValue([{ seriesId: 's1' }])
    const repo = new SurveyRepository({
      series: { findMany: seriesFindMany },
      rankingRecord: { findMany: rankingFindMany }
    } as never)

    await expect(repo.findSeriesTitlesByIds([])).resolves.toEqual([])
    await expect(repo.findPublicSeriesByIds([])).resolves.toEqual([])
    await expect(repo.findRankingRecordsByPeriodIds([])).resolves.toEqual([])
    expect(seriesFindMany).not.toHaveBeenCalled()
    expect(rankingFindMany).not.toHaveBeenCalled()

    await repo.findSeriesTitlesByIds(['s1'])
    await repo.findPublicSeriesByIds(['s1'])
    await repo.findRankingRecordsByPeriodIds([PERIOD_ID])
    expect(seriesFindMany).toHaveBeenCalledTimes(2)
    expect(rankingFindMany).toHaveBeenCalledTimes(1)
  })

  it('uses a concrete publication scope or a non-null publication fallback for public series', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const repo = new SurveyRepository({ series: { findMany } } as never)

    await repo.findManySerializedSeriesPublic()
    await repo.findManySerializedSeriesPublic('WEEKLY')

    expect(findMany.mock.calls[0][0].where).toEqual({
      status: 'SERIALIZED',
      publicationType: { not: null }
    })
    expect(findMany.mock.calls[1][0].where).toEqual({
      status: 'SERIALIZED',
      publicationType: 'WEEKLY'
    })
  })

  it('counts published chapters and detects only holds older than the threshold', async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { seriesId: 's1', _count: { _all: 8 } },
      { seriesId: 's2', _count: { _all: 3 } }
    ])
    const threshold = new Date('2026-07-10T00:00:00.000Z')
    const findMany = jest.fn().mockResolvedValue([
      { seriesId: 's1', hold: null },
      { seriesId: 's2', hold: { heldAt: null } },
      { seriesId: 's3', hold: { heldAt: new Date('2026-07-11T00:00:00.000Z') } },
      { seriesId: 's4', hold: { heldAt: new Date('2026-07-09T00:00:00.000Z') } }
    ])
    const repo = new SurveyRepository({ chapter: { groupBy, findMany } } as never)

    await expect(repo.countPublishedChaptersBySeriesIds([])).resolves.toEqual(new Map())
    await expect(repo.findHeldChapterSeriesIds([], threshold)).resolves.toEqual(new Set())
    await expect(repo.countPublishedChaptersBySeriesIds(['s1', 's2'])).resolves.toEqual(
      new Map([
        ['s1', 8],
        ['s2', 3]
      ])
    )
    await expect(repo.findHeldChapterSeriesIds(['s1', 's2', 's3', 's4'], threshold)).resolves.toEqual(new Set(['s4']))
  })

  it('resolves board recipients defensively when the role is absent and excludes soft-deleted users', async () => {
    const roleFindFirst = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'role1' })
    const userFindMany = jest.fn().mockResolvedValue([{ id: 'board1' }, { id: 'board2' }])
    const repo = new SurveyRepository({
      role: { findFirst: roleFindFirst },
      user: { findMany: userFindMany }
    } as never)

    await expect(repo.findBoardMemberIds()).resolves.toEqual([])
    expect(userFindMany).not.toHaveBeenCalled()
    await expect(repo.findBoardMemberIds()).resolves.toEqual(['board1', 'board2'])
    expect(userFindMany).toHaveBeenCalledWith({
      where: { roleId: 'role1', deletedAt: { isSet: false } },
      select: { id: true }
    })
  })

  it('claims CLOSED to REFLECTED atomically so concurrent finalizers have one winner', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 })
    const updateMany = jest.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })
    const transaction = jest.fn(async (callback: (tx: unknown) => Promise<boolean>) =>
      callback({ surveyPeriod: { updateMany }, rankingRecord: { createMany } })
    )
    const repo = new SurveyRepository({ $transaction: transaction } as never)
    const records = [
      {
        seriesId: 's1',
        rankPosition: 1,
        voteCount: 20,
        normalizedScore: 1,
        previousRank: null,
        rankChange: null,
        isAtRisk: false,
        riskLevel: 'NONE' as const,
        consecutiveAtRiskCount: 0,
        isReliable: true
      }
    ]

    await expect(repo.finalizeScopedRanking(PERIOD_ID, records)).resolves.toBe(false)
    expect(createMany).not.toHaveBeenCalled()
    await expect(repo.finalizeScopedRanking(PERIOD_ID, records)).resolves.toBe(true)
    expect(createMany).toHaveBeenCalledWith({
      data: [{ ...records[0], surveyPeriodId: PERIOD_ID }]
    })
  })
})

describe('SurveyRepository voting configuration fallback semantics', () => {
  const allValues = {
    authMode: 'HYBRID' as const,
    maxSeriesPerVote: 5,
    otpExpirySeconds: 600,
    otpMaxAttempts: 6,
    ipRateLimit: 20,
    phoneRateLimit: 8,
    otpCooldownSeconds: 120,
    ipVotesPerPeriod: 15,
    captchaThreshold: 0.8
  }

  it('preserves every current value for omitted fields and applies every explicit override', async () => {
    const existing = { id: 'config1', ...allValues }
    const findFirst = jest.fn().mockResolvedValue(existing)
    const update = jest.fn().mockResolvedValue(existing)
    const repo = new SurveyRepository({
      votingConfig: { findFirst, update }
    } as never)

    await repo.updateVotingConfig({})
    await repo.updateVotingConfig({
      authMode: 'OTP',
      maxSeriesPerVote: 2,
      otpExpirySeconds: 100,
      otpMaxAttempts: 2,
      ipRateLimit: 4,
      phoneRateLimit: 1,
      otpCooldownSeconds: 20,
      ipVotesPerPeriod: 3,
      captchaThreshold: 0.2
    })

    expect(update.mock.calls[0][0].data).toEqual(allValues)
    expect(update.mock.calls[1][0].data).toEqual({
      authMode: 'OTP',
      maxSeriesPerVote: 2,
      otpExpirySeconds: 100,
      otpMaxAttempts: 2,
      ipRateLimit: 4,
      phoneRateLimit: 1,
      otpCooldownSeconds: 20,
      ipVotesPerPeriod: 3,
      captchaThreshold: 0.2
    })
  })

  it('creates safe defaults when no row exists and preserves all explicit first-write values', async () => {
    const findFirst = jest.fn().mockResolvedValue(null)
    const create = jest.fn().mockResolvedValue({})
    const repo = new SurveyRepository({
      votingConfig: { findFirst, create }
    } as never)

    await repo.updateVotingConfig({})
    await repo.updateVotingConfig(allValues)

    expect(create.mock.calls[0][0].data).toEqual({
      authMode: 'OTP',
      maxSeriesPerVote: 3,
      otpExpirySeconds: 300,
      otpMaxAttempts: 3,
      ipRateLimit: 10,
      phoneRateLimit: 3,
      otpCooldownSeconds: 60,
      ipVotesPerPeriod: 10,
      captchaThreshold: 0.3
    })
    expect(create.mock.calls[1][0].data).toEqual(allValues)
  })
})
