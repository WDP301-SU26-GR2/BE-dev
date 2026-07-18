import { Injectable } from '@nestjs/common'
import {
  ConditionType,
  ContractStatus,
  PaymentConditionStatus,
  PaymentRecordStatus,
  PaymentSource,
  PaymentType
} from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { USER_MINI_FIELDS, fetchSeriesMiniMap, fetchUserMiniMap, toUserMini } from 'src/core/models/user-mini.model'

@Injectable()
export class PaymentRecordRepo {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: any) {
    return this.prisma.paymentRecord.create({
      data: dto
    })
  }

  async update(id: string, dto: any) {
    return this.prisma.paymentRecord.update({
      where: { id },
      data: dto
    })
  }

  async findById(id: string) {
    const record = await this.prisma.paymentRecord.findUnique({
      where: { id },
      include: { receiver: { select: USER_MINI_FIELDS } }
    })
    if (!record) return null
    const [approvers, series] = await Promise.all([
      fetchUserMiniMap(this.prisma, [record.approvedBy]),
      fetchSeriesMiniMap(this.prisma, [record.seriesId])
    ])
    return {
      ...record,
      receiver: toUserMini(record.receiver),
      approver: record.approvedBy ? (approvers.get(record.approvedBy) ?? null) : null,
      series: record.seriesId ? (series.get(record.seriesId) ?? null) : null
    }
  }

  async findUserById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId }
    })
  }

  async findMany(params: {
    status?: string
    receiverId?: string
    seriesId?: string
    contractId?: string
    paymentType?: string
    paymentSource?: string
  }) {
    const where: any = {}

    if (params.status) where.status = params.status
    if (params.receiverId) where.receiverId = params.receiverId
    if (params.seriesId) where.seriesId = params.seriesId
    if (params.contractId) where.contractId = params.contractId
    if (params.paymentType) where.paymentType = params.paymentType
    if (params.paymentSource) where.paymentSource = params.paymentSource

    const records = await this.prisma.paymentRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    })
    const [users, series] = await Promise.all([
      fetchUserMiniMap(
        this.prisma,
        records.flatMap((record) => [record.receiverId, record.approvedBy])
      ),
      fetchSeriesMiniMap(
        this.prisma,
        records.map((record) => record.seriesId)
      )
    ])
    return records.map((record) => ({
      ...record,
      receiver: users.get(record.receiverId),
      approver: record.approvedBy ? (users.get(record.approvedBy) ?? null) : null,
      series: record.seriesId ? (series.get(record.seriesId) ?? null) : null
    }))
  }

  findEligibleContracts(seriesId: string) {
    return this.prisma.contract.findMany({
      where: {
        seriesId,
        status: ContractStatus.FULLY_EXECUTED
      },
      include: {
        series: {
          select: {
            id: true,
            mangakaId: true,
            coOwnerId: true
          }
        },
        conditions: true
      }
    })
  }

  findContractForPaymentEngine(contractId: string) {
    return this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        series: {
          select: {
            id: true,
            mangakaId: true,
            coOwnerId: true
          }
        },
        conditions: true
      }
    })
  }

  findConditionsBySeries(seriesId: string, conditionTypes: ConditionType[]) {
    return this.prisma.paymentCondition.findMany({
      where: {
        conditionType: { in: conditionTypes },
        contract: {
          seriesId,
          status: ContractStatus.FULLY_EXECUTED
        }
      },
      include: {
        contract: {
          include: {
            series: {
              select: {
                id: true,
                mangakaId: true,
                coOwnerId: true
              }
            }
          }
        }
      }
    })
  }

  findPendingTimeBoundConditions() {
    return this.prisma.paymentCondition.findMany({
      where: {
        conditionType: ConditionType.TIME_BOUND,
        status: PaymentConditionStatus.PENDING,
        contract: {
          status: ContractStatus.FULLY_EXECUTED
        }
      },
      include: {
        contract: true
      }
    })
  }

  findRankingConditions(seriesIds: string[]) {
    return this.prisma.paymentCondition.findMany({
      where: {
        conditionType: ConditionType.RANKING_MILESTONE,
        status: PaymentConditionStatus.PENDING,
        contract: {
          seriesId: { in: seriesIds },
          status: ContractStatus.FULLY_EXECUTED
        }
      },
      include: {
        contract: {
          include: {
            series: {
              select: {
                id: true,
                mangakaId: true,
                coOwnerId: true
              }
            }
          }
        }
      }
    })
  }

  existsPayment(params: {
    conditionId?: string | null
    paymentType: PaymentType
    period?: string | null
    receiverId: string
    contractId?: string
  }) {
    return this.prisma.paymentRecord.findFirst({
      where: {
        conditionId: params.conditionId ?? null,
        paymentType: params.paymentType,
        period: params.period ?? null,
        receiverId: params.receiverId,
        ...(params.contractId ? { contractId: params.contractId } : {})
      },
      select: { id: true }
    })
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
        conditionId: data.conditionId ?? undefined,
        seriesId: data.seriesId ?? undefined,
        period: data.period ?? undefined,
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
    return this.prisma.paymentCondition.update({
      where: { id: conditionId },
      data: { lastTriggeredValue }
    })
  }

  markConditionMissed(conditionId: string) {
    return this.prisma.paymentCondition.update({
      where: { id: conditionId },
      data: { status: PaymentConditionStatus.MISSED }
    })
  }

  markPendingConditionsMissedByContract(contractId: string) {
    return this.prisma.paymentCondition.updateMany({
      where: {
        contractId,
        status: PaymentConditionStatus.PENDING
      },
      data: { status: PaymentConditionStatus.MISSED }
    })
  }

  findExecutedTransferContractBySeriesId(seriesId: string) {
    return this.prisma.transferContract.findFirst({
      where: {
        seriesId,
        status: 'FULLY_EXECUTED' as any
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  // B-CON-10: pause TIME_BOUND conditions of a series when hiatus starts.
  // Only flips PENDING -> DISABLED for FULLY_EXECUTED contracts (cron markMissed auto-stops for DISABLED).
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

  // B-CON-10: resume — fetch DISABLED TIME_BOUND conditions of the series to shift deadlines.
  findDisabledTimeBoundConditions(seriesId: string) {
    return this.prisma.paymentCondition.findMany({
      where: {
        conditionType: ConditionType.TIME_BOUND,
        status: PaymentConditionStatus.DISABLED,
        contract: { seriesId, status: ContractStatus.FULLY_EXECUTED }
      }
    })
  }

  // B-CON-10: resume — flip back to PENDING with shifted thresholdConfig (deadline moved forward).
  resumeTimeBoundCondition(conditionId: string, thresholdConfig: unknown) {
    return this.prisma.paymentCondition.update({
      where: { id: conditionId },
      data: { status: PaymentConditionStatus.PENDING, thresholdConfig: thresholdConfig as any }
    })
  }

  // B-CON-09: cancellation — terminate all FULLY_EXECUTED contracts of the series.
  terminateContractsBySeries(seriesId: string) {
    return this.prisma.contract.updateMany({
      where: { seriesId, status: ContractStatus.FULLY_EXECUTED },
      data: { status: ContractStatus.TERMINATED }
    })
  }
}
