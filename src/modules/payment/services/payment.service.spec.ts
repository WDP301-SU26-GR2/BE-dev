import { PaymentService } from './payment.service'
import { PaymentRecordNotFoundException } from '../errors/payment.error'
import { PaymentRecordModelSchema } from '../schemas/payment.model'

// FINDING-BE-004 (flowtest 2026-07-11): schema từng khai field chết `userId` (PaymentRecord
// entity KHÔNG có) → approve/pay/cancel trả 500 ZodSerializationException dù DB update OK.
// Guard: schema phải parse được record shape Prisma thật (không userId).
describe('PaymentRecordModelSchema khớp shape Prisma (FINDING-BE-004)', () => {
  it('parse record Prisma-shaped (không có userId) → OK', () => {
    const r = PaymentRecordModelSchema.safeParse({
      id: '507f1f77bcf86cd799439013',
      contractId: '507f1f77bcf86cd799439014',
      conditionId: null,
      receiverId: '507f1f77bcf86cd799439015',
      seriesId: null,
      description: null,
      approvedBy: null,
      approvedAt: null,
      paymentType: 'REVENUE_SHARE',
      paymentSource: 'CONTRACT',
      amount: 100,
      period: null,
      paymentMethod: null,
      transactionReference: null,
      status: 'TRIGGERED',
      paidAt: null,
      cancelledAt: null,
      cancelReason: null,
      note: null,
      createdBy: null,
      createdAt: new Date()
    })
    expect(r.success).toBe(true)
  })
})

type Mocks = {
  paymentRepo: any
  paymentConditionRepo: any
  eventEmitter: any
  auditService: any
}

function makeMocks(): Mocks {
  return {
    paymentRepo: {
      findById: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      create: jest.fn(),
      findUserById: jest.fn(),
      findSeriesOwners: jest.fn()
    },
    paymentConditionRepo: { findContractById: jest.fn() },
    eventEmitter: { emit: jest.fn() },
    auditService: { record: jest.fn().mockResolvedValue(undefined) }
  }
}

const BOARD = 'BOARD_MEMBER'
const ADMIN = 'SUPER_ADMIN'
const MANGAKA = 'MANGAKA'
const EDITOR = 'EDITOR'

function makeService(m: Mocks) {
  return new PaymentService(
    m.paymentRepo as never,
    m.paymentConditionRepo as never,
    m.eventEmitter as never,
    m.auditService as never
  )
}

