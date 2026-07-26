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
    } as never)

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
    const repo = new PaymentRecordRepo(prisma as never)

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
    const repo = new PaymentRecordRepo(prisma as never)

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

describe('PaymentRecordRepo — persistence and enrichment branches', () => {
  it('returns null immediately when a payment does not exist', async () => {
    const userFindMany = jest.fn()
    const seriesFindMany = jest.fn()
    const repo = new PaymentRecordRepo({
      paymentRecord: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findMany: userFindMany },
      series: { findMany: seriesFindMany }
    } as never)

    await expect(repo.findById('missing')).resolves.toBeNull()
    expect(userFindMany).not.toHaveBeenCalled()
    expect(seriesFindMany).not.toHaveBeenCalled()
  })

  it('enriches a payment detail and represents missing optional relations as null', async () => {
    const record = {
      id: 'p1',
      receiverId: 'u1',
      approvedBy: 'u2',
      seriesId: 's1',
      receiver: { id: 'u1', name: 'Receiver', displayName: null, avatar: null }
    }
    const repo = new PaymentRecordRepo({
      paymentRecord: { findUnique: jest.fn().mockResolvedValue(record) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      series: { findMany: jest.fn().mockResolvedValue([]) }
    } as never)

    await expect(repo.findById('p1')).resolves.toMatchObject({
      receiver: { id: 'u1', displayName: 'Receiver', avatar: null },
      approver: null,
      series: null
    })
  })

  it('enriches a payment detail with its approver and series', async () => {
    const record = {
      id: 'p1',
      receiverId: 'u1',
      approvedBy: 'u2',
      seriesId: 's1',
      receiver: { id: 'u1', name: 'Receiver', displayName: 'Receiver Display', avatar: 'avatar.png' }
    }
    const repo = new PaymentRecordRepo({
      paymentRecord: { findUnique: jest.fn().mockResolvedValue(record) },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'u2', name: 'Approver', displayName: null, avatar: null }])
      },
      series: { findMany: jest.fn().mockResolvedValue([{ id: 's1', title: 'Series One' }]) }
    } as never)

    await expect(repo.findById('p1')).resolves.toMatchObject({
      receiver: { id: 'u1', displayName: 'Receiver Display', avatar: 'avatar.png' },
      approver: { id: 'u2', displayName: 'Approver', avatar: null },
      series: { id: 's1', title: 'Series One' }
    })
  })

  it('passes every supported list filter and keeps unresolved optional relations null', async () => {
    const paymentFindMany = jest.fn().mockResolvedValue([
      {
        id: 'p1',
        receiverId: 'u1',
        approvedBy: 'missing-user',
        seriesId: 'missing-series'
      }
    ])
    const repo = new PaymentRecordRepo({
      paymentRecord: { findMany: paymentFindMany },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'u1', name: 'Receiver', displayName: null, avatar: null }])
      },
      series: { findMany: jest.fn().mockResolvedValue([]) }
    } as never)

    const result = await repo.findMany({
      status: 'APPROVED',
      receiverId: 'u1',
      seriesId: 's1',
      contractId: 'c1',
      paymentType: 'REVENUE_SHARE',
      paymentSource: 'CONTRACT'
    } as never)

    expect(paymentFindMany).toHaveBeenCalledWith({
      where: {
        status: 'APPROVED',
        receiverId: 'u1',
        seriesId: 's1',
        contractId: 'c1',
        paymentType: 'REVENUE_SHARE',
        paymentSource: 'CONTRACT'
      },
      orderBy: { createdAt: 'desc' }
    })
    expect(result[0]).toMatchObject({
      receiver: { id: 'u1', displayName: 'Receiver' },
      approver: null,
      series: null
    })
  })

  it('uses compare-and-set result count to distinguish a lost race from a successful transition', async () => {
    const updateMany = jest.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })
    const findUnique = jest.fn().mockResolvedValue({ id: 'p1', status: 'APPROVED' })
    const repo = new PaymentRecordRepo({
      paymentRecord: { updateMany, findUnique }
    } as never)

    await expect(repo.updateWithExpectedStatus('p1', 'TRIGGERED', { status: 'APPROVED' })).resolves.toBeNull()
    expect(findUnique).not.toHaveBeenCalled()

    await expect(repo.updateWithExpectedStatus('p1', 'TRIGGERED', { status: 'APPROVED' })).resolves.toEqual({
      id: 'p1',
      status: 'APPROVED'
    })
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'p1' } })
  })

  it('builds the idempotency lookup with explicit nulls and an optional contract scope', async () => {
    const findFirst = jest.fn().mockResolvedValue(null)
    const repo = new PaymentRecordRepo({ paymentRecord: { findFirst } } as never)

    await repo.existsPayment({
      paymentType: 'REVENUE_SHARE',
      receiverId: 'u1'
    } as never)
    await repo.existsPayment({
      conditionId: 'condition-1',
      paymentType: 'CONDITION_PAYOUT',
      period: 'chapter:10',
      receiverId: 'u1',
      contractId: 'contract-1'
    } as never)

    expect(findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        conditionId: null,
        paymentType: 'REVENUE_SHARE',
        period: null,
        receiverId: 'u1'
      },
      select: { id: true }
    })
    expect(findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        conditionId: 'condition-1',
        paymentType: 'CONDITION_PAYOUT',
        period: 'chapter:10',
        receiverId: 'u1',
        contractId: 'contract-1'
      },
      select: { id: true }
    })
  })

  it('marks an achieved condition with or without the recurring progress value', async () => {
    const update = jest.fn().mockResolvedValue({})
    const repo = new PaymentRecordRepo({ paymentCondition: { update } } as never)

    await repo.markConditionAchieved('c1')
    await repo.markConditionAchieved('c2', { lastTriggeredValue: 12 })

    expect(update.mock.calls[0][0].data).toEqual({
      status: 'ACHIEVED',
      achievedAt: expect.any(Date)
    })
    expect(update.mock.calls[1][0].data).toEqual({
      status: 'ACHIEVED',
      achievedAt: expect.any(Date),
      lastTriggeredValue: 12
    })
  })
})
