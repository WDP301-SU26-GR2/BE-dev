import { PaymentRecordRepo } from './payment.repo'

describe('PaymentRecordRepo response enrichment', () => {
  it('batch-fetches duplicate receivers once and represents an unapproved payment with approver null', async () => {
    const records = [
      { id: 'p1', receiverId: 'u1', approvedBy: null, seriesId: 's1' },
      { id: 'p2', receiverId: 'u1', approvedBy: 'u2', seriesId: 's1' }
    ]
    const paymentFindMany = jest.fn().mockResolvedValue(records)
    const userFindMany = jest.fn().mockResolvedValue([
      { id: 'u1', name: 'Receiver', displayName: null, avatar: null },
      { id: 'u2', name: 'Approver', displayName: 'Approver Display', avatar: null }
    ])
    const seriesFindMany = jest.fn().mockResolvedValue([{ id: 's1', title: 'Series' }])
    const repo = new PaymentRecordRepo({
      paymentRecord: { findMany: paymentFindMany },
      user: { findMany: userFindMany },
      series: { findMany: seriesFindMany }
    } as any)

    const result = await repo.findMany({})

    expect(userFindMany).toHaveBeenCalledTimes(1)
    expect(userFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['u1', 'u2'] } },
      select: { id: true, name: true, displayName: true, avatar: true }
    })
    expect(seriesFindMany).toHaveBeenCalledTimes(1)
    expect(result[0]).toMatchObject({
      receiver: { id: 'u1', displayName: 'Receiver', avatar: null },
      approver: null,
      series: { id: 's1', title: 'Series' }
    })
    expect(result[1].approver).toEqual({ id: 'u2', displayName: 'Approver Display', avatar: null })
  })
})