describe('PaymentService — OBJECT_ID_RE guard (Spec 11 §2.1)', () => {
  it('getPaymentById: id rác → 404, KHÔNG chạm repo', async () => {
    const m = makeMocks()
    await expect(makeService(m).getPaymentById('bad-id', 'u1', BOARD)).rejects.toMatchObject({ status: 404 })
    expect(m.paymentRepo.findById).not.toHaveBeenCalled()
  })

  it('getPaymentById: id rác ném đúng PaymentRecordNotFoundException', async () => {
    const m = makeMocks()
    await expect(makeService(m).getPaymentById('garbage', 'u1', BOARD)).rejects.toBeInstanceOf(
      PaymentRecordNotFoundException
    )
    expect(m.paymentRepo.findById).not.toHaveBeenCalled()
  })

  it('approvePayment: id rác → 404 (đi qua loader, KHÔNG chạm repo)', async () => {
    const m = makeMocks()
    await expect(makeService(m).approvePayment('bad-id', 'actor-1')).rejects.toMatchObject({
      status: 404
    })
    expect(m.paymentRepo.findById).not.toHaveBeenCalled()
    expect(m.paymentRepo.update).not.toHaveBeenCalled()
    expect(m.eventEmitter.emit).not.toHaveBeenCalled()
  })

  it('payPayment: id rác → 404 (đi qua loader, KHÔNG chạm repo)', async () => {
    const m = makeMocks()
    await expect(makeService(m).payPayment('bad-id', {} as never, 'actor-1')).rejects.toMatchObject({ status: 404 })
    expect(m.paymentRepo.findById).not.toHaveBeenCalled()
    expect(m.paymentRepo.update).not.toHaveBeenCalled()
    expect(m.eventEmitter.emit).not.toHaveBeenCalled()
  })

  it('cancelPayment: id rác → 404 (đi qua loader, KHÔNG chạm repo)', async () => {
    const m = makeMocks()
    await expect(makeService(m).cancelPayment('bad-id', {} as never, 'actor-1')).rejects.toMatchObject({ status: 404 })
    expect(m.paymentRepo.findById).not.toHaveBeenCalled()
    expect(m.paymentRepo.update).not.toHaveBeenCalled()
  })

  it('getPaymentsByContract: contractId rác → 200 rỗng, KHÔNG chạm repo (tiền lệ PA-02)', async () => {
    const m = makeMocks()
    await expect(makeService(m).getPaymentsByContract('bad-id', 'u1', BOARD)).resolves.toEqual({ data: [] })
    expect(m.paymentRepo.findMany).not.toHaveBeenCalled()
  })

  it('getPaymentsBySeries: seriesId rác → 200 rỗng, KHÔNG chạm repo', async () => {
    const m = makeMocks()
    await expect(makeService(m).getPaymentsBySeries('bad-id', 'u1', BOARD)).resolves.toEqual({ data: [] })
    expect(m.paymentRepo.findMany).not.toHaveBeenCalled()
  })

  it('getPaymentsByUserId: receiverId rác → 200 rỗng, KHÔNG chạm repo', async () => {
    const m = makeMocks()
    await expect(makeService(m).getPaymentsByUserId('bad-id', 'u1', BOARD)).resolves.toEqual({ data: [] })
    expect(m.paymentRepo.findMany).not.toHaveBeenCalled()
  })
})

// ============================================================================
// S-01 (BACKEND_AUDIT_2026-07-20): object-level authorization + actor identity
// ============================================================================
const OID = (n: number) => `5${'0'.repeat(22)}${n}`.slice(0, 24)
const P = OID(1) // payment id
const CTR = OID(2) // contract id
const OWNER = OID(3) // mangaka owner / editor owner
const OUTSIDER = OID(4) // unrelated user

