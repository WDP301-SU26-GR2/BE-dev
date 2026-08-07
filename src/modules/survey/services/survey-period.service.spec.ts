import { SurveyPeriodService } from './survey-period.service'
import { MagazineNotRegisteredException } from 'src/modules/magazine/errors/magazine.errors'

const PERIOD_ID = '507f1f77bcf86cd799439011'
const USER_ID = '507f1f77bcf86cd799439012'

function period(overrides: Record<string, unknown> = {}) {
  return {
    id: PERIOD_ID,
    magazine: 'Jump',
    publicationType: 'WEEKLY',
    eligibleSeriesIds: ['s1'],
    issueNumber: 10,
    reflectedIssueNumber: null,
    startDate: new Date('2026-07-01T00:00:00.000Z'),
    endDate: new Date('2026-07-07T00:00:00.000Z'),
    status: 'DRAFT',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides
  }
}

function makeDeps() {
  return {
    repo: {
      findManySurveyPeriods: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      findSurveyPeriodById: jest.fn(),
      getReaderVotesByPeriod: jest.fn().mockResolvedValue([]),
      getSurveyDataByPeriod: jest.fn().mockResolvedValue([]),
      createSurveyPeriod: jest.fn().mockResolvedValue(period()),
      findScopedSurveyPeriod: jest.fn().mockResolvedValue(null),
      findSeriesOwnershipByIds: jest.fn().mockResolvedValue([]),
      findVoteEligibleSeries: jest.fn().mockResolvedValue([]),
      updateSurveyPeriodStatus: jest.fn()
    },
    notification: { notifySafe: jest.fn().mockResolvedValue(undefined) },
    audit: { record: jest.fn().mockResolvedValue(undefined) },
    cache: { bumpVersion: jest.fn().mockResolvedValue(undefined) },
    magazineRegistry: { assertSlotAllowed: jest.fn().mockResolvedValue(undefined) }
  }
}

function make(deps: ReturnType<typeof makeDeps>) {
  return new SurveyPeriodService(
    deps.repo as never,
    deps.notification as never,
    deps.audit as never,
    deps.cache as never,
    deps.magazineRegistry as never
  )
}

describe('SurveyPeriodService query guards', () => {
  it('maps a filtered paginated period list with a stable response shape and a single existing period', async () => {
    const deps = makeDeps()
    deps.repo.findManySurveyPeriods.mockResolvedValue({ items: [period()], total: 7 })
    deps.repo.findSurveyPeriodById.mockResolvedValue(period())

    const query = { magazine: ' Jump ', publicationType: 'WEEKLY', status: 'OPEN', limit: 10, offset: 20 } as const
    await expect(make(deps).getSurveyPeriods(query as never)).resolves.toMatchObject({
      items: [{ id: PERIOD_ID, startDate: '2026-07-01T00:00:00.000Z' }],
      total: 7,
      limit: 10,
      offset: 20
    })
    expect(deps.repo.findManySurveyPeriods).toHaveBeenCalledWith({ ...query, magazine: 'Jump' })
    await expect(make(deps).getSurveyPeriodById(PERIOD_ID)).resolves.toMatchObject({
      id: PERIOD_ID,
      startDate: '2026-07-01T00:00:00.000Z'
    })
  })

  it.each(['getSurveyPeriodById', 'getSurveyPeriodVotes', 'getSurveyPeriodSurveyData'] as const)(
    '%s rejects malformed and missing periods before exposing data',
    async (method) => {
      const malformed = makeDeps()
      await expect(make(malformed)[method]('bad-id')).rejects.toMatchObject({ status: 404 })
      expect(malformed.repo.findSurveyPeriodById).not.toHaveBeenCalled()

      const missing = makeDeps()
      missing.repo.findSurveyPeriodById.mockResolvedValue(null)
      await expect(make(missing)[method](PERIOD_ID)).rejects.toMatchObject({ status: 404 })
    }
  )

  it('returns votes and imported data only after the period exists', async () => {
    const deps = makeDeps()
    deps.repo.findSurveyPeriodById.mockResolvedValue(period())
    deps.repo.getReaderVotesByPeriod.mockResolvedValue([{ id: 'vote1' }])
    deps.repo.getSurveyDataByPeriod.mockResolvedValue([{ id: 'import1' }])

    await expect(make(deps).getSurveyPeriodVotes(PERIOD_ID)).resolves.toEqual([{ id: 'vote1' }])
    await expect(make(deps).getSurveyPeriodSurveyData(PERIOD_ID)).resolves.toEqual([{ id: 'import1' }])
  })
})

