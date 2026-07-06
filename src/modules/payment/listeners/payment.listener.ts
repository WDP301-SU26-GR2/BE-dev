import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { PaymentEngineService } from '../services/payment-engine.service'
import { DomainEvent } from 'src/core/events/domain-events'

@Injectable()
export class PaymentListener {
  constructor(private readonly paymentEngineService: PaymentEngineService) {}

  @OnEvent('chapter.published')
  handleChapterPublished(payload: { chapterId: string; seriesId: string; chapterNumber?: number }) {
    return this.paymentEngineService.handleChapterPublished(payload)
  }

  @OnEvent('ranking.finalized')
  handleRankingFinalized(payload: { surveyPeriodId: string; rankings?: Array<{ seriesId: string; rank: number }> }) {
    return this.paymentEngineService.handleRankingFinalized({
      surveyPeriodId: payload.surveyPeriodId,
      rankings: payload.rankings ?? []
    })
  }

  @OnEvent('series.cancelling')
  handleSeriesCancelling(payload: { seriesId: string }) {
    return this.paymentEngineService.handleSeriesCancelling(payload)
  }

  @OnEvent('contract.revenue_reported')
  handleRevenueReported(payload: { contractId: string; revenue: number; period: string }) {
    return this.paymentEngineService.handleRevenueReported(payload)
  }

  @OnEvent(DomainEvent.SeriesHiatusStarted)
  handleSeriesHiatusStarted(payload: { seriesId: string }) {
    return this.paymentEngineService.handleSeriesHiatusStarted(payload)
  }

  @OnEvent(DomainEvent.SeriesHiatusEnded)
  handleSeriesHiatusEnded(payload: { seriesId: string; pausedMs: number }) {
    return this.paymentEngineService.handleSeriesHiatusEnded(payload)
  }
}
