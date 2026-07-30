import { PaymentService } from './payment.service'
import { PaymentRecordNotFoundException } from '../errors/payment.error'
import { PaymentRecordModelSchema } from '../schemas/payment.model'
import { ConditionType, PaymentConditionStatus } from '@prisma/client'
import { PaymentConditionService } from './payment-condition.service'
import { PaymentQueryService } from './payment-query.service'
import { PaymentStateService } from './payment-state.service'

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
  paymentRepo: {
    findById: jest.Mock
    findMany: jest.Mock
    update: jest.Mock
    updateWithExpectedStatus: jest.Mock
    create: jest.Mock
    findUserById: jest.Mock
    findSeriesOwners: jest.Mock
  }
  paymentConditionRepo: {
    findContractById: jest.Mock
    create: jest.Mock
    findManyByContractId: jest.Mock
    findByIdAndContractId: jest.Mock
    update: jest.Mock
  }
  paymentConditionState: { disable: jest.Mock }
  eventEmitter: { emit: jest.Mock }
  auditService: { record: jest.Mock }
}

function makeMocks(): Mocks {
  return {
    paymentRepo: {
      findById: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateWithExpectedStatus: jest.fn(),
      create: jest.fn(),
      findUserById: jest.fn(),
      findSeriesOwners: jest.fn()
    },
    paymentConditionRepo: {
      findContractById: jest.fn(),
      create: jest.fn(),
      findManyByContractId: jest.fn().mockResolvedValue([]),
      findByIdAndContractId: jest.fn(),
      update: jest.fn()
    },
    paymentConditionState: {
      disable: jest.fn()
    },
    eventEmitter: { emit: jest.fn() },
    auditService: { record: jest.fn().mockResolvedValue(undefined) }
  }
}

const BOARD = 'BOARD_MEMBER'
const ADMIN = 'SUPER_ADMIN'
const MANGAKA = 'MANGAKA'
const EDITOR = 'EDITOR'

