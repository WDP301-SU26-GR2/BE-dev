import { $Enums } from '@prisma/client'
import { MangakaEarningsService } from './mangaka-earnings.service'

describe('MangakaEarningsService', () => {
  it('totals earnings, zero-fills enum maps, limits recent rows and maps dates to ISO', async () => {
    const createdAt = new Date('2026-07-18T01:02:03.000Z')
    const rows = [
      {
        id: 'p1',
        amount: 100,
        status: $Enums.PaymentRecordStatus.PAID,
        paymentType: $Enums.PaymentType.REVENUE_SHARE,
        seriesId: 's1',
        period: '2026-07',
        paidAt: createdAt,
        createdAt
      },
      {
        id: 'p2',
        amount: 50,
        status: $Enums.PaymentRecordStatus.TRIGGERED,
        paymentType: $Enums.PaymentType.CHAPTER_MILESTONE,
        seriesId: null,
        period: null,
        paidAt: null,
        createdAt
      },
      {
        id: 'p3',
        amount: 20,
        status: $Enums.PaymentRecordStatus.MISSED,
        paymentType: $Enums.PaymentType.COMPENSATION,
        seriesId: null,
        period: null,
        paidAt: null,
        createdAt
      }
    ]
    const dashboardRepository = { earningsForMangaka: jest.fn().mockResolvedValue(rows) }
    const service = new MangakaEarningsService(dashboardRepository as never)

    const result = await service.build('mangaka-1')

    expect(dashboardRepository.earningsForMangaka).toHaveBeenCalledWith('mangaka-1')
    expect(result.totalPaid).toBe(100)
    expect(result.totalPending).toBe(50)
    expect(result.totalMissed).toBe(20)
    expect(result.byStatus.PAID).toEqual({ count: 1, amount: 100 })
    expect(Object.keys(result.byStatus)).toHaveLength(Object.values($Enums.PaymentRecordStatus).length)
    expect(Object.keys(result.byType)).toHaveLength(Object.values($Enums.PaymentType).length)
    expect(result.recent).toHaveLength(3)
    expect(result.recent[0]).toMatchObject({ paidAt: createdAt.toISOString(), createdAt: createdAt.toISOString() })
  })
})
