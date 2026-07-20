import { ContractChangeReasonBodySchema } from './contract-schema'

describe('ContractChangeReasonBodySchema (B-CON-02)', () => {
  it('bắt buộc reason không rỗng', () => {
    expect(ContractChangeReasonBodySchema.safeParse({}).success).toBe(false)
    expect(ContractChangeReasonBodySchema.safeParse({ reason: '' }).success).toBe(false)
    expect(ContractChangeReasonBodySchema.safeParse({ reason: 'Tỉ lệ ăn chia chưa hợp lý' }).success).toBe(true)
  })

  it('chặn reason quá 1000 ký tự', () => {
    expect(ContractChangeReasonBodySchema.safeParse({ reason: 'x'.repeat(1000) }).success).toBe(true)
    expect(ContractChangeReasonBodySchema.safeParse({ reason: 'x'.repeat(1001) }).success).toBe(false)
  })

  it('.strict() từ chối field lạ (tránh FE gửi nhầm `note`)', () => {
    expect(ContractChangeReasonBodySchema.safeParse({ reason: 'ok', note: 'thừa' }).success).toBe(false)
  })
})
