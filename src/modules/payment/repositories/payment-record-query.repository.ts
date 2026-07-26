import {
  ConditionType,
  ContractStatus,
  PaymentConditionStatus,
  PaymentRecordStatus,
  PaymentSource,
  PaymentType,
  Prisma,
  TransferContractStatus
} from '@prisma/client'
import { USER_MINI_FIELDS, fetchSeriesMiniMap, fetchUserMiniMap, toUserMini } from 'src/core/models/user-mini.model'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

export class PaymentRecordQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

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

  findUserById(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } })
  }

  findSeriesOwners(seriesId: string) {
    return this.prisma.series.findUnique({
      where: { id: seriesId },
      select: { id: true, mangakaId: true, editorId: true, coOwnerId: true }
    })
  }

  async findMany(params: {
    status?: PaymentRecordStatus
    receiverId?: string
    seriesId?: string
    contractId?: string
    paymentType?: PaymentType
    paymentSource?: PaymentSource
  }) {
    const where: Prisma.PaymentRecordWhereInput = {}
    if (params.status) where.status = params.status
    if (params.receiverId) where.receiverId = params.receiverId
    if (params.seriesId) where.seriesId = params.seriesId
    if (params.contractId) where.contractId = params.contractId
    if (params.paymentType) where.paymentType = params.paymentType
    if (params.paymentSource) where.paymentSource = params.paymentSource
    const records = await this.prisma.paymentRecord.findMany({ where, orderBy: { createdAt: 'desc' } })
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
      where: { seriesId, status: ContractStatus.FULLY_EXECUTED },
      include: { series: { select: { id: true, mangakaId: true, coOwnerId: true } }, conditions: true }
    })
  }

  findContractForPaymentEngine(contractId: string) {
    return this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { series: { select: { id: true, mangakaId: true, coOwnerId: true } }, conditions: true }
    })
  }

  findConditionsBySeries(seriesId: string, conditionTypes: ConditionType[]) {
    return this.prisma.paymentCondition.findMany({
      where: {
        conditionType: { in: conditionTypes },
        contract: { seriesId, status: ContractStatus.FULLY_EXECUTED }
      },
      include: {
        contract: { include: { series: { select: { id: true, mangakaId: true, coOwnerId: true } } } }
      }
    })
  }

  findPendingTimeBoundConditions() {
    return this.prisma.paymentCondition.findMany({
      where: {
        conditionType: ConditionType.TIME_BOUND,
        status: PaymentConditionStatus.PENDING,
        contract: { status: ContractStatus.FULLY_EXECUTED }
      },
      include: { contract: true }
    })
  }

  findRankingConditions(seriesIds: string[]) {
    return this.prisma.paymentCondition.findMany({
      where: {
        conditionType: ConditionType.RANKING_MILESTONE,
        status: PaymentConditionStatus.PENDING,
        contract: { seriesId: { in: seriesIds }, status: ContractStatus.FULLY_EXECUTED }
      },
      include: {
        contract: { include: { series: { select: { id: true, mangakaId: true, coOwnerId: true } } } }
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

  findExecutedTransferContractBySeriesId(seriesId: string) {
    return this.prisma.transferContract.findFirst({
      where: { seriesId, status: TransferContractStatus.FULLY_EXECUTED },
      orderBy: { createdAt: 'desc' }
    })
  }

  findDisabledTimeBoundConditions(seriesId: string) {
    return this.prisma.paymentCondition.findMany({
      where: {
        conditionType: ConditionType.TIME_BOUND,
        status: PaymentConditionStatus.DISABLED,
        contract: { seriesId, status: ContractStatus.FULLY_EXECUTED }
      }
    })
  }
}