describe('PaymentService — S-01 object-level authorization (read paths)', () => {
  function seedPayment(m: Mocks, over: Record<string, unknown> = {}) {
    m.paymentRepo.findById = jest.fn().mockResolvedValue({
      id: P,
      status: 'TRIGGERED',
      contractId: CTR,
      receiverId: OWNER,
      seriesId: null,
      amount: 43210,
      ...over
    })
  }

  it('getPaymentById: BOARD/ADMIN xem được mọi record', async () => {
    const m = makeMocks()
    seedPayment(m)
    await expect(makeService(m).getPaymentById(P, OUTSIDER, BOARD)).resolves.toMatchObject({ id: P })
    await expect(makeService(m).getPaymentById(P, OUTSIDER, ADMIN)).resolves.toMatchObject({ id: P })
    // không cần load contract cho board/admin
    expect(m.paymentConditionRepo.findContractById).not.toHaveBeenCalled()
  })

  it('getPaymentById: MANGAKA là RECEIVER → xem được (không cần load contract)', async () => {
    const m = makeMocks()
    seedPayment(m, { receiverId: OWNER })
    await expect(makeService(m).getPaymentById(P, OWNER, MANGAKA)).resolves.toMatchObject({ id: P })
    expect(m.paymentConditionRepo.findContractById).not.toHaveBeenCalled()
  })

  it('getPaymentById: MANGAKA chủ contract (không phải receiver) → xem được', async () => {
    const m = makeMocks()
    seedPayment(m, { receiverId: OUTSIDER })
    m.paymentConditionRepo.findContractById = jest
      .fn()
      .mockResolvedValue({ id: CTR, editorId: OID(9), mangakaId: OWNER })
    await expect(makeService(m).getPaymentById(P, OWNER, MANGAKA)).resolves.toMatchObject({ id: P })
  })

  it('getPaymentById: EDITOR phụ trách contract → xem được', async () => {
    const m = makeMocks()
    seedPayment(m, { receiverId: OUTSIDER })
    m.paymentConditionRepo.findContractById = jest
      .fn()
      .mockResolvedValue({ id: CTR, editorId: OWNER, mangakaId: OID(9) })
    await expect(makeService(m).getPaymentById(P, OWNER, EDITOR)).resolves.toMatchObject({ id: P })
  })

  it('🔴 getPaymentById: MANGAKA ngoài cuộc → 403 (BOLA blocked)', async () => {
    const m = makeMocks()
    seedPayment(m, { receiverId: OWNER })
    m.paymentConditionRepo.findContractById = jest
      .fn()
      .mockResolvedValue({ id: CTR, editorId: OID(9), mangakaId: OWNER })
    await expect(makeService(m).getPaymentById(P, OUTSIDER, MANGAKA)).rejects.toMatchObject({ status: 403 })
  })

  it('🔴 getPaymentById: EDITOR không phụ trách → 403', async () => {
    const m = makeMocks()
    seedPayment(m, { receiverId: OWNER })
    m.paymentConditionRepo.findContractById = jest
      .fn()
      .mockResolvedValue({ id: CTR, editorId: OID(9), mangakaId: OID(8) })
    await expect(makeService(m).getPaymentById(P, OUTSIDER, EDITOR)).rejects.toMatchObject({ status: 403 })
  })

  it('getPaymentsByUserId: MANGAKA chỉ đọc được payment của CHÍNH MÌNH', async () => {
    const m = makeMocks()
    await expect(makeService(m).getPaymentsByUserId(OWNER, OWNER, MANGAKA)).resolves.toEqual({ data: [] })
    expect(m.paymentRepo.findMany).toHaveBeenCalledWith({ receiverId: OWNER })
  })

  it('🔴 getPaymentsByUserId: MANGAKA đọc receiverId người khác → 403', async () => {
    const m = makeMocks()
    await expect(makeService(m).getPaymentsByUserId(OWNER, OUTSIDER, MANGAKA)).rejects.toMatchObject({ status: 403 })
    expect(m.paymentRepo.findMany).not.toHaveBeenCalled()
  })

  it('🔴 getPaymentsByContract: EDITOR không phụ trách → 403', async () => {
    const m = makeMocks()
    m.paymentConditionRepo.findContractById = jest
      .fn()
      .mockResolvedValue({ id: CTR, editorId: OID(9), mangakaId: OID(8) })
    await expect(makeService(m).getPaymentsByContract(CTR, OUTSIDER, EDITOR)).rejects.toMatchObject({ status: 403 })
    expect(m.paymentRepo.findMany).not.toHaveBeenCalled()
  })

  it('🔴 getPaymentsBySeries: MANGAKA không sở hữu series → 403', async () => {
    const m = makeMocks()
    m.paymentRepo.findSeriesOwners = jest
      .fn()
      .mockResolvedValue({ mangakaId: OID(8), editorId: OID(9), coOwnerId: null })
    await expect(makeService(m).getPaymentsBySeries(OID(7), OUTSIDER, MANGAKA)).rejects.toMatchObject({ status: 403 })
    expect(m.paymentRepo.findMany).not.toHaveBeenCalled()
  })
})

