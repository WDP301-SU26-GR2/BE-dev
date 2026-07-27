import { ContractChangeReasonBodySchema, ContractListItemSchema, ContractResSchema } from './contract-schema'

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

// Spec 25 — chống drift giữa list và detail.
describe('ContractListItemSchema (Spec 25)', () => {
  const listKeys = Object.keys(ContractListItemSchema.shape)
  const detailKeys = Object.keys(ContractResSchema.shape)

  it('bỏ boardDecision + clause dài + 2 mốc ký khỏi list', () => {
    for (const key of [
      'boardDecision',
      'terminationClause',
      'sourceTransferRequestId',
      'mangakaSignedAt',
      'boardSignedAt'
    ]) {
      expect(listKeys).not.toContain(key)
    }
    expect(listKeys).toHaveLength(16)
  })

  // 🔴 Board multi-sign 100% roster (§60.1) nên boardSignedAt KHÔNG cho biết "đã đủ chữ ký chưa".
  // `status` (MANGAKA_SIGNED / FULLY_EXECUTED) mới là thứ render badge đúng — bỏ nó là vỡ card.
  it('giữ status để render badge ký kết', () => {
    expect(listKeys).toContain('status')
  })

  it('là tập con thực sự của ContractResSchema', () => {
    for (const key of listKeys) expect(detailKeys).toContain(key)
  })
})
