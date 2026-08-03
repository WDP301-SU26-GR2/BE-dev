import { CreateContractBodySchema } from 'src/modules/contract/schemas/contract-schema'
import { CreateAmendmentBodySchema } from 'src/modules/contract/schemas/contract-amendment-schema'
import {
  CreatePaymentConditionBodySchema,
  UpdatePaymentConditionBodySchema
} from 'src/modules/payment/schemas/payment-condition-schema'
import { CreatePaymentInternalSchema } from 'src/modules/payment/schemas/payment-schema'
import { CreateTransferContractSchema } from 'src/modules/transfer/schemas/transfer-schema'
import { CreateTankobonSalesBodySchema } from 'src/modules/tankobon/schemas/tankobon-schemas'
import { MONEY_MAX, UNITS_SOLD_MAX } from './money.schema'

// Khoá hành vi: mọi field tiền INPUT phải chặn trần + số nguyên.
describe('áp dụng zMoney cho field tiền input', () => {
  const validContract = {
    seriesId: '507f1f77bcf86cd799439011',
    mangakaId: '507f1f77bcf86cd799439012',
    boardDecisionId: '507f1f77bcf86cd799439013',
    contractType: 'FULL_BUYOUT',
    valuationAmount: 1_000_000,
    publisherOwnershipPct: 100,
    mangakaOwnershipPct: 0,
    terminationClause: 'điều khoản',
    contractStart: '2026-01-01T00:00:00.000Z',
    contractEnd: '2027-01-01T00:00:00.000Z'
  }

  it('hợp đồng: valuationAmount vượt trần → thất bại', () => {
    const r = CreateContractBodySchema.safeParse({ ...validContract, valuationAmount: MONEY_MAX + 1 })
    expect(r.success).toBe(false)
  })

  it('hợp đồng: valuationAmount có phần thập phân → thất bại', () => {
    const r = CreateContractBodySchema.safeParse({ ...validContract, valuationAmount: 1000.5 })
    expect(r.success).toBe(false)
  })

  it('hợp đồng: giá trị hợp lệ vẫn qua', () => {
    const r = CreateContractBodySchema.safeParse(validContract)
    expect(r.success).toBe(true)
  })

  it('phụ lục hợp đồng: valuationAmount vượt trần → thất bại', () => {
    const r = CreateAmendmentBodySchema.safeParse({
      changedClauses: ['điều khoản X'],
      valuationAmount: MONEY_MAX + 1
    })
    expect(r.success).toBe(false)
  })

  it('điều kiện thanh toán (create): payoutAmount vượt trần → thất bại', () => {
    const r = CreatePaymentConditionBodySchema.safeParse({
      contractId: '507f1f77bcf86cd799439011',
      payoutAmount: MONEY_MAX + 1,
      conditionType: 'FIXED'
    })
    expect(r.success).toBe(false)
  })

  it('điều kiện thanh toán (update): payoutAmount vượt trần → thất bại', () => {
    const r = UpdatePaymentConditionBodySchema.safeParse({ payoutAmount: MONEY_MAX + 1 })
    expect(r.success).toBe(false)
  })

  it('thanh toán: amount vượt trần → thất bại', () => {
    const r = CreatePaymentInternalSchema.safeParse({
      receiverId: '507f1f77bcf86cd799439011',
      amount: MONEY_MAX + 1,
      paymentType: 'CHAPTER_PAYOUT',
      contractId: '507f1f77bcf86cd799439012'
    })
    expect(r.success).toBe(false)
  })

  it('chuyển nhượng: transferAmount vượt trần → thất bại', () => {
    const r = CreateTransferContractSchema.safeParse({
      transferRequestId: '507f1f77bcf86cd799439011',
      transferAmount: MONEY_MAX + 1,
      transferType: 'PARTIAL_TRANSFER',
      newOwnershipSplit: { A: 50, B: 50 }
    })
    expect(r.success).toBe(false)
  })

  it('tankobon: unitsSold vượt trần → thất bại', () => {
    const r = CreateTankobonSalesBodySchema.safeParse({
      tankobonId: '507f1f77bcf86cd799439011',
      unitsSold: UNITS_SOLD_MAX + 1,
      period: '2026-Q1'
    })
    expect(r.success).toBe(false)
  })

  it('tankobon: unitsSold có phần thập phân → thất bại', () => {
    const r = CreateTankobonSalesBodySchema.safeParse({
      tankobonId: '507f1f77bcf86cd799439011',
      unitsSold: 100.5,
      period: '2026-Q1'
    })
    expect(r.success).toBe(false)
  })
})
