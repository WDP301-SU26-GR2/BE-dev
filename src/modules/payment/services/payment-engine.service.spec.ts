import { ConditionType, PaymentConditionStatus, PaymentType } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { PaymentEngineService } from './payment-engine.service'
import { PaymentConditionTriggerService } from './payment-condition-trigger.service'
import { PaymentScheduleTriggerService } from './payment-schedule-trigger.service'
import { PaymentTriggerService } from './payment-trigger.service'

function makeEngine(repo: unknown, eventEmitter: unknown, redis: unknown, cronMetrics?: unknown) {
  const trigger = new PaymentTriggerService(repo as never, eventEmitter as never)
  const conditionTrigger = new PaymentConditionTriggerService(repo as never, trigger)
  const scheduleTrigger = new PaymentScheduleTriggerService(repo as never, redis as never, cronMetrics as never)
  return new PaymentEngineService(conditionTrigger, scheduleTrigger, trigger)
}

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
    const svc = makeEngine(repo, eventEmitter, { setNxEx: jest.fn().mockResolvedValue(true) })
    await svc.handleSeriesHiatusStarted({ seriesId: 's1' })
    expect(repo.pauseTimeBoundConditions).toHaveBeenCalledWith('s1')
    expect(repo.findDisabledTimeBoundConditions).not.toHaveBeenCalled()
    expect(repo.resumeTimeBoundCondition).not.toHaveBeenCalled()
  })

  it('handleSeriesHiatusEnded resumes TIME_BOUND conditions and shifts deadline forward by pausedMs', async () => {
    const repo = makeRepo()
    const eventEmitter = { emit: jest.fn() }
    const svc = makeEngine(repo, eventEmitter, { setNxEx: jest.fn().mockResolvedValue(true) })
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
    const svc = makeEngine(repo, eventEmitter, { setNxEx: jest.fn().mockResolvedValue(true) })
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
    const svc = makeEngine(repo, eventEmitter, { setNxEx: jest.fn().mockResolvedValue(true) })

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
  const make = (d: ReturnType<typeof makeCronDeps>) => makeEngine(d.repo, d.eventEmitter, d.redis)

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

// ─────────────────────────────────────────────────────────────────────────────
// S-03 idempotency (BACKEND_AUDIT_2026-07-20)
// ─────────────────────────────────────────────────────────────────────────────
describe('PaymentEngineService — idempotency của createPaymentOnce', () => {
  const makeDeps = () => ({
    repo: {
      existsPayment: jest.fn().mockResolvedValue(null),
      createTriggeredPayment: jest.fn().mockResolvedValue({
        id: 'p1',
        contractId: 'ct1',
        receiverId: 'u1',
        amount: 100
      })
    },
    eventEmitter: { emit: jest.fn() },
    redis: { setNxEx: jest.fn().mockResolvedValue(true) }
  })
  const make = (d: ReturnType<typeof makeDeps>) => makeEngine(d.repo, d.eventEmitter, d.redis)

  const contract = {
    id: 'ct1',
    seriesId: 's1',
    mangakaId: 'u1',
    publisherOwnershipPct: 70,
    valuationAmount: 1000
  } as never

  // Race: hai event đồng thời cùng vượt qua existsPayment → DB unique index chặn
  // request thua bằng P2002. Engine phải nuốt đúng lỗi đó và trả null (đã tồn tại),
  // KHÔNG được ném 500 lên client và KHÔNG được emit payment.triggered lần hai.
  it('P2002 từ unique index → trả null, không emit payment.triggered', async () => {
    const d = makeDeps()
    // Dùng ĐÚNG class Prisma ném ra thật — isUniqueConstrainError check `instanceof`,
    // mock bằng plain Error sẽ xanh giả rồi vỡ lúc runtime (bài học mock-blindspot §41.3).
    d.repo.createTriggeredPayment = jest
      .fn()
      .mockRejectedValue(
        new PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })
      )

    await expect(make(d).generateCompensationPayment(contract, 500)).resolves.toBeNull()
    expect(d.eventEmitter.emit).not.toHaveBeenCalled()
  })

  // Lỗi DB khác (không phải trùng khoá) vẫn phải nổi lên — không được nuốt im lặng.
  it('lỗi DB khác P2002 vẫn ném ra ngoài', async () => {
    const d = makeDeps()
    d.repo.createTriggeredPayment = jest.fn().mockRejectedValue(new Error('mongo down'))
    await expect(make(d).generateCompensationPayment(contract, 500)).rejects.toThrow('mongo down')
  })

  it('đường bình thường vẫn emit payment.triggered đúng một lần', async () => {
    const d = makeDeps()
    await make(d).generateCompensationPayment(contract, 500)
    expect(d.eventEmitter.emit).toHaveBeenCalledTimes(1)
    expect(d.eventEmitter.emit).toHaveBeenCalledWith('payment.triggered', expect.objectContaining({ paymentId: 'p1' }))
  })
})

