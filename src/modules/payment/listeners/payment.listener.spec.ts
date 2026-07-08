import { PaymentListener } from './payment.listener'

describe('PaymentListener', () => {
  const engine = {
    handleRankingFinalized: jest.fn(),
    handleRevenueReported: jest.fn(),
    handleChapterPublished: jest.fn(),
    handleSeriesCancelling: jest.fn(),
    handleSeriesHiatusStarted: jest.fn(),
    handleSeriesHiatusEnded: jest.fn()
  }
  // Cast to bypass jest.Mock typing — tests don't exercise the real engine surface.
  const listener = new PaymentListener(engine as never)

  it('forwards ranking.finalized with rankings[]', () => {
    void listener.handleRankingFinalized({ surveyPeriodId: 's1', rankings: [{ seriesId: 'x', rank: 1 }] })
    expect(engine.handleRankingFinalized).toHaveBeenCalledWith({
      surveyPeriodId: 's1',
      rankings: [{ seriesId: 'x', rank: 1 }]
    })
  })

  it('defaults rankings to [] when absent', () => {
    void listener.handleRankingFinalized({ surveyPeriodId: 's2' })
    expect(engine.handleRankingFinalized).toHaveBeenCalledWith({ surveyPeriodId: 's2', rankings: [] })
  })

  it('forwards contract.revenue_reported payload', () => {
    void listener.handleRevenueReported({ contractId: 'c1', revenue: 1000, period: '2026Q1' })
    expect(engine.handleRevenueReported).toHaveBeenCalledWith({ contractId: 'c1', revenue: 1000, period: '2026Q1' })
  })
})
