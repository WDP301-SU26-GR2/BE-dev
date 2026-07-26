import { Injectable } from '@nestjs/common'
import { ConditionType, PaymentCondition, PaymentConditionStatus, PaymentType } from '@prisma/client'
import { PaymentRecordRepo } from '../payment.repo'
import { PaymentTriggerService } from './payment-trigger.service'
import { ContractWithSeries } from './payment-trigger.types'

@Injectable()
export class PaymentConditionTriggerService {
  constructor(
    private readonly paymentRepo: PaymentRecordRepo,
    private readonly triggerService: PaymentTriggerService
  ) {}

  async handleChapterPublished(payload: { chapterId: string; seriesId: string; chapterNumber?: number }) {
    if (!payload.chapterNumber || payload.chapterNumber <= 0) return
    const contracts = await this.paymentRepo.findEligibleContracts(payload.seriesId)
    for (const contract of contracts) {
      for (const condition of contract.conditions) {
        if (condition.conditionType === ConditionType.CHAPTER_MILESTONE) {
          await this.handleChapterMilestone(contract, condition, payload.chapterNumber)
        }
        if (condition.conditionType === ConditionType.RECURRING_CHAPTER) {
          await this.handleRecurringChapter(contract, condition, payload.chapterNumber)
        }
      }
    }
  }

  async handleRankingFinalized(payload: {
    surveyPeriodId: string
    rankings: Array<{ seriesId: string; rank: number }>
  }) {
    if (!payload.rankings.length) return
    const bySeriesId = new Map(payload.rankings.map((ranking) => [ranking.seriesId, ranking.rank]))
    const conditions = await this.paymentRepo.findRankingConditions([...bySeriesId.keys()])
    for (const condition of conditions) {
      const rank = bySeriesId.get(condition.contract.seriesId)
      const topRank = this.readPositiveNumber(condition.thresholdConfig, 'topRank')
      if (!rank || !topRank || rank > topRank) continue
      const payment = await this.triggerService.generateTriggeredPayment({
        contract: condition.contract,
        condition,
        paymentType: PaymentType.RANKING_MILESTONE,
        period: `survey:${payload.surveyPeriodId}`,
        description: `Ranking milestone achieved: top ${topRank}`
      })
      if (payment) await this.paymentRepo.markConditionAchieved(condition.id)
    }
  }

  async handleSeriesCancelling(payload: { seriesId: string }) {
    const contracts = await this.paymentRepo.findEligibleContracts(payload.seriesId)
    for (const contract of contracts) {
      await this.paymentRepo.markPendingConditionsMissedByContract(contract.id)
      const amount = this.extractCompensationAmount(contract)
      if (amount > 0) await this.triggerService.generateCompensationPayment(contract, amount)
    }
    await this.paymentRepo.terminateContractsBySeries(payload.seriesId)
  }

  async handleRevenueReported(payload: { contractId: string; revenue: number; period: string }) {
    if (payload.revenue <= 0) return
    const contract = await this.paymentRepo.findContractForPaymentEngine(payload.contractId)
    if (!contract) return
    await this.triggerService.generateRevenueSharePayments(contract, payload.revenue, payload.period)
  }

  private async handleChapterMilestone(
    contract: ContractWithSeries,
    condition: PaymentCondition,
    chapterNumber: number
  ) {
    if (condition.status !== PaymentConditionStatus.PENDING) return
    const threshold = this.readPositiveNumber(condition.thresholdConfig, 'chapter')
    if (!threshold || chapterNumber < threshold) return
    const payment = await this.triggerService.generateTriggeredPayment({
      contract,
      condition,
      paymentType: PaymentType.CHAPTER_MILESTONE,
      period: `chapter:${threshold}`,
      description: `Chapter milestone achieved at chapter ${threshold}`
    })
    if (payment) await this.paymentRepo.markConditionAchieved(condition.id, { lastTriggeredValue: threshold })
  }

  private async handleRecurringChapter(
    contract: ContractWithSeries,
    condition: PaymentCondition,
    chapterNumber: number
  ) {
    if (condition.status !== PaymentConditionStatus.PENDING) return
    const every = this.readPositiveNumber(condition.thresholdConfig, 'every')
    if (!every) return
    for (let milestone = (condition.lastTriggeredValue ?? 0) + every; milestone <= chapterNumber; milestone += every) {
      const payment = await this.triggerService.generateTriggeredPayment({
        contract,
        condition,
        paymentType: PaymentType.RECURRING_CHAPTER,
        period: `chapter:${milestone}`,
        description: `Recurring chapter payout for chapter ${milestone}`
      })
      if (payment) await this.paymentRepo.updateConditionLastTriggeredValue(condition.id, milestone)
    }
  }

  private readPositiveNumber(config: unknown, key: string) {
    if (!config || typeof config !== 'object') return null
    const value = (config as Record<string, unknown>)[key]
    return typeof value === 'number' && value > 0 ? value : null
  }

  private extractCompensationAmount(contract: ContractWithSeries) {
    if (!contract.terminationClause) return 0
    try {
      const parsed = JSON.parse(contract.terminationClause) as Record<string, unknown>
      const fixed = parsed.compensationAmount
      if (typeof fixed === 'number' && fixed > 0) return fixed
      const pct = parsed.compensationPct
      if (typeof pct === 'number' && pct > 0 && contract.valuationAmount) {
        return (contract.valuationAmount * pct) / 100
      }
    } catch {
      const match = contract.terminationClause.match(/compensation[^0-9]*(\d+(?:\.\d+)?)/i)
      if (match) return Number(match[1])
    }
    return 0
  }
}
