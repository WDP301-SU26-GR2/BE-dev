import {
  ConditionType,
  ContractStatus,
  ContractType,
  PaymentConditionStatus,
  PaymentRecordStatus,
  PaymentSource,
  PaymentType
} from '@prisma/client'
import { DAY, requiredAccount } from './demo-seed.helpers'
import { DemoContext, SeriesSeed } from './demo-seed.types'

export const createExecutedContract = async (context: DemoContext, series: SeriesSeed) => {
  const contract = await context.prisma.contract.create({
    data: {
      seriesId: series.id,
      mangakaId: series.mangakaId,
      editorId: series.editorId,
      contractType: ContractType.REVENUE_SHARE,
      valuationAmount: 350_000_000,
      publisherOwnershipPct: 70,
      mangakaOwnershipPct: 30,
      terminationClause: 'Mốc đã đạt vẫn trả; compensation 10% phần định giá còn lại nếu hủy không do breach.',
      contractStart: new Date(context.now.getTime() - 60 * DAY),
      contractEnd: new Date(context.now.getTime() + 720 * DAY),
      status: ContractStatus.FULLY_EXECUTED,
      mangakaSignedAt: new Date(context.now.getTime() - 58 * DAY),
      boardSignedAt: new Date(context.now.getTime() - 57 * DAY)
    }
  })
  const recurring = await context.prisma.paymentCondition.create({
    data: {
      contractId: contract.id,
      conditionType: ConditionType.RECURRING_CHAPTER,
      thresholdConfig: { everyNChapters: 4, payoutAmount: 25_000_000 },
      payoutAmount: 25_000_000,
      isRecurring: true,
      status: PaymentConditionStatus.PENDING,
      lastTriggeredValue: 8
    }
  })
  await context.prisma.paymentCondition.create({
    data: {
      contractId: contract.id,
      conditionType: ConditionType.RANKING_MILESTONE,
      thresholdConfig: { rankThreshold: 3, consecutivePeriods: 4, payoutAmount: 40_000_000 },
      payoutAmount: 40_000_000,
      status: PaymentConditionStatus.PENDING
    }
  })
  const receiver = series.mangakaId
  for (let milestone = 4; milestone <= 8; milestone += 4) {
    await context.prisma.paymentRecord.create({
      data: {
        contractId: contract.id,
        conditionId: recurring.id,
        receiverId: receiver,
        seriesId: series.id,
        description: `Thanh toán recurring khi đạt ${milestone} chương`,
        paymentType: PaymentType.RECURRING_CHAPTER,
        paymentSource: PaymentSource.CONTRACT,
        amount: 25_000_000,
        period: `chapter:${milestone}`,
        status: milestone === 4 ? PaymentRecordStatus.PAID : PaymentRecordStatus.APPROVED,
        approvedBy: requiredAccount(context.accounts, 'board.aya').id,
        approvedAt: new Date(context.now.getTime() - (12 - milestone) * DAY),
        paidAt: milestone === 4 ? new Date(context.now.getTime() - 7 * DAY) : null,
        paymentMethod: milestone === 4 ? 'BANK_TRANSFER' : null,
        transactionReference: milestone === 4 ? 'DEMO-NEON-RONIN-CH4' : null,
        createdBy: series.editorId
      }
    })
  }
  return contract
}
