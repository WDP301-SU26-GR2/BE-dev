import { Injectable } from '@nestjs/common'
import { $Enums } from '@prisma/client'
import { DashboardRepository } from '../dashboard.repo'

@Injectable()
export class MangakaEarningsService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  async build(userId: string) {
    const rows = await this.dashboardRepository.earningsForMangaka(userId)
    const zero = <Key extends string>(keys: Key[]): Record<Key, { count: number; amount: number }> =>
      Object.fromEntries(keys.map((key) => [key, { count: 0, amount: 0 }])) as Record<
        Key,
        { count: number; amount: number }
      >
    const byStatus = zero(Object.values($Enums.PaymentRecordStatus))
    const byType = zero(Object.values($Enums.PaymentType))
    let totalPaid = 0
    let totalPending = 0
    let totalMissed = 0

    for (const row of rows) {
      byStatus[row.status].count++
      byStatus[row.status].amount += row.amount
      byType[row.paymentType].count++
      byType[row.paymentType].amount += row.amount
      if (row.status === $Enums.PaymentRecordStatus.PAID) totalPaid += row.amount
      else if (
        row.status === $Enums.PaymentRecordStatus.TRIGGERED ||
        row.status === $Enums.PaymentRecordStatus.APPROVED
      )
        totalPending += row.amount
      else if (row.status === $Enums.PaymentRecordStatus.MISSED) totalMissed += row.amount
    }

    return {
      totalPaid,
      totalPending,
      totalMissed,
      byStatus,
      byType,
      recent: rows.slice(0, 10).map((row) => ({
        id: row.id,
        amount: row.amount,
        status: row.status,
        paymentType: row.paymentType,
        seriesId: row.seriesId ?? null,
        period: row.period ?? null,
        paidAt: row.paidAt ? row.paidAt.toISOString() : null,
        createdAt: row.createdAt.toISOString()
      }))
    }
  }
}
