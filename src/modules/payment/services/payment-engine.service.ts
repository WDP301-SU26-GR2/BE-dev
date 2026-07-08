import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { EventEmitter2 } from '@nestjs/event-emitter'
import {
  ConditionType,
  Contract,
  PaymentCondition,
  PaymentConditionStatus,
  PaymentSource,
  PaymentType
} from '@prisma/client'
import { PaymentRecordRepo } from '../payment.repo'

type ChapterPublishedPayload = {
  chapterId: string
  seriesId: string
  chapterNumber?: number
}

type RankingFinalizedPayload = {
  surveyPeriodId: string
  rankings: Array<{ seriesId: string; rank: number }>
}

type SeriesCancellingPayload = {
  seriesId: string
}

type RevenueReportedPayload = {
  contractId: string
  revenue: number
  period: string
}

type ContractWithSeries = Contract & {
  series?: {
    id: string
    mangakaId: string
    coOwnerId: string | null
  }
}

@Injectable()
export class PaymentEngineService {
  private readonly logger = new Logger(PaymentEngineService.name)

  constructor(
    private readonly paymentRepo: PaymentRecordRepo,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async handleChapterPublished(payload: ChapterPublishedPayload): Promise<void> {
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

  async handleRankingFinalized(payload: RankingFinalizedPayload): Promise<void> {
    if (!payload.rankings.length) return

    const rankingBySeriesId = new Map(payload.rankings.map((ranking) => [ranking.seriesId, ranking.rank]))
    const conditions = await this.paymentRepo.findRankingConditions([...rankingBySeriesId.keys()])

    for (const condition of conditions) {
      const rank = rankingBySeriesId.get(condition.contract.seriesId)
      const topRank = this.readPositiveNumber(condition.thresholdConfig, 'topRank')
      if (!rank || !topRank || rank > topRank) continue

      const payment = await this.generateTriggeredPayment({
        contract: condition.contract,
        condition,
        paymentType: PaymentType.RANKING_MILESTONE,
        period: `survey:${payload.surveyPeriodId}`,
        description: `Ranking milestone achieved: top ${topRank}`
      })

      if (payment) {
        await this.paymentRepo.markConditionAchieved(condition.id)
      }
    }
  }

  async handleSeriesCancelling(payload: SeriesCancellingPayload): Promise<void> {
    const contracts = await this.paymentRepo.findEligibleContracts(payload.seriesId)

    for (const contract of contracts) {
      await this.paymentRepo.markPendingConditionsMissedByContract(contract.id)

      const compensationAmount = this.extractCompensationAmount(contract)
      if (compensationAmount > 0) {
        await this.generateCompensationPayment(contract, compensationAmount)
      }
    }

    // B-CON-09: terminate all FULLY_EXECUTED contracts of the series after compensation is generated.
    await this.paymentRepo.terminateContractsBySeries(payload.seriesId)
  }

  async handleRevenueReported(payload: RevenueReportedPayload): Promise<void> {
    if (payload.revenue <= 0) return

    const contract = await this.paymentRepo.findContractForPaymentEngine(payload.contractId)
    if (!contract) return

    await this.generateRevenueSharePayments(contract, payload.revenue, payload.period)
  }

  // B-CON-10: pause — flip TIME_BOUND PENDING -> DISABLED so cron markMissed stops counting.
  async handleSeriesHiatusStarted(payload: { seriesId: string }): Promise<void> {
    await this.paymentRepo.pauseTimeBoundConditions(payload.seriesId)
  }

  // B-CON-10: resume — re-activate paused TIME_BOUND conditions and shift deadline forward by pausedMs.
  async handleSeriesHiatusEnded(payload: { seriesId: string; pausedMs: number }): Promise<void> {
    const conditions = await this.paymentRepo.findDisabledTimeBoundConditions(payload.seriesId)
    for (const condition of conditions) {
      const shifted = this.shiftDeadline(condition.thresholdConfig, payload.pausedMs)
      await this.paymentRepo.resumeTimeBoundCondition(condition.id, shifted)
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markMissedTimeBoundConditions(): Promise<void> {
    const now = new Date()
    const conditions = await this.paymentRepo.findPendingTimeBoundConditions()

    for (const condition of conditions) {
      const deadline = this.readDeadline(condition.thresholdConfig)
      if (deadline && deadline < now) {
        await this.paymentRepo.markConditionMissed(condition.id)
      }
    }
  }

  async generateTriggeredPayment(params: {
    contract: ContractWithSeries
    condition: PaymentCondition
    paymentType: PaymentType
    period: string
    description: string
  }) {
    const amount = this.calculateConditionAmount(params.contract, params.condition)
    if (amount <= 0) return null

    return this.createPaymentOnce({
      contractId: params.contract.id,
      conditionId: params.condition.id,
      receiverId: params.contract.mangakaId,
      seriesId: params.contract.seriesId,
      amount,
      paymentType: params.paymentType,
      period: params.period,
      description: params.description
    })
  }

  async generateRevenueSharePayments(contract: ContractWithSeries, revenue: number, period: string) {
    const receivers = await this.resolveRevenueShareReceivers(contract)
    const publisherPct =
      contract.publisherOwnershipPct ?? Math.max(0, 100 - receivers.reduce((sum, r) => sum + r.pct, 0))
    const publisherAmount = (revenue * publisherPct) / 100
    this.logger.debug(`Publisher revenue share retained for contract ${contract.id}: ${publisherAmount}`)

    const payments: unknown[] = []
    for (const receiver of receivers) {
      const amount = (revenue * receiver.pct) / 100
      const payment = await this.createPaymentOnce({
        contractId: contract.id,
        conditionId: null,
        receiverId: receiver.receiverId,
        seriesId: contract.seriesId,
        amount,
        paymentType: PaymentType.REVENUE_SHARE,
        period,
        description: `Revenue share for period ${period}`
      })
      if (payment) payments.push(payment)
    }

    return payments
  }

  async generateCompensationPayment(contract: ContractWithSeries, amount: number) {
    return this.createPaymentOnce({
      contractId: contract.id,
      conditionId: null,
      receiverId: contract.mangakaId,
      seriesId: contract.seriesId,
      amount,
      paymentType: PaymentType.COMPENSATION,
      period: `termination:${contract.seriesId}`,
      description: 'Contract termination compensation',
      paymentSource: PaymentSource.TERMINATION
    })
  }

  private async handleChapterMilestone(
    contract: ContractWithSeries,
    condition: PaymentCondition,
    chapterNumber: number
  ): Promise<void> {
    if (condition.status !== PaymentConditionStatus.PENDING) return

    const thresholdChapter = this.readPositiveNumber(condition.thresholdConfig, 'chapter')
    if (!thresholdChapter || chapterNumber < thresholdChapter) return

    const payment = await this.generateTriggeredPayment({
      contract,
      condition,
      paymentType: PaymentType.CHAPTER_MILESTONE,
      period: `chapter:${thresholdChapter}`,
      description: `Chapter milestone achieved at chapter ${thresholdChapter}`
    })

    if (payment) {
      await this.paymentRepo.markConditionAchieved(condition.id, { lastTriggeredValue: thresholdChapter })
    }
  }

  private async handleRecurringChapter(
    contract: ContractWithSeries,
    condition: PaymentCondition,
    chapterNumber: number
  ): Promise<void> {
    if (condition.status !== PaymentConditionStatus.PENDING) return

    const every = this.readPositiveNumber(condition.thresholdConfig, 'every')
    if (!every) return

    const lastTriggeredValue = condition.lastTriggeredValue ?? 0
    for (let milestone = lastTriggeredValue + every; milestone <= chapterNumber; milestone += every) {
      const payment = await this.generateTriggeredPayment({
        contract,
        condition,
        paymentType: PaymentType.RECURRING_CHAPTER,
        period: `chapter:${milestone}`,
        description: `Recurring chapter payout for chapter ${milestone}`
      })

      if (payment) {
        await this.paymentRepo.updateConditionLastTriggeredValue(condition.id, milestone)
      }
    }
  }

  private async createPaymentOnce(params: {
    contractId: string
    conditionId?: string | null
    receiverId: string
    seriesId?: string | null
    amount: number
    paymentType: PaymentType
    period?: string | null
    description?: string
    paymentSource?: PaymentSource
  }) {
    const existing = await this.paymentRepo.existsPayment({
      conditionId: params.conditionId ?? null,
      paymentType: params.paymentType,
      period: params.period ?? null,
      receiverId: params.receiverId,
      contractId: params.contractId
    })
    if (existing) return null

    const payment = await this.paymentRepo.createTriggeredPayment({
      ...params,
      paymentSource: params.paymentSource ?? PaymentSource.CONTRACT
    })

    this.eventEmitter.emit('payment.triggered', {
      paymentId: payment.id,
      contractId: payment.contractId,
      receiverId: payment.receiverId,
      amount: payment.amount
    })

    return payment
  }

  private calculateConditionAmount(contract: ContractWithSeries, condition: PaymentCondition): number {
    if (condition.payoutAmount != null) return condition.payoutAmount
    if (condition.payoutPct != null && contract.valuationAmount != null) {
      return (contract.valuationAmount * condition.payoutPct) / 100
    }
    return 0
  }

  private readPositiveNumber(config: unknown, key: string): number | null {
    if (!config || typeof config !== 'object') return null
    const value = (config as Record<string, unknown>)[key]
    return typeof value === 'number' && value > 0 ? value : null
  }

  private readDeadline(config: unknown): Date | null {
    if (!config || typeof config !== 'object') return null
    const deadline = (config as Record<string, unknown>).deadline
    if (typeof deadline !== 'string') return null

    const date = new Date(`${deadline}T23:59:59.999Z`)
    return Number.isNaN(date.getTime()) ? null : date
  }

  // B-CON-10: shift a date-only 'YYYY-MM-DD' deadline forward by pausedMs while preserving other keys.
  // Uses T00:00:00.000Z anchor so adding ms stays in UTC and slices cleanly back to a date string.
  private shiftDeadline(config: unknown, pausedMs: number): Record<string, unknown> {
    const base = config && typeof config === 'object' ? { ...(config as Record<string, unknown>) } : {}
    const deadline = base.deadline
    if (typeof deadline === 'string') {
      const shifted = new Date(new Date(`${deadline}T00:00:00.000Z`).getTime() + pausedMs)
      if (!Number.isNaN(shifted.getTime())) {
        base.deadline = shifted.toISOString().slice(0, 10)
      }
    }
    return base
  }

  private extractCompensationAmount(contract: ContractWithSeries): number {
    if (!contract.terminationClause) return 0

    try {
      const parsed = JSON.parse(contract.terminationClause) as Record<string, unknown>
      const fixedAmount = parsed.compensationAmount
      if (typeof fixedAmount === 'number' && fixedAmount > 0) return fixedAmount

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

  private async resolveRevenueShareReceivers(
    contract: ContractWithSeries
  ): Promise<Array<{ receiverId: string; pct: number }>> {
    const series = contract.series
    const mangakaPct = contract.mangakaOwnershipPct ?? 0
    if (!series?.coOwnerId) return [{ receiverId: contract.mangakaId, pct: mangakaPct }]

    const transferContract = await this.paymentRepo.findExecutedTransferContractBySeriesId(contract.seriesId)
    const split = this.readOwnershipSplit(transferContract?.newOwnershipSplit, series.mangakaId, series.coOwnerId)
    if (split) return split

    const half = mangakaPct / 2
    return [
      { receiverId: series.mangakaId, pct: half },
      { receiverId: series.coOwnerId, pct: half }
    ]
  }

  private readOwnershipSplit(
    split: unknown,
    mangakaId: string,
    coOwnerId: string
  ): Array<{ receiverId: string; pct: number }> | null {
    if (!split || typeof split !== 'object') return null

    const data = split as Record<string, unknown>
    const byUserId = [mangakaId, coOwnerId]
      .map((receiverId) => ({ receiverId, pct: data[receiverId] }))
      .filter((entry): entry is { receiverId: string; pct: number } => typeof entry.pct === 'number' && entry.pct > 0)

    if (byUserId.length) return byUserId

    const mangakaPct = data.mangakaPct ?? data.toMangakaPct
    const coOwnerPct = data.coOwnerPct ?? data.fromMangakaPct
    if (typeof mangakaPct === 'number' && typeof coOwnerPct === 'number') {
      return [
        { receiverId: mangakaId, pct: mangakaPct },
        { receiverId: coOwnerId, pct: coOwnerPct }
      ]
    }

    return null
  }
}
