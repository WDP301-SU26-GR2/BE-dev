import { Injectable } from '@nestjs/common'
import { PaymentCondition, PaymentType } from '@prisma/client'
import { PaymentConditionTriggerService } from './payment-condition-trigger.service'
import { PaymentScheduleTriggerService } from './payment-schedule-trigger.service'
import { PaymentTriggerService } from './payment-trigger.service'
import { ContractWithSeries } from './payment-trigger.types'

@Injectable()
export class PaymentEngineService {
  constructor(
    private readonly conditionTriggerService: PaymentConditionTriggerService,
    private readonly scheduleTriggerService: PaymentScheduleTriggerService,
    private readonly triggerService: PaymentTriggerService
  ) {}

  handleChapterPublished(payload: { chapterId: string; seriesId: string; chapterNumber?: number }) {
    return this.conditionTriggerService.handleChapterPublished(payload)
  }
  handleRankingFinalized(payload: { surveyPeriodId: string; rankings: Array<{ seriesId: string; rank: number }> }) {
    return this.conditionTriggerService.handleRankingFinalized(payload)
  }
  handleSeriesCancelling(payload: { seriesId: string }) {
    return this.conditionTriggerService.handleSeriesCancelling(payload)
  }
  handleRevenueReported(payload: { contractId: string; revenue: number; period: string }) {
    return this.conditionTriggerService.handleRevenueReported(payload)
  }
  handleSeriesHiatusStarted(payload: { seriesId: string }) {
    return this.scheduleTriggerService.handleSeriesHiatusStarted(payload)
  }
  handleSeriesHiatusEnded(payload: { seriesId: string; pausedMs: number }) {
    return this.scheduleTriggerService.handleSeriesHiatusEnded(payload)
  }
  markMissedTimeBoundConditions() {
    return this.scheduleTriggerService.markMissedTimeBoundConditions()
  }
  generateTriggeredPayment(params: {
    contract: ContractWithSeries
    condition: PaymentCondition
    paymentType: PaymentType
    period: string
    description: string
  }) {
    return this.triggerService.generateTriggeredPayment(params)
  }
  generateRevenueSharePayments(contract: ContractWithSeries, revenue: number, period: string) {
    return this.triggerService.generateRevenueSharePayments(contract, revenue, period)
  }
  generateCompensationPayment(contract: ContractWithSeries, amount: number) {
    return this.triggerService.generateCompensationPayment(contract, amount)
  }
}