describe('SurveyPeriodService creation scope validation', () => {
  const scopedBody = {
    magazine: '  Jump  ',
    publicationType: 'WEEKLY',
    eligibleSeriesIds: ['s1'],
    issueNumber: 10,
    startDate: '2026-07-01',
    endDate: '2026-07-07'
  } as const

  it('keeps legacy direct callers working and performs side effects only for an actor', async () => {
    const withoutActor = makeDeps()
    await make(withoutActor).createSurveyPeriod({ ...scopedBody, magazine: '' } as never)
    expect(withoutActor.notification.notifySafe).not.toHaveBeenCalled()

    const withActor = makeDeps()
    await make(withActor).createSurveyPeriod({ ...scopedBody, eligibleSeriesIds: [] }, USER_ID)
    expect(withActor.notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: USER_ID, referenceType: 'SURVEY_PERIOD_CREATED' })
    )
    expect(withActor.cache.bumpVersion).toHaveBeenCalledTimes(2)
  })

  it('rejects a period scoped to an unregistered magazine before querying persistence', async () => {
    const deps = makeDeps()
    deps.magazineRegistry.assertSlotAllowed.mockRejectedValueOnce(MagazineNotRegisteredException)
    deps.repo.findSeriesOwnershipByIds.mockResolvedValue([
      { id: 's1', status: 'SERIALIZED', magazine: 'Jump', publicationType: 'WEEKLY' }
    ])

    await expect(make(deps).createSurveyPeriod(scopedBody as never)).rejects.toBe(MagazineNotRegisteredException)
    expect(deps.magazineRegistry.assertSlotAllowed).toHaveBeenCalledWith('Jump', 'WEEKLY')
    expect(deps.repo.findScopedSurveyPeriod).not.toHaveBeenCalled()
    expect(deps.repo.createSurveyPeriod).not.toHaveBeenCalled()
  })

  it('rejects duplicate magazine/type/issue scopes before checking eligibility', async () => {
    const deps = makeDeps()
    deps.repo.findScopedSurveyPeriod.mockResolvedValue(period())

    await expect(make(deps).createSurveyPeriod(scopedBody as never)).rejects.toMatchObject({ status: 409 })
    expect(deps.repo.findSeriesOwnershipByIds).not.toHaveBeenCalled()
    expect(deps.repo.createSurveyPeriod).not.toHaveBeenCalled()
  })

  it.each(
    [
      [],
      [{ id: 's1', status: 'DRAFT', magazine: 'Jump', publicationType: 'WEEKLY' }],
      [{ id: 's1', status: 'SERIALIZED', magazine: 'Other', publicationType: 'WEEKLY' }],
      [{ id: 's1', status: 'SERIALIZED', magazine: ' Jump ', publicationType: 'MONTHLY' }]
    ].map((eligible) => [eligible])
  )('rejects incomplete or out-of-scope eligibility snapshots', async (eligible) => {
    const deps = makeDeps()
    deps.repo.findSeriesOwnershipByIds.mockResolvedValue(eligible)

    await expect(make(deps).createSurveyPeriod(scopedBody as never)).rejects.toMatchObject({ status: 422 })
    expect(deps.repo.createSurveyPeriod).not.toHaveBeenCalled()
  })

  it('creates a fully scoped period, trims magazine for lookup, notifies and invalidates both caches', async () => {
    const deps = makeDeps()
    deps.repo.findSeriesOwnershipByIds.mockResolvedValue([
      { id: 's1', status: 'SERIALIZED', magazine: ' Jump ', publicationType: 'WEEKLY' }
    ])

    await expect(make(deps).createSurveyPeriod(scopedBody as never, USER_ID)).resolves.toMatchObject({ id: PERIOD_ID })
    expect(deps.repo.findScopedSurveyPeriod).toHaveBeenCalledWith('Jump', 'WEEKLY', 10)
    expect(deps.repo.createSurveyPeriod).toHaveBeenCalledWith(scopedBody)
    expect(deps.notification.notifySafe).toHaveBeenCalledTimes(1)
    expect(deps.cache.bumpVersion.mock.calls).toEqual([['votectx'], ['ranking']])
  })
})