describe('PaymentService — S-01 actor identity (mutations lấy actor từ token)', () => {
  function seedFor(m: Mocks, status: string) {
    m.paymentRepo.findById = jest
      .fn()
      .mockResolvedValue({ id: P, status, contractId: CTR, receiverId: OWNER, amount: 100 })
    m.paymentRepo.update = jest
      .fn()
      .mockResolvedValue({ id: P, status: 'X', contractId: CTR, receiverId: OWNER, amount: 100 })
  }

  it('approvePayment: approvedBy + audit.actorId = actor TỪ TOKEN (không phải body)', async () => {
    const m = makeMocks()
    seedFor(m, 'TRIGGERED')
    await makeService(m).approvePayment(P, OWNER)
    expect(m.paymentRepo.update).toHaveBeenCalledWith(P, expect.objectContaining({ approvedBy: OWNER }))
    expect(m.auditService.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: OWNER }))
  })

  it('payPayment: audit.actorId = actor TỪ TOKEN (trước đây null)', async () => {
    const m = makeMocks()
    seedFor(m, 'APPROVED')
    await makeService(m).payPayment(P, { paymentMethod: 'CASH', transactionReference: 'T1' }, OWNER)
    expect(m.auditService.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: OWNER, toState: 'PAID' }))
  })

  it('cancelPayment: audit.actorId = actor TỪ TOKEN (trước đây null)', async () => {
    const m = makeMocks()
    seedFor(m, 'TRIGGERED')
    await makeService(m).cancelPayment(P, { cancelReason: 'x' }, OWNER)
    expect(m.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: OWNER, toState: 'CANCELLED' })
    )
  })
})

describe('PaymentService — AuditLog wiring (Spec 11 §2.2)', () => {
  it('approvePayment: ghi AuditLog PAYMENT_RECORD/TRANSITION', async () => {
    const m = makeMocks()
    m.paymentRepo.findById = jest.fn().mockResolvedValue({ id: '507f1f77bcf86cd799439011', status: 'TRIGGERED' })
    m.paymentRepo.update = jest.fn().mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      status: 'APPROVED',
      contractId: 'c1',
      receiverId: 'r1',
      amount: 100
    })
    await makeService(m).approvePayment('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012')

    expect(m.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'PAYMENT_RECORD',
        entityId: '507f1f77bcf86cd799439011',
        action: 'TRANSITION',
        fromState: 'TRIGGERED',
        toState: 'APPROVED'
      })
    )
  })

  it('payPayment: ghi AuditLog PAYMENT_RECORD/TRANSITION (TRIGGERED → PAID đều log)', async () => {
    const m = makeMocks()
    m.paymentRepo.findById = jest.fn().mockResolvedValue({ id: '507f1f77bcf86cd799439012', status: 'APPROVED' })
    m.paymentRepo.update = jest.fn().mockResolvedValue({
      id: '507f1f77bcf86cd799439012',
      status: 'PAID',
      contractId: 'c1',
      receiverId: 'r1',
      amount: 200
    })
    await makeService(m).payPayment('507f1f77bcf86cd799439012', {} as never, 'actor-x')

    expect(m.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'PAYMENT_RECORD',
        entityId: '507f1f77bcf86cd799439012',
        action: 'TRANSITION',
        fromState: 'APPROVED',
        toState: 'PAID'
      })
    )
  })

  it('cancelPayment: ghi AuditLog PAYMENT_RECORD/TRANSITION với reason', async () => {
    const m = makeMocks()
    m.paymentRepo.findById = jest.fn().mockResolvedValue({ id: '507f1f77bcf86cd799439013', status: 'TRIGGERED' })
    m.paymentRepo.update = jest.fn().mockResolvedValue({
      id: '507f1f77bcf86cd799439013',
      status: 'CANCELLED',
      contractId: 'c1',
      receiverId: 'r1',
      amount: 300
    })
    await makeService(m).cancelPayment('507f1f77bcf86cd799439013', { cancelReason: 'dead contract' }, 'actor-x')

    expect(m.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'PAYMENT_RECORD',
        entityId: '507f1f77bcf86cd799439013',
        action: 'TRANSITION',
        fromState: 'TRIGGERED',
        toState: 'CANCELLED',
        reason: 'dead contract'
      })
    )
  })
})
