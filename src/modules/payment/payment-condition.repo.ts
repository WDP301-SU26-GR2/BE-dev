import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { ConditionType, PaymentCondition, PaymentConditionStatus, Prisma } from '@prisma/client'
import type { TransactionContext } from 'src/infrastructure/database/transaction-context'
import { transactionClient } from 'src/infrastructure/database/transaction-context'

@Injectable()
export class PaymentConditionRepo {
  constructor(private readonly prisma: PrismaService) {}

  findContractById(contractId: string) {
    return this.prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true, editorId: true, mangakaId: true }
    })
  }

  create(data: {
    contractId: string
    conditionType: ConditionType
    thresholdConfig: Prisma.InputJsonValue
    payoutAmount?: number
    payoutPct?: number
    isRecurring: boolean
  }): Promise<PaymentCondition> {
    return this.prisma.paymentCondition.create({
      data: {
        ...data,
        status: PaymentConditionStatus.PENDING
      }
    })
  }

  findManyByContractId(contractId: string): Promise<PaymentCondition[]> {
    return this.prisma.paymentCondition.findMany({
      where: { contractId },
      orderBy: { id: 'asc' }
    })
  }

  findByIdAndContractId(conditionId: string, contractId: string): Promise<PaymentCondition | null> {
    return this.prisma.paymentCondition.findFirst({
      where: { id: conditionId, contractId }
    })
  }

  update(
    conditionId: string,
    data: {
      thresholdConfig?: Prisma.InputJsonValue
      payoutAmount?: number
      payoutPct?: number
      isRecurring?: boolean
    }
  ): Promise<PaymentCondition> {
    return this.prisma.paymentCondition.update({
      where: { id: conditionId },
      data
    })
  }

  async compareAndSetStatus(
    conditionId: string,
    expected: PaymentConditionStatus,
    target: PaymentConditionStatus
  ): Promise<PaymentCondition | null> {
    const result = await this.prisma.paymentCondition.updateMany({
      where: { id: conditionId, status: expected },
      data: { status: target }
    })
    if (result.count !== 1) return null
    return this.prisma.paymentCondition.findUnique({ where: { id: conditionId } })
  }

  markPendingMissedInTransaction(context: TransactionContext, contractId: string) {
    return transactionClient(context).paymentCondition.updateMany({
      where: { contractId, status: PaymentConditionStatus.PENDING },
      data: { status: PaymentConditionStatus.MISSED }
    })
  }
}
