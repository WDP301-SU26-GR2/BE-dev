import { PaymentListener } from './payment.listener'

describe('PaymentListener domain event routing', () => {
  const make = () => {
    const engine = {
      handleChapterPublished: jest.fn(),
      handleRankingFinalized: jest.fn(),
      handleSeriesCancelling: jest.fn(),
      handleRevenueReported: jest.fn(),
      handleSeriesHiatusStarted: jest.fn(),
      handleSeriesHiatusEnded: jest.fn()
    }
    return { listener: new PaymentListener(engine as never), engine }
  }

  it('routes chapter publication without changing milestone data', async () => {
    const { listener, engine } = make()
    const payload = { chapterId: 'ch1', seriesId: 's1', chapterNumber: 10 }

    await listener.handleChapterPublished(payload)

    expect(engine.handleChapterPublished).toHaveBeenCalledWith(payload)
  })

  it('normalizes missing rankings to an empty collection', async () => {
    const { listener, engine } = make()

    await listener.handleRankingFinalized({ surveyPeriodId: 'survey1' })

    expect(engine.handleRankingFinalized).toHaveBeenCalledWith({ surveyPeriodId: 'survey1', rankings: [] })
  })

  it('preserves supplied rankings', async () => {
    const { listener, engine } = make()
    const rankings = [{ seriesId: 's1', rank: 1 }]

    await listener.handleRankingFinalized({ surveyPeriodId: 'survey1', rankings })

    expect(engine.handleRankingFinalized).toHaveBeenCalledWith({ surveyPeriodId: 'survey1', rankings })
  })

  it('routes cancellation, revenue and hiatus lifecycle events', async () => {
    const { listener, engine } = make()
    const cancellation = { seriesId: 's1' }
    const revenue = { contractId: 'ct1', revenue: 1000, period: '2026-07' }
    const hiatusStart = { seriesId: 's1' }
    const hiatusEnd = { seriesId: 's1', pausedMs: 1000 }

    await listener.handleSeriesCancelling(cancellation)
    await listener.handleRevenueReported(revenue)
    await listener.handleSeriesHiatusStarted(hiatusStart)
    await listener.handleSeriesHiatusEnded(hiatusEnd)

    expect(engine.handleSeriesCancelling).toHaveBeenCalledWith(cancellation)
    expect(engine.handleRevenueReported).toHaveBeenCalledWith(revenue)
    expect(engine.handleSeriesHiatusStarted).toHaveBeenCalledWith(hiatusStart)
    expect(engine.handleSeriesHiatusEnded).toHaveBeenCalledWith(hiatusEnd)
  })
})
