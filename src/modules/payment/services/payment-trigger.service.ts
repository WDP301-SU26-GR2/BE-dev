import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PaymentCondition, PaymentSource, PaymentType } from '@prisma/client'
import { isUniqueConstrainError } from 'src/infrastructure/database/prisma-error.helper'
import { PaymentRecordRepo } from '../payment.repo'
import { ContractWithSeries } from './payment-trigger.types'

@Injectable()
export class PaymentTriggerService {
  private readonly logger = new Logger(PaymentTriggerService.name)

  constructor(
    private readonly paymentRepo: PaymentRecordRepo,
    private readonly eventEmitter: EventEmitter2
  ) {}

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
      contract.publisherOwnershipPct ?? Math.max(0, 100 - receivers.reduce((sum, receiver) => sum + receiver.pct, 0))
    this.logger.debug(`Publisher revenue share retained for contract ${contract.id}: ${(revenue * publisherPct) / 100}`)

    const payments: unknown[] = []
    for (const receiver of receivers) {
      const payment = await this.createPaymentOnce({
        contractId: contract.id,
        conditionId: null,
        receiverId: receiver.receiverId,
        seriesId: contract.seriesId,
        amount: (revenue * receiver.pct) / 100,
        paymentType: PaymentType.REVENUE_SHARE,
        period,
        description: `Revenue share for period ${period}`
      })
      if (payment) payments.push(payment)
    }
    return payments
  }

  generateCompensationPayment(contract: ContractWithSeries, amount: number) {
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

    let payment: Awaited<ReturnType<typeof this.paymentRepo.createTriggeredPayment>>
    try {
      payment = await this.paymentRepo.createTriggeredPayment({
        ...params,
        paymentSource: params.paymentSource ?? PaymentSource.CONTRACT
      })
    } catch (error) {
      if (isUniqueConstrainError(error)) {
        this.logger.warn(
          `createPaymentOnce: bỏ qua bản trùng (contract=${params.contractId}, type=${params.paymentType}, period=${params.period ?? 'null'})`
        )
        return null
      }
      throw error
    }
    this.eventEmitter.emit('payment.triggered', {
      paymentId: payment.id,
      contractId: payment.contractId,
      receiverId: payment.receiverId,
      amount: payment.amount
    })
    return payment
  }

  private calculateConditionAmount(contract: ContractWithSeries, condition: PaymentCondition) {
    if (condition.payoutAmount != null) return condition.payoutAmount
    if (condition.payoutPct != null && contract.valuationAmount != null) {
      return (contract.valuationAmount * condition.payoutPct) / 100
    }
    return 0
  }

  private async resolveRevenueShareReceivers(contract: ContractWithSeries) {
    const series = contract.series
    const mangakaPct = contract.mangakaOwnershipPct ?? 0
    if (!series?.coOwnerId) return [{ receiverId: contract.mangakaId, pct: mangakaPct }]
    const transfer = await this.paymentRepo.findExecutedTransferContractBySeriesId(contract.seriesId)
    const split = this.readOwnershipSplit(transfer?.newOwnershipSplit, series.mangakaId, series.coOwnerId)
    if (split) return split
    const half = mangakaPct / 2
    return [
      { receiverId: series.mangakaId, pct: half },
      { receiverId: series.coOwnerId, pct: half }
    ]
  }

  private readOwnershipSplit(split: unknown, mangakaId: string, coOwnerId: string) {
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
