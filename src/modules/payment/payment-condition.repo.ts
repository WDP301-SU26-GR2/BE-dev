import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { ConditionType, PaymentCondition, PaymentConditionStatus, Prisma } from '@prisma/client'

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
      status?: PaymentConditionStatus
    }
  ): Promise<PaymentCondition> {
    return this.prisma.paymentCondition.update({
      where: { id: conditionId },
      data
    })
  }
}
