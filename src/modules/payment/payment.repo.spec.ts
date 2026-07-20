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

// ─────────────────────────────────────────────────────────────────────────────
// S-03 (BACKEND_AUDIT_2026-07-20) + bug NULL-vs-ABSENT phát hiện khi verify audit.
//
// MongoDB phân biệt field ABSENT với field = null. Prisma dịch
// `where: { conditionId: null }` thành match doc có field null; doc ABSENT KHÔNG
// khớp (đã probe DB thật — cùng lớp gotcha `deletedAt` ở AGENTS §10).
//
// Nếu ghi bằng `?? undefined`, mọi payment conditionId null (REVENUE_SHARE,
// COMPENSATION) sẽ ghi ABSENT trong khi existsPayment dò bằng null ⇒ dedupe
// KHÔNG BAO GIỜ khớp ⇒ event bắn lại lần hai sinh payment trùng, không cần race.
//
// Hợp đồng: mọi field nullable thuộc khoá idempotency phải ghi TƯỜNG MINH null.
// ─────────────────────────────────────────────────────────────────────────────
describe('PaymentRecordRepo — khoá idempotency ghi null tường minh', () => {
  const makePrisma = () => ({ paymentRecord: { create: jest.fn().mockResolvedValue({ id: 'p1' }) } })

  it('createTriggeredPayment ghi conditionId/seriesId = null khi thiếu (KHÔNG absent)', async () => {
    const prisma = makePrisma()
    const repo = new PaymentRecordRepo(prisma as any)

    await repo.createTriggeredPayment({
      receiverId: 'u1',
      amount: 500,
      paymentType: 'COMPENSATION',
      contractId: 'ct1',
      period: 'termination:s1'
      // conditionId + seriesId cố tình bỏ trống
    })

    const data = prisma.paymentRecord.create.mock.calls[0][0].data
    // toHaveProperty + toBeNull phân biệt "field = null" với "field absent"
    expect(data).toHaveProperty('conditionId')
    expect(data.conditionId).toBeNull()
    expect(data).toHaveProperty('seriesId')
    expect(data.seriesId).toBeNull()
    expect(data.period).toBe('termination:s1')
  })

  it('createTriggeredPayment giữ nguyên giá trị khi có đủ field', async () => {
    const prisma = makePrisma()
    const repo = new PaymentRecordRepo(prisma as any)

    await repo.createTriggeredPayment({
      receiverId: 'u1',
      amount: 200,
      paymentType: 'CONDITION_PAYOUT',
      contractId: 'ct1',
      conditionId: 'cond1',
      seriesId: 's1',
      period: 'chapter:10'
    })

    const data = prisma.paymentRecord.create.mock.calls[0][0].data
    expect(data.conditionId).toBe('cond1')
    expect(data.seriesId).toBe('s1')
    expect(data.period).toBe('chapter:10')
  })
})
