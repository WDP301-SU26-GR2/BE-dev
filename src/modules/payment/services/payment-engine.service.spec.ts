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
    const svc = new PaymentEngineService(repo as never, eventEmitter as never)
    await svc.handleSeriesHiatusStarted({ seriesId: 's1' })
    expect(repo.pauseTimeBoundConditions).toHaveBeenCalledWith('s1')
    expect(repo.findDisabledTimeBoundConditions).not.toHaveBeenCalled()
    expect(repo.resumeTimeBoundCondition).not.toHaveBeenCalled()
  })

  it('handleSeriesHiatusEnded resumes TIME_BOUND conditions and shifts deadline forward by pausedMs', async () => {
    const repo = makeRepo()
    const eventEmitter = { emit: jest.fn() }
    const svc = new PaymentEngineService(repo as never, eventEmitter as never)
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
    const svc = new PaymentEngineService(repo as never, eventEmitter as never)
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
    const svc = new PaymentEngineService(repo as never, eventEmitter as never)

    await svc.handleSeriesCancelling({ seriesId: 's1' })

    expect(repo.findEligibleContracts).toHaveBeenCalledWith('s1')
    expect(repo.markPendingConditionsMissedByContract).toHaveBeenCalledWith('k1')
    expect(repo.createTriggeredPayment).toHaveBeenCalled()
    expect(repo.terminateContractsBySeries).toHaveBeenCalledWith('s1')
  })
})
