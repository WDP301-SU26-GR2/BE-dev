import { PaymentEngineService } from './payment-engine.service'

const makeRepo = () => ({
  pauseTimeBoundConditions: jest.fn().mockResolvedValue({ count: 1 }),
  findDisabledTimeBoundConditions: jest.fn().mockResolvedValue([
    {
      id: 'c1',
      thresholdConfig: { deadline: '2026-01-10', chapterTarget: 24, payoutAmount: 100 }
    }
  ]),
  resumeTimeBoundCondition: jest.fn().mockResolvedValue(undefined)
})

describe('PaymentEngineService hiatus pause/resume', () => {
  it('handleSeriesHiatusStarted pauses TIME_BOUND conditions of the series', async () => {
    const repo = makeRepo()
    const eventEmitter = { emit: jest.fn() }
    const svc = new PaymentEngineService(
      repo as never,
      eventEmitter as never,
      { setNxEx: jest.fn().mockResolvedValue(true) } as never
    )
    await svc.handleSeriesHiatusStarted({ seriesId: 's1' })
    expect(repo.pauseTimeBoundConditions).toHaveBeenCalledWith('s1')
    expect(repo.findDisabledTimeBoundConditions).not.toHaveBeenCalled()
    expect(repo.resumeTimeBoundCondition).not.toHaveBeenCalled()
  })

  it('handleSeriesHiatusEnded resumes TIME_BOUND conditions and shifts deadline forward by pausedMs', async () => {
    const repo = makeRepo()
    const eventEmitter = { emit: jest.fn() }
    const svc = new PaymentEngineService(
      repo as never,
      eventEmitter as never,
      { setNxEx: jest.fn().mockResolvedValue(true) } as never
    )
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000
    await svc.handleSeriesHiatusEnded({ seriesId: 's1', pausedMs: twoDaysMs })

    expect(repo.findDisabledTimeBoundConditions).toHaveBeenCalledWith('s1')
    expect(repo.resumeTimeBoundCondition).toHaveBeenCalledTimes(1)
    const [id, cfg] = repo.resumeTimeBoundCondition.mock.calls[0]
    expect(id).toBe('c1')
    // 2026-01-10 + 2 days = 2026-01-12
    expect(cfg.deadline).toBe('2026-01-12')
    // preserves other keys
    expect(cfg.chapterTarget).toBe(24)
    expect(cfg.payoutAmount).toBe(100)
  })

  it('handleSeriesHiatusEnded preserves thresholdConfig when no deadline present', async () => {
    const repo = {
      findDisabledTimeBoundConditions: jest
        .fn()
        .mockResolvedValue([{ id: 'c2', thresholdConfig: { chapterTarget: 10, payoutAmount: 50 } }]),
      resumeTimeBoundCondition: jest.fn().mockResolvedValue(undefined)
    }
    const eventEmitter = { emit: jest.fn() }
    const svc = new PaymentEngineService(
      repo as never,
      eventEmitter as never,
      { setNxEx: jest.fn().mockResolvedValue(true) } as never
    )
    await svc.handleSeriesHiatusEnded({ seriesId: 's1', pausedMs: 1000 })
    const [, cfg] = repo.resumeTimeBoundCondition.mock.calls[0]
    expect(cfg).toEqual({ chapterTarget: 10, payoutAmount: 50 })
  })
})

describe('PaymentEngineService.handleSeriesCancelling B-CON-09', () => {
  it('marks conditions missed, generates compensation, and terminates contracts', async () => {
    const repo = {
      findEligibleContracts: jest.fn().mockResolvedValue([
        {
          id: 'k1',
          seriesId: 's1',
          mangakaId: 'm1',
          terminationClause: JSON.stringify({ compensationAmount: 500 }),
          conditions: []
        }
      ]),
      markPendingConditionsMissedByContract: jest.fn().mockResolvedValue({ count: 1 }),
      existsPayment: jest.fn().mockResolvedValue(null),
      createTriggeredPayment: jest
        .fn()
        .mockResolvedValue({ id: 'p1', contractId: 'k1', receiverId: 'm1', amount: 500 }),
      terminateContractsBySeries: jest.fn().mockResolvedValue({ count: 1 })
    }
    const eventEmitter = { emit: jest.fn() }
    const svc = new PaymentEngineService(
      repo as never,
      eventEmitter as never,
      { setNxEx: jest.fn().mockResolvedValue(true) } as never
    )

    await svc.handleSeriesCancelling({ seriesId: 's1' })

    expect(repo.findEligibleContracts).toHaveBeenCalledWith('s1')
    expect(repo.markPendingConditionsMissedByContract).toHaveBeenCalledWith('k1')
    expect(repo.createTriggeredPayment).toHaveBeenCalled()
    expect(repo.terminateContractsBySeries).toHaveBeenCalledWith('s1')
  })
})

describe('PaymentEngineService markMissedTimeBoundConditions — cron hardening (audit 2026-07-11)', () => {
  // readDeadline chỉ nhận date-only 'YYYY-MM-DD' (tự append T23:59:59.999Z)
  const past = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)
  const makeCronDeps = () => ({
    repo: {
      findPendingTimeBoundConditions: jest.fn().mockResolvedValue([
        { id: 'c1', thresholdConfig: { deadline: past, chapterTarget: 24, payoutAmount: 100 } },
        { id: 'c2', thresholdConfig: { deadline: past, chapterTarget: 12, payoutAmount: 50 } }
      ]),
      markConditionMissed: jest.fn().mockResolvedValue(undefined)
    },
    eventEmitter: { emit: jest.fn() },
    redis: { setNxEx: jest.fn().mockResolvedValue(true) }
  })
  const make = (d: ReturnType<typeof makeCronDeps>) =>
    new PaymentEngineService(d.repo as never, d.eventEmitter as never, d.redis as never)

  it('marks overdue TIME_BOUND conditions as MISSED', async () => {
    const d = makeCronDeps()
    await make(d).markMissedTimeBoundConditions()
    expect(d.repo.markConditionMissed).toHaveBeenCalledWith('c1')
    expect(d.repo.markConditionMissed).toHaveBeenCalledWith('c2')
  })

  it('skips the tick when the Redis lock is not acquired (multi-instance)', async () => {
    const d = makeCronDeps()
    d.redis.setNxEx = jest.fn().mockResolvedValue(false)
    await make(d).markMissedTimeBoundConditions()
    expect(d.repo.findPendingTimeBoundConditions).not.toHaveBeenCalled()
  })

  it('one failing condition does not stop the rest (per-item resilience)', async () => {
    const d = makeCronDeps()
    d.repo.markConditionMissed = jest
      .fn()
      .mockRejectedValueOnce(new Error('mongo blip'))
      .mockResolvedValueOnce(undefined)
    await expect(make(d).markMissedTimeBoundConditions()).resolves.toBeUndefined()
    expect(d.repo.markConditionMissed).toHaveBeenCalledTimes(2)
  })

  it('repo scan failure is swallowed and logged (no unhandled rejection)', async () => {
    const d = makeCronDeps()
    d.repo.findPendingTimeBoundConditions = jest.fn().mockRejectedValue(new Error('mongo down'))
    await expect(make(d).markMissedTimeBoundConditions()).resolves.toBeUndefined()
  })
})