describe('PaymentEngineService — milestone, ranking and revenue decision branches', () => {
  const baseContract = {
    id: 'ct1',
    seriesId: 's1',
    mangakaId: 'm1',
    mangakaOwnershipPct: 30,
    publisherOwnershipPct: 70,
    valuationAmount: 10_000,
    conditions: []
  }

  const makeDeps = () => ({
    repo: {
      findEligibleContracts: jest.fn().mockResolvedValue([]),
      findRankingConditions: jest.fn().mockResolvedValue([]),
      findContractForPaymentEngine: jest.fn(),
      existsPayment: jest.fn().mockResolvedValue(null),
      createTriggeredPayment: jest
        .fn()
        .mockImplementation((data: Record<string, unknown>) =>
          Promise.resolve({ id: `p-${String(data.period)}`, ...data })
        ),
      markConditionAchieved: jest.fn().mockResolvedValue(undefined),
      updateConditionLastTriggeredValue: jest.fn().mockResolvedValue(undefined),
      findExecutedTransferContractBySeriesId: jest.fn().mockResolvedValue(null)
    },
    eventEmitter: { emit: jest.fn() },
    redis: { setNxEx: jest.fn().mockResolvedValue(true) }
  })

  const make = (deps: ReturnType<typeof makeDeps>) => makeEngine(deps.repo, deps.eventEmitter, deps.redis)

  it.each([undefined, 0, -1])('ignores invalid chapter numbers (%s)', async (chapterNumber) => {
    const deps = makeDeps()

    await make(deps).handleChapterPublished({ chapterId: 'ch1', seriesId: 's1', chapterNumber })

    expect(deps.repo.findEligibleContracts).not.toHaveBeenCalled()
    expect(deps.repo.createTriggeredPayment).not.toHaveBeenCalled()
  })

  it('triggers a reached chapter milestone and marks it achieved', async () => {
    const deps = makeDeps()
    deps.repo.findEligibleContracts.mockResolvedValue([
      {
        ...baseContract,
        conditions: [
          {
            id: 'cond1',
            conditionType: ConditionType.CHAPTER_MILESTONE,
            status: PaymentConditionStatus.PENDING,
            thresholdConfig: { chapter: 10 },
            payoutAmount: 500,
            payoutPct: null
          }
        ]
      }
    ])

    await make(deps).handleChapterPublished({ chapterId: 'ch10', seriesId: 's1', chapterNumber: 10 })

    expect(deps.repo.createTriggeredPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        conditionId: 'cond1',
        amount: 500,
        paymentType: PaymentType.CHAPTER_MILESTONE,
        period: 'chapter:10'
      })
    )
    expect(deps.repo.markConditionAchieved).toHaveBeenCalledWith('cond1', { lastTriggeredValue: 10 })
  })

  it('does not trigger pending chapter milestones before their threshold', async () => {
    const deps = makeDeps()
    deps.repo.findEligibleContracts.mockResolvedValue([
      {
        ...baseContract,
        conditions: [
          {
            id: 'cond1',
            conditionType: ConditionType.CHAPTER_MILESTONE,
            status: PaymentConditionStatus.PENDING,
            thresholdConfig: { chapter: 10 },
            payoutAmount: 500
          },
          {
            id: 'cond2',
            conditionType: ConditionType.CHAPTER_MILESTONE,
            status: PaymentConditionStatus.ACHIEVED,
            thresholdConfig: { chapter: 1 },
            payoutAmount: 500
          }
        ]
      }
    ])

    await make(deps).handleChapterPublished({ chapterId: 'ch5', seriesId: 's1', chapterNumber: 5 })

    expect(deps.repo.createTriggeredPayment).not.toHaveBeenCalled()
    expect(deps.repo.markConditionAchieved).not.toHaveBeenCalled()
  })

  it('catches up recurring milestones from lastTriggeredValue through the published chapter', async () => {
    const deps = makeDeps()
    deps.repo.findEligibleContracts.mockResolvedValue([
      {
        ...baseContract,
        conditions: [
          {
            id: 'cond-recurring',
            conditionType: ConditionType.RECURRING_CHAPTER,
            status: PaymentConditionStatus.PENDING,
            thresholdConfig: { every: 3 },
            lastTriggeredValue: 3,
            payoutAmount: null,
            payoutPct: 5
          }
        ]
      }
    ])

    await make(deps).handleChapterPublished({ chapterId: 'ch10', seriesId: 's1', chapterNumber: 10 })

    expect(deps.repo.createTriggeredPayment).toHaveBeenCalledTimes(2)
    expect(deps.repo.createTriggeredPayment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ amount: 500, period: 'chapter:6' })
    )
    expect(deps.repo.createTriggeredPayment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ amount: 500, period: 'chapter:9' })
    )
    expect(deps.repo.updateConditionLastTriggeredValue).toHaveBeenNthCalledWith(1, 'cond-recurring', 6)
    expect(deps.repo.updateConditionLastTriggeredValue).toHaveBeenNthCalledWith(2, 'cond-recurring', 9)
  })

  it('does not mark a milestone achieved when its calculated payout is zero', async () => {
    const deps = makeDeps()
    deps.repo.findEligibleContracts.mockResolvedValue([
      {
        ...baseContract,
        conditions: [
          {
            id: 'cond-zero',
            conditionType: ConditionType.CHAPTER_MILESTONE,
            status: PaymentConditionStatus.PENDING,
            thresholdConfig: { chapter: 1 },
            payoutAmount: null,
            payoutPct: null
          }
        ]
      }
    ])

    await make(deps).handleChapterPublished({ chapterId: 'ch1', seriesId: 's1', chapterNumber: 1 })

    expect(deps.repo.createTriggeredPayment).not.toHaveBeenCalled()
    expect(deps.repo.markConditionAchieved).not.toHaveBeenCalled()
  })

  it('ignores an empty ranking result without querying conditions', async () => {
    const deps = makeDeps()

    await make(deps).handleRankingFinalized({ surveyPeriodId: 'survey1', rankings: [] })

    expect(deps.repo.findRankingConditions).not.toHaveBeenCalled()
  })

  it('triggers only ranking conditions whose rank reaches their configured topRank', async () => {
    const deps = makeDeps()
    deps.repo.findRankingConditions.mockResolvedValue([
      {
        id: 'rank-hit',
        contract: baseContract,
        thresholdConfig: { topRank: 3 },
        payoutAmount: 300,
        payoutPct: null
      },
      {
        id: 'rank-miss',
        contract: { ...baseContract, id: 'ct2', seriesId: 's2' },
        thresholdConfig: { topRank: 2 },
        payoutAmount: 300,
        payoutPct: null
      },
      {
        id: 'rank-invalid',
        contract: { ...baseContract, id: 'ct3', seriesId: 's3' },
        thresholdConfig: { topRank: 'one' },
        payoutAmount: 300,
        payoutPct: null
      }
    ])

    await make(deps).handleRankingFinalized({
      surveyPeriodId: 'survey1',
      rankings: [
        { seriesId: 's1', rank: 2 },
        { seriesId: 's2', rank: 5 },
        { seriesId: 's3', rank: 1 }
      ]
    })

    expect(deps.repo.createTriggeredPayment).toHaveBeenCalledTimes(1)
    expect(deps.repo.createTriggeredPayment).toHaveBeenCalledWith(
      expect.objectContaining({ conditionId: 'rank-hit', period: 'survey:survey1' })
    )
    expect(deps.repo.markConditionAchieved).toHaveBeenCalledTimes(1)
    expect(deps.repo.markConditionAchieved).toHaveBeenCalledWith('rank-hit')
  })

  it.each([0, -10])('ignores non-positive revenue (%s)', async (revenue) => {
    const deps = makeDeps()

    await make(deps).handleRevenueReported({ contractId: 'ct1', revenue, period: '2026-07' })

    expect(deps.repo.findContractForPaymentEngine).not.toHaveBeenCalled()
  })

  it('does not generate revenue payments for a missing contract', async () => {
    const deps = makeDeps()
    deps.repo.findContractForPaymentEngine.mockResolvedValue(null)

    await make(deps).handleRevenueReported({ contractId: 'ct1', revenue: 1000, period: '2026-07' })

    expect(deps.repo.createTriggeredPayment).not.toHaveBeenCalled()
  })

  it('pays the mangaka ownership share for a single-owner series', async () => {
    const deps = makeDeps()
    deps.repo.findContractForPaymentEngine.mockResolvedValue({
      ...baseContract,
      series: { id: 's1', mangakaId: 'm1', coOwnerId: null }
    })

    await make(deps).handleRevenueReported({ contractId: 'ct1', revenue: 1000, period: '2026-07' })

    expect(deps.repo.createTriggeredPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: 'm1',
        amount: 300,
        paymentType: PaymentType.REVENUE_SHARE,
        period: '2026-07'
      })
    )
  })

  it('uses the executed transfer ownership split for co-owned revenue', async () => {
    const deps = makeDeps()
    const contract = {
      ...baseContract,
      series: { id: 's1', mangakaId: 'm1', coOwnerId: 'm2' }
    }
    deps.repo.findExecutedTransferContractBySeriesId.mockResolvedValue({
      newOwnershipSplit: { m1: 20, m2: 10 }
    })

    await make(deps).generateRevenueSharePayments(contract as never, 1000, '2026-07')

    expect(deps.repo.createTriggeredPayment).toHaveBeenCalledTimes(2)
    expect(deps.repo.createTriggeredPayment).toHaveBeenCalledWith(
      expect.objectContaining({ receiverId: 'm1', amount: 200 })
    )
    expect(deps.repo.createTriggeredPayment).toHaveBeenCalledWith(
      expect.objectContaining({ receiverId: 'm2', amount: 100 })
    )
  })

  it('falls back to an equal mangaka share when transfer ownership split is unusable', async () => {
    const deps = makeDeps()
    const contract = {
      ...baseContract,
      series: { id: 's1', mangakaId: 'm1', coOwnerId: 'm2' }
    }
    deps.repo.findExecutedTransferContractBySeriesId.mockResolvedValue({ newOwnershipSplit: { note: 'legacy' } })

    await make(deps).generateRevenueSharePayments(contract as never, 1000, '2026-07')

    expect(deps.repo.createTriggeredPayment).toHaveBeenCalledWith(
      expect.objectContaining({ receiverId: 'm1', amount: 150 })
    )
    expect(deps.repo.createTriggeredPayment).toHaveBeenCalledWith(
      expect.objectContaining({ receiverId: 'm2', amount: 150 })
    )
  })
})