describe('SurveyPeriodService state transitions', () => {
  it('rejects malformed, missing and illegal transitions without writes or audit', async () => {
    const malformed = makeDeps()
    await expect(make(malformed).updateSurveyPeriodStatus('bad-id', { status: 'OPEN' })).rejects.toMatchObject({
      status: 404
    })

    const missing = makeDeps()
    missing.repo.findSurveyPeriodById.mockResolvedValue(null)
    await expect(make(missing).updateSurveyPeriodStatus(PERIOD_ID, { status: 'OPEN' })).rejects.toMatchObject({
      status: 404
    })

    for (const [from, to] of [
      ['DRAFT', 'CLOSED'],
      ['OPEN', 'OPEN'],
      ['CLOSED', 'OPEN']
    ] as const) {
      const deps = makeDeps()
      deps.repo.findSurveyPeriodById.mockResolvedValue(period({ status: from }))
      await expect(make(deps).updateSurveyPeriodStatus(PERIOD_ID, { status: to })).rejects.toMatchObject({
        status: 409
      })
      expect(deps.repo.updateSurveyPeriodStatus).not.toHaveBeenCalled()
      expect(deps.audit.record).not.toHaveBeenCalled()
    }
  })

  it.each([
    ['DRAFT', 'OPEN'],
    ['OPEN', 'CLOSED']
  ] as const)('allows %s -> %s, audits the token actor and invalidates read caches', async (from, to) => {
    const deps = makeDeps()
    deps.repo.findSurveyPeriodById.mockResolvedValue(period({ status: from }))
    deps.repo.updateSurveyPeriodStatus.mockResolvedValue(period({ status: to }))

    await make(deps).updateSurveyPeriodStatus(PERIOD_ID, { status: to }, USER_ID)

    expect(deps.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: USER_ID, fromState: from, toState: to })
    )
    expect(deps.notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: USER_ID, referenceType: 'SURVEY_PERIOD_STATUS_UPDATED' })
    )
    expect(deps.cache.bumpVersion.mock.calls).toEqual([['votectx'], ['ranking']])
  })

  it('records a system actor as null and does not fabricate a notification recipient', async () => {
    const deps = makeDeps()
    deps.repo.findSurveyPeriodById.mockResolvedValue(period({ status: 'DRAFT' }))
    deps.repo.updateSurveyPeriodStatus.mockResolvedValue(period({ status: 'OPEN' }))

    await make(deps).updateSurveyPeriodStatus(PERIOD_ID, { status: 'OPEN' })

    expect(deps.audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: null }))
    expect(deps.notification.notifySafe).not.toHaveBeenCalled()
  })
})

// BR-VOTE-05 (2026-08-05): series đang đăng chương kết thúc vẫn nằm trên tạp chí kỳ đó ⇒ vẫn được bình chọn.
describe('SurveyPeriodService — eligibility theo trạng thái series', () => {
  const scopedBody = {
    magazine: '  Jump  ',
    publicationType: 'WEEKLY',
    eligibleSeriesIds: ['s1'],
    issueNumber: 10,
    startDate: '2026-07-01',
    endDate: '2026-07-07'
  } as const

  const owned = (status: string) => [{ id: 's1', status, magazine: 'Jump', publicationType: 'WEEKLY' }]

  it.each(['SERIALIZED', 'CANCELLING', 'COMPLETING'])('chấp nhận series %s', async (status) => {
    const deps = makeDeps()
    deps.repo.findSeriesOwnershipByIds.mockResolvedValue(owned(status))
    await expect(make(deps).createSurveyPeriod(scopedBody as never)).resolves.toBeDefined()
    expect(deps.repo.createSurveyPeriod).toHaveBeenCalled()
  })

  it.each(['HIATUS', 'CANCELLED', 'COMPLETED', 'DRAFT', 'PITCHED'])('chặn series %s → 422', async (status) => {
    const deps = makeDeps()
    deps.repo.findSeriesOwnershipByIds.mockResolvedValue(owned(status))
    await expect(make(deps).createSurveyPeriod(scopedBody as never)).rejects.toMatchObject({
      status: 422,
      response: { message: [{ message: 'Error.SeriesNotVotable', path: 'seriesIds' }] }
    })
    expect(deps.repo.createSurveyPeriod).not.toHaveBeenCalled()
  })
})