function makeService(m: Mocks) {
  const query = new PaymentQueryService(m.paymentRepo as never, m.paymentConditionRepo as never)
  const state = new PaymentStateService(m.paymentRepo as never, m.eventEmitter as never, m.auditService as never)
  const condition = new PaymentConditionService(m.paymentConditionRepo as never, m.paymentConditionState as never)
  return new PaymentService(query, state, condition)
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
    expect(m.paymentRepo.updateWithExpectedStatus).not.toHaveBeenCalled()
    expect(m.eventEmitter.emit).not.toHaveBeenCalled()
  })

  it('payPayment: id rác → 404 (đi qua loader, KHÔNG chạm repo)', async () => {
    const m = makeMocks()
    await expect(makeService(m).payPayment('bad-id', {} as never, 'actor-1')).rejects.toMatchObject({ status: 404 })
    expect(m.paymentRepo.findById).not.toHaveBeenCalled()
    expect(m.paymentRepo.update).not.toHaveBeenCalled()
    expect(m.paymentRepo.updateWithExpectedStatus).not.toHaveBeenCalled()
    expect(m.eventEmitter.emit).not.toHaveBeenCalled()
  })

  it('cancelPayment: id rác → 404 (đi qua loader, KHÔNG chạm repo)', async () => {
    const m = makeMocks()
    await expect(makeService(m).cancelPayment('bad-id', {} as never, 'actor-1')).rejects.toMatchObject({ status: 404 })
    expect(m.paymentRepo.findById).not.toHaveBeenCalled()
    expect(m.paymentRepo.update).not.toHaveBeenCalled()
    expect(m.paymentRepo.updateWithExpectedStatus).not.toHaveBeenCalled()
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
    // S-03: transition nay đi qua CAS `updateWithExpectedStatus`, không phải `update`.
    m.paymentRepo.updateWithExpectedStatus = jest
      .fn()
      .mockResolvedValue({ id: P, status: 'X', contractId: CTR, receiverId: OWNER, amount: 100 })
  }

  it('approvePayment: approvedBy + audit.actorId = actor TỪ TOKEN (không phải body)', async () => {
    const m = makeMocks()
    seedFor(m, 'TRIGGERED')
    await makeService(m).approvePayment(P, OWNER)
    expect(m.paymentRepo.updateWithExpectedStatus).toHaveBeenCalledWith(
      P,
      'TRIGGERED',
      expect.objectContaining({ approvedBy: OWNER })
    )
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
    m.paymentRepo.updateWithExpectedStatus = jest.fn().mockResolvedValue({
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
    m.paymentRepo.updateWithExpectedStatus = jest.fn().mockResolvedValue({
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
    m.paymentRepo.updateWithExpectedStatus = jest.fn().mockResolvedValue({
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

// ─────────────────────────────────────────────────────────────────────────────
// S-03 (BACKEND_AUDIT_2026-07-20) — transition phải CAS, không read-then-update.
//
// Mẫu cũ: đọc status → so sánh → `update({ where: { id } })`. Hai request đồng
// thời cùng đọc TRIGGERED rồi cùng ghi APPROVED ⇒ audit hai lần, emit hai lần,
// và với pay thì `payment.paid` bắn đôi (downstream tạo tiền hai lần).
//
// Hợp đồng mới: ghi bằng updateWithExpectedStatus (updateMany + where status kỳ
// vọng). count === 0 nghĩa là thua race ⇒ ném đúng lỗi 409/422 của trạng thái,
// và TUYỆT ĐỐI không audit/emit.
// ─────────────────────────────────────────────────────────────────────────────
describe('PaymentService — CAS transition (S-03)', () => {
  const P = '507f1f77bcf86cd799439011'
  const ACTOR = '507f1f77bcf86cd799439099'

  const seed = (m: Mocks, status: string) => {
    m.paymentRepo.findById.mockResolvedValue({
      id: P,
      status,
      contractId: 'ct1',
      receiverId: 'u1',
      amount: 100
    })
    m.paymentRepo.updateWithExpectedStatus = jest.fn()
  }

  it('approvePayment dùng CAS với status kỳ vọng TRIGGERED', async () => {
    const m = makeMocks()
    seed(m, 'TRIGGERED')
    m.paymentRepo.updateWithExpectedStatus.mockResolvedValue({
      id: P,
      status: 'APPROVED',
      contractId: 'ct1',
      receiverId: 'u1',
      amount: 100
    })

    await makeService(m).approvePayment(P, ACTOR)

    expect(m.paymentRepo.updateWithExpectedStatus).toHaveBeenCalledWith(
      P,
      'TRIGGERED',
      expect.objectContaining({ status: 'APPROVED', approvedBy: ACTOR })
    )
    expect(m.paymentRepo.update).not.toHaveBeenCalled()
  })

  it('approvePayment THUA race (CAS trả null) → ném lỗi, KHÔNG audit, KHÔNG emit', async () => {
    const m = makeMocks()
    seed(m, 'TRIGGERED')
    m.paymentRepo.updateWithExpectedStatus.mockResolvedValue(null)

    await expect(makeService(m).approvePayment(P, ACTOR)).rejects.toMatchObject({ status: 400 })
    expect(m.auditService.record).not.toHaveBeenCalled()
    expect(m.eventEmitter.emit).not.toHaveBeenCalled()
  })

  it('payPayment THUA race → ném lỗi, KHÔNG emit payment.paid (chống tạo tiền 2 lần)', async () => {
    const m = makeMocks()
    seed(m, 'APPROVED')
    m.paymentRepo.updateWithExpectedStatus.mockResolvedValue(null)

    await expect(makeService(m).payPayment(P, { paymentMethod: 'BANK' } as never, ACTOR)).rejects.toMatchObject({
      status: 400
    })
    expect(m.eventEmitter.emit).not.toHaveBeenCalled()
    expect(m.auditService.record).not.toHaveBeenCalled()
  })

  it('cancelPayment THUA race (ai đó vừa PAID) → ném lỗi, KHÔNG audit', async () => {
    const m = makeMocks()
    seed(m, 'APPROVED')
    m.paymentRepo.updateWithExpectedStatus.mockResolvedValue(null)

    await expect(makeService(m).cancelPayment(P, { cancelReason: 'x' }, ACTOR)).rejects.toMatchObject({
      status: 400
    })
    expect(m.auditService.record).not.toHaveBeenCalled()
  })

  it('đường thắng race vẫn audit + emit đúng một lần', async () => {
    const m = makeMocks()
    seed(m, 'APPROVED')
    m.paymentRepo.updateWithExpectedStatus.mockResolvedValue({
      id: P,
      status: 'PAID',
      contractId: 'ct1',
      receiverId: 'u1',
      amount: 100
    })

    await makeService(m).payPayment(P, { paymentMethod: 'BANK' } as never, ACTOR)

    expect(m.auditService.record).toHaveBeenCalledTimes(1)
    expect(m.eventEmitter.emit).toHaveBeenCalledTimes(1)
    expect(m.eventEmitter.emit).toHaveBeenCalledWith('payment.paid', expect.objectContaining({ paymentId: P }))
  })
})

describe('PaymentService — payment creation and transition rejection paths', () => {
  it('rejects a non-positive amount before resolving the receiver', async () => {
    const m = makeMocks()

    await expect(
      makeService(m).createPayment({
        amount: 0,
        receiverId: OWNER
      } as never)
    ).rejects.toMatchObject({ status: 400 })

    expect(m.paymentRepo.findUserById).not.toHaveBeenCalled()
    expect(m.paymentRepo.create).not.toHaveBeenCalled()
  })

  it('rejects an unknown receiver without creating a payment', async () => {
    const m = makeMocks()
    m.paymentRepo.findUserById.mockResolvedValue(null)

    await expect(
      makeService(m).createPayment({
        amount: 100,
        receiverId: OWNER
      } as never)
    ).rejects.toMatchObject({ status: 400 })

    expect(m.paymentRepo.create).not.toHaveBeenCalled()
  })

  it('creates a valid payment in TRIGGERED state', async () => {
    const m = makeMocks()
    m.paymentRepo.findUserById.mockResolvedValue({ id: OWNER })
    m.paymentRepo.create.mockResolvedValue({ id: P, status: 'TRIGGERED' })

    await expect(
      makeService(m).createPayment({
        amount: 100,
        receiverId: OWNER,
        contractId: CTR
      } as never)
    ).resolves.toMatchObject({ id: P, status: 'TRIGGERED' })

    expect(m.paymentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 100, receiverId: OWNER, status: 'TRIGGERED' })
    )
  })

  it.each([
    ['approve', 'APPROVED'],
    ['pay', 'TRIGGERED']
  ])('%s rejects an invalid current status without attempting CAS', async (operation, status) => {
    const m = makeMocks()
    m.paymentRepo.findById.mockResolvedValue({ id: P, status })
    const service = makeService(m)

    const action =
      operation === 'approve'
        ? service.approvePayment(P, OWNER)
        : service.payPayment(P, { paymentMethod: 'BANK' } as never, OWNER)

    await expect(action).rejects.toMatchObject({ status: 400 })
    expect(m.paymentRepo.updateWithExpectedStatus).not.toHaveBeenCalled()
    expect(m.auditService.record).not.toHaveBeenCalled()
    expect(m.eventEmitter.emit).not.toHaveBeenCalled()
  })

  it('cancel rejects an already-paid payment without attempting CAS', async () => {
    const m = makeMocks()
    m.paymentRepo.findById.mockResolvedValue({ id: P, status: 'PAID' })

    await expect(makeService(m).cancelPayment(P, { cancelReason: 'duplicate' }, OWNER)).rejects.toMatchObject({
      status: 400
    })

    expect(m.paymentRepo.updateWithExpectedStatus).not.toHaveBeenCalled()
    expect(m.auditService.record).not.toHaveBeenCalled()
  })
})

describe('PaymentService — payment collection authorization matrix', () => {
  const SERIES = OID(5)

  it.each([
    [BOARD, OUTSIDER],
    [ADMIN, OUTSIDER],
    [EDITOR, OWNER],
    [MANGAKA, OWNER]
  ])('allows %s to read an in-scope contract collection', async (role, userId) => {
    const m = makeMocks()
    m.paymentConditionRepo.findContractById.mockResolvedValue({
      id: CTR,
      editorId: OWNER,
      mangakaId: OWNER
    })

    await expect(makeService(m).getPaymentsByContract(CTR, userId, role)).resolves.toEqual({ data: [] })
    expect(m.paymentRepo.findMany).toHaveBeenCalledWith({ contractId: CTR })
  })

  it.each([
    [BOARD, OUTSIDER],
    [ADMIN, OUTSIDER],
    [EDITOR, OWNER],
    [MANGAKA, OWNER],
    [MANGAKA, OUTSIDER]
  ])('allows %s to read an in-scope series collection', async (role, userId) => {
    const m = makeMocks()
    m.paymentRepo.findSeriesOwners.mockResolvedValue({
      editorId: OWNER,
      mangakaId: OWNER,
      coOwnerId: OUTSIDER
    })

    await expect(makeService(m).getPaymentsBySeries(SERIES, userId, role)).resolves.toEqual({ data: [] })
    expect(m.paymentRepo.findMany).toHaveBeenCalledWith({ seriesId: SERIES })
  })

  it('denies an unrelated role even when the contract exists', async () => {
    const m = makeMocks()
    m.paymentConditionRepo.findContractById.mockResolvedValue({
      id: CTR,
      editorId: OWNER,
      mangakaId: OWNER
    })

    await expect(makeService(m).getPaymentsByContract(CTR, OUTSIDER, 'READER')).rejects.toMatchObject({
      status: 403
    })
    expect(m.paymentRepo.findMany).not.toHaveBeenCalled()
  })

  it('denies an editor when the requested series is missing', async () => {
    const m = makeMocks()
    m.paymentRepo.findSeriesOwners.mockResolvedValue(null)

    await expect(makeService(m).getPaymentsBySeries(SERIES, OWNER, EDITOR)).rejects.toMatchObject({ status: 403 })
    expect(m.paymentRepo.findMany).not.toHaveBeenCalled()
  })
})

describe('PaymentService — PaymentCondition ownership, validation and failure paths', () => {
  const CONDITION = OID(6)
  const contract = { id: CTR, editorId: OWNER, mangakaId: OID(7), status: 'DRAFT' }
  const chapterCondition = {
    id: CONDITION,
    contractId: CTR,
    conditionType: ConditionType.CHAPTER_MILESTONE,
    thresholdConfig: { chapter: 10 },
    isRecurring: false,
    status: PaymentConditionStatus.PENDING
  }

  it('rejects condition creation when the contract does not exist', async () => {
    const m = makeMocks()
    m.paymentConditionRepo.findContractById.mockResolvedValue(null)

    await expect(
      makeService(m).createPaymentCondition(CTR, OWNER, {
        conditionType: ConditionType.CHAPTER_MILESTONE,
        thresholdConfig: { chapter: 10 },
        payoutAmount: 500,
        isRecurring: false
      })
    ).rejects.toMatchObject({ status: 404 })

    expect(m.paymentConditionRepo.create).not.toHaveBeenCalled()
  })

  it('rejects condition creation by an editor who does not own the contract', async () => {
    const m = makeMocks()
    m.paymentConditionRepo.findContractById.mockResolvedValue(contract)

    await expect(
      makeService(m).createPaymentCondition(CTR, OUTSIDER, {
        conditionType: ConditionType.CHAPTER_MILESTONE,
        thresholdConfig: { chapter: 10 },
        payoutAmount: 500,
        isRecurring: false
      })
    ).rejects.toMatchObject({ status: 403 })

    expect(m.paymentConditionRepo.create).not.toHaveBeenCalled()
  })

  it('rejects malformed threshold configuration before persistence', async () => {
    const m = makeMocks()
    m.paymentConditionRepo.findContractById.mockResolvedValue(contract)

    await expect(
      makeService(m).createPaymentCondition(CTR, OWNER, {
        conditionType: ConditionType.TIME_BOUND,
        thresholdConfig: { deadline: 'tomorrow' },
        payoutAmount: 500,
        isRecurring: false
      })
    ).rejects.toMatchObject({ status: 400 })

    expect(m.paymentConditionRepo.create).not.toHaveBeenCalled()
  })

  it('requires a recurring chapter condition to be marked recurring', async () => {
    const m = makeMocks()
    m.paymentConditionRepo.findContractById.mockResolvedValue(contract)

    await expect(
      makeService(m).createPaymentCondition(CTR, OWNER, {
        conditionType: ConditionType.RECURRING_CHAPTER,
        thresholdConfig: { every: 3 },
        payoutAmount: 500,
        isRecurring: false
      })
    ).rejects.toMatchObject({ status: 400 })

    expect(m.paymentConditionRepo.create).not.toHaveBeenCalled()
  })

  it('persists a valid owned condition', async () => {
    const m = makeMocks()
    m.paymentConditionRepo.findContractById.mockResolvedValue(contract)
    m.paymentConditionRepo.create.mockResolvedValue(chapterCondition)

    await expect(
      makeService(m).createPaymentCondition(CTR, OWNER, {
        conditionType: ConditionType.CHAPTER_MILESTONE,
        thresholdConfig: { chapter: 10 },
        payoutAmount: 500,
        isRecurring: false
      })
    ).resolves.toMatchObject({ id: CONDITION })

    expect(m.paymentConditionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: CTR,
        conditionType: ConditionType.CHAPTER_MILESTONE,
        thresholdConfig: { chapter: 10 }
      })
    )
  })

  it.each([[PaymentConditionStatus.ACHIEVED], [PaymentConditionStatus.MISSED]])(
    'does not update a terminal %s condition',
    async (status) => {
      const m = makeMocks()
      m.paymentConditionRepo.findContractById.mockResolvedValue(contract)
      m.paymentConditionRepo.findByIdAndContractId.mockResolvedValue({ ...chapterCondition, status })

      await expect(
        makeService(m).updatePaymentCondition(CTR, CONDITION, OWNER, { payoutAmount: 700 })
      ).rejects.toMatchObject({ status: 400 })

      expect(m.paymentConditionRepo.update).not.toHaveBeenCalled()
    }
  )

  it('returns 404 when updating a condition outside the contract scope', async () => {
    const m = makeMocks()
    m.paymentConditionRepo.findContractById.mockResolvedValue(contract)
    m.paymentConditionRepo.findByIdAndContractId.mockResolvedValue(null)

    await expect(
      makeService(m).updatePaymentCondition(CTR, CONDITION, OWNER, { payoutAmount: 700 })
    ).rejects.toMatchObject({ status: 404 })

    expect(m.paymentConditionRepo.update).not.toHaveBeenCalled()
  })

  it('validates an updated threshold against the immutable condition type', async () => {
    const m = makeMocks()
    m.paymentConditionRepo.findContractById.mockResolvedValue(contract)
    m.paymentConditionRepo.findByIdAndContractId.mockResolvedValue(chapterCondition)

    await expect(
      makeService(m).updatePaymentCondition(CTR, CONDITION, OWNER, {
        thresholdConfig: { chapter: -1 }
      })
    ).rejects.toMatchObject({ status: 400 })

    expect(m.paymentConditionRepo.update).not.toHaveBeenCalled()
  })

  it('rejects disabling a condition that has already been achieved', async () => {
    const m = makeMocks()
    m.paymentConditionRepo.findContractById.mockResolvedValue(contract)
    m.paymentConditionRepo.findByIdAndContractId.mockResolvedValue({
      ...chapterCondition,
      status: PaymentConditionStatus.ACHIEVED
    })

    await expect(makeService(m).disablePaymentCondition(CTR, CONDITION, OWNER)).rejects.toMatchObject({
      status: 400
    })
    expect(m.paymentConditionRepo.update).not.toHaveBeenCalled()
  })

  it('updates and disables pending conditions through scoped repository calls', async () => {
    const m = makeMocks()
    m.paymentConditionRepo.findContractById.mockResolvedValue(contract)
    m.paymentConditionRepo.findByIdAndContractId.mockResolvedValue(chapterCondition)
    m.paymentConditionRepo.update.mockResolvedValue(chapterCondition)
    m.paymentConditionState.disable.mockResolvedValue({ ...chapterCondition, status: PaymentConditionStatus.DISABLED })
    const service = makeService(m)

    await service.updatePaymentCondition(CTR, CONDITION, OWNER, { payoutPct: 12 })
    expect(m.paymentConditionRepo.update).toHaveBeenCalledWith(CONDITION, expect.objectContaining({ payoutPct: 12 }))

    await service.disablePaymentCondition(CTR, CONDITION, OWNER)
    expect(m.paymentConditionState.disable).toHaveBeenCalledWith(chapterCondition, OWNER)
  })

  it.each([
    [BOARD, OUTSIDER],
    [EDITOR, OWNER],
    [MANGAKA, contract.mangakaId]
  ])('allows %s to list conditions within its contract scope', async (role, userId) => {
    const m = makeMocks()
    m.paymentConditionRepo.findContractById.mockResolvedValue(contract)

    await expect(makeService(m).getPaymentConditionsByContract(CTR, userId, role)).resolves.toEqual({ data: [] })
    expect(m.paymentConditionRepo.findManyByContractId).toHaveBeenCalledWith(CTR)
  })

  it('denies condition listing to an unrelated actor', async () => {
    const m = makeMocks()
    m.paymentConditionRepo.findContractById.mockResolvedValue(contract)

    await expect(makeService(m).getPaymentConditionsByContract(CTR, OUTSIDER, MANGAKA)).rejects.toMatchObject({
      status: 403
    })
    expect(m.paymentConditionRepo.findManyByContractId).not.toHaveBeenCalled()
  })
})
