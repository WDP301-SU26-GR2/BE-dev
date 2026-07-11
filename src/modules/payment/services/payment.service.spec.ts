import { PaymentService } from './payment.service'
import { PaymentRecordNotFoundException } from '../errors/payment.error'

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
      findUserById: jest.fn()
    },
    paymentConditionRepo: {},
    eventEmitter: { emit: jest.fn() },
    auditService: { record: jest.fn().mockResolvedValue(undefined) }
  }
}

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
    await expect(makeService(m).getPaymentById('bad-id')).rejects.toMatchObject({ status: 404 })
    expect(m.paymentRepo.findById).not.toHaveBeenCalled()
  })

  it('getPaymentById: id rác ném đúng PaymentRecordNotFoundException', async () => {
    const m = makeMocks()
    await expect(makeService(m).getPaymentById('garbage')).rejects.toBeInstanceOf(PaymentRecordNotFoundException)
    expect(m.paymentRepo.findById).not.toHaveBeenCalled()
  })

  it('approvePayment: id rác → 404 (đi qua getPaymentById, KHÔNG chạm repo)', async () => {
    const m = makeMocks()
    await expect(makeService(m).approvePayment('bad-id', { approvedBy: 'x' })).rejects.toMatchObject({
      status: 404
    })
    expect(m.paymentRepo.findById).not.toHaveBeenCalled()
    expect(m.paymentRepo.update).not.toHaveBeenCalled()
    expect(m.eventEmitter.emit).not.toHaveBeenCalled()
  })

  it('payPayment: id rác → 404 (đi qua getPaymentById, KHÔNG chạm repo)', async () => {
    const m = makeMocks()
    await expect(makeService(m).payPayment('bad-id', {} as never)).rejects.toMatchObject({ status: 404 })
    expect(m.paymentRepo.findById).not.toHaveBeenCalled()
    expect(m.paymentRepo.update).not.toHaveBeenCalled()
    expect(m.eventEmitter.emit).not.toHaveBeenCalled()
  })

  it('cancelPayment: id rác → 404 (đi qua getPaymentById, KHÔNG chạm repo)', async () => {
    const m = makeMocks()
    await expect(makeService(m).cancelPayment('bad-id', {} as never)).rejects.toMatchObject({ status: 404 })
    expect(m.paymentRepo.findById).not.toHaveBeenCalled()
    expect(m.paymentRepo.update).not.toHaveBeenCalled()
  })

  it('getPaymentsByContract: contractId rác → 200 rỗng, KHÔNG chạm repo (tiền lệ PA-02)', async () => {
    const m = makeMocks()
    await expect(makeService(m).getPaymentsByContract('bad-id')).resolves.toEqual({ data: [] })
    expect(m.paymentRepo.findMany).not.toHaveBeenCalled()
  })

  it('getPaymentsBySeries: seriesId rác → 200 rỗng, KHÔNG chạm repo', async () => {
    const m = makeMocks()
    await expect(makeService(m).getPaymentsBySeries('bad-id')).resolves.toEqual({ data: [] })
    expect(m.paymentRepo.findMany).not.toHaveBeenCalled()
  })

  it('getPaymentsByUserId: receiverId rác → 200 rỗng, KHÔNG chạm repo', async () => {
    const m = makeMocks()
    await expect(makeService(m).getPaymentsByUserId('bad-id')).resolves.toEqual({ data: [] })
    expect(m.paymentRepo.findMany).not.toHaveBeenCalled()
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
    await makeService(m).approvePayment('507f1f77bcf86cd799439011', {
      approvedBy: '507f1f77bcf86cd799439012'
    })

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
    await makeService(m).payPayment('507f1f77bcf86cd799439012', {} as never)

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
    await makeService(m).cancelPayment('507f1f77bcf86cd799439013', {
      cancelReason: 'dead contract'
    })

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