// magazine là KHOÁ LIÊN KẾT chuỗi Series↔SurveyPeriod↔RankingRecord. Write-path dùng normalizeMagazine
// (trim + collapse khoảng trắng nội bộ); read/compare-path PHẢI chuẩn hoá y hệt, nếu không admin gõ
// 'FT  Jump' (2 dấu cách) sẽ không khớp Series.magazine='FT Jump' đã collapse → loại series im lặng (§96).
describe('SurveyPeriodService — chuẩn hoá magazine (collapse khoảng trắng nội bộ)', () => {
  const dblSpaceBody = {
    magazine: 'FT  Jump',
    publicationType: 'WEEKLY',
    eligibleSeriesIds: ['s1'],
    issueNumber: 10,
    startDate: '2026-07-01',
    endDate: '2026-07-07'
  } as const

  it('createSurveyPeriod khớp Series.magazine đã collapse + tra scope bằng tên đã collapse', async () => {
    const deps = makeDeps()
    deps.repo.findSeriesOwnershipByIds.mockResolvedValue([
      { id: 's1', status: 'SERIALIZED', magazine: 'FT Jump', publicationType: 'WEEKLY' }
    ])

    await expect(make(deps).createSurveyPeriod(dblSpaceBody as never)).resolves.toBeDefined()
    expect(deps.repo.findScopedSurveyPeriod).toHaveBeenCalledWith('FT Jump', 'WEEKLY', 10)
    expect(deps.repo.createSurveyPeriod).toHaveBeenCalled()
  })

  it('getEligibleSeries collapse khoảng trắng nội bộ khi tra repo', async () => {
    const deps = makeDeps()
    deps.repo.findVoteEligibleSeries.mockResolvedValue([])

    await make(deps).getEligibleSeries({ magazine: 'FT  Jump', publicationType: 'WEEKLY' } as never)
    expect(deps.repo.findVoteEligibleSeries).toHaveBeenCalledWith('FT Jump', 'WEEKLY', [
      'SERIALIZED',
      'CANCELLING',
      'COMPLETING'
    ])
  })

  it('getSurveyPeriods collapse khoảng trắng nội bộ trong bộ lọc magazine', async () => {
    const deps = makeDeps()
    await make(deps).getSurveyPeriods({
      magazine: 'FT  Jump',
      publicationType: 'WEEKLY',
      status: 'OPEN',
      limit: 10,
      offset: 0
    } as never)
    expect(deps.repo.findManySurveyPeriods).toHaveBeenCalledWith(expect.objectContaining({ magazine: 'FT Jump' }))
  })
})

describe('SurveyPeriodService.getEligibleSeries', () => {
  it('trim tạp chí + truyền ĐÚNG bộ trạng thái dùng chung với validate lúc tạo kỳ', async () => {
    const deps = makeDeps()
    deps.repo.findVoteEligibleSeries.mockResolvedValue([
      { id: 's1', title: 'A', coverImage: null, status: 'SERIALIZED', magazine: 'Jump', publicationType: 'WEEKLY' }
    ])

    await expect(
      make(deps).getEligibleSeries({ magazine: '  Jump  ', publicationType: 'WEEKLY' } as never)
    ).resolves.toEqual({
      items: [
        { id: 's1', title: 'A', coverImage: null, status: 'SERIALIZED', magazine: 'Jump', publicationType: 'WEEKLY' }
      ],
      total: 1
    })
    expect(deps.repo.findVoteEligibleSeries).toHaveBeenCalledWith('Jump', 'WEEKLY', [
      'SERIALIZED',
      'CANCELLING',
      'COMPLETING'
    ])
  })
})
