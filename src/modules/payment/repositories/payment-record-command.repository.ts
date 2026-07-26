import {
  ConditionType,
  ContractStatus,
  PaymentConditionStatus,
  PaymentRecordStatus,
  PaymentSource,
  PaymentType,
  Prisma
} from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

export class PaymentRecordCommandRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: Prisma.PaymentRecordUncheckedCreateInput) {
    return this.prisma.paymentRecord.create({ data: dto })
  }

  update(id: string, dto: Prisma.PaymentRecordUncheckedUpdateInput) {
    return this.prisma.paymentRecord.update({ where: { id }, data: dto })
  }

  async updateWithExpectedStatus(
    id: string,
    expected: PaymentRecordStatus | { not: PaymentRecordStatus },
    dto: Prisma.PaymentRecordUpdateManyMutationInput
  ) {
    const result = await this.prisma.paymentRecord.updateMany({ where: { id, status: expected }, data: dto })
    if (result.count === 0) return null
    return this.prisma.paymentRecord.findUnique({ where: { id } })
  }

  createTriggeredPayment(data: {
    receiverId: string
    amount: number
    paymentType: PaymentType
    contractId: string
    conditionId?: string | null
    seriesId?: string | null
    period?: string | null
    description?: string
    createdBy?: string | null
    paymentSource?: PaymentSource
  }) {
    return this.prisma.paymentRecord.create({
      data: {
        receiverId: data.receiverId,
        amount: data.amount,
        paymentType: data.paymentType,
        paymentSource: data.paymentSource ?? PaymentSource.CONTRACT,
        contractId: data.contractId,
        conditionId: data.conditionId ?? null,
        seriesId: data.seriesId ?? null,
        period: data.period ?? null,
        description: data.description,
        createdBy: data.createdBy ?? undefined,
        status: PaymentRecordStatus.TRIGGERED
      }
    })
  }

  markConditionAchieved(conditionId: string, data?: { lastTriggeredValue?: number }) {
    return this.prisma.paymentCondition.update({
      where: { id: conditionId },
      data: {
        status: PaymentConditionStatus.ACHIEVED,
        achievedAt: new Date(),
        ...(data?.lastTriggeredValue !== undefined ? { lastTriggeredValue: data.lastTriggeredValue } : {})
      }
    })
  }

  updateConditionLastTriggeredValue(conditionId: string, lastTriggeredValue: number) {
    return this.prisma.paymentCondition.update({ where: { id: conditionId }, data: { lastTriggeredValue } })
  }

  markConditionMissed(conditionId: string) {
    return this.prisma.paymentCondition.update({
      where: { id: conditionId },
      data: { status: PaymentConditionStatus.MISSED }
    })
  }

  markPendingConditionsMissedByContract(contractId: string) {
    return this.prisma.paymentCondition.updateMany({
      where: { contractId, status: PaymentConditionStatus.PENDING },
      data: { status: PaymentConditionStatus.MISSED }
    })
  }

  pauseTimeBoundConditions(seriesId: string) {
    return this.prisma.paymentCondition.updateMany({
      where: {
        conditionType: ConditionType.TIME_BOUND,
        status: PaymentConditionStatus.PENDING,
        contract: { seriesId, status: ContractStatus.FULLY_EXECUTED }
      },
      data: { status: PaymentConditionStatus.DISABLED }
    })
  }

  resumeTimeBoundCondition(conditionId: string, thresholdConfig: Prisma.InputJsonValue) {
    return this.prisma.paymentCondition.update({
      where: { id: conditionId },
      data: { status: PaymentConditionStatus.PENDING, thresholdConfig }
    })
  }

  terminateContractsBySeries(seriesId: string) {
    return this.prisma.contract.updateMany({
      where: { seriesId, status: ContractStatus.FULLY_EXECUTED },
      data: { status: ContractStatus.TERMINATED }
    })
  }
}
