import { ContractListItemSchema, ContractResSchema, RejectContractBodySchema } from './contract-schema'

describe('RejectContractBodySchema (two-phase contract flow)', () => {
  it('bắt buộc reason không rỗng', () => {
    expect(RejectContractBodySchema.safeParse({}).success).toBe(false)
    expect(RejectContractBodySchema.safeParse({ reason: '' }).success).toBe(false)
    expect(RejectContractBodySchema.safeParse({ reason: 'Tỉ lệ ăn chia chưa hợp lý' }).success).toBe(true)
  })

  it('chặn reason quá 1000 ký tự', () => {
    expect(RejectContractBodySchema.safeParse({ reason: 'x'.repeat(1000) }).success).toBe(true)
    expect(RejectContractBodySchema.safeParse({ reason: 'x'.repeat(1001) }).success).toBe(false)
  })

  it('.strict() từ chối field lạ (tránh FE gửi nhầm `note`)', () => {
    expect(RejectContractBodySchema.safeParse({ reason: 'ok', note: 'thừa' }).success).toBe(false)
  })
})

// Spec 25 — chống drift giữa list và detail.
describe('ContractListItemSchema (Spec 25)', () => {
  const listKeys = Object.keys(ContractListItemSchema.shape)
  const detailKeys = Object.keys(ContractResSchema.shape)

  it('bỏ boardDecision + clause dài + mốc ký khỏi list', () => {
    for (const key of [
      'boardDecision',
      'terminationClause',
      'sourceTransferRequestId',
      'mangakaSignedAt',
      'representativeSignedAt',
      'mangakaRejectedAt',
      'rejectionReason'
    ]) {
      expect(listKeys).not.toContain(key)
    }
    expect(listKeys).toHaveLength(19)
  })

  it('giữ status và representative summary để render badge ký kết mới', () => {
    expect(listKeys).toContain('status')
    expect(listKeys).toContain('representativeId')
    expect(listKeys).toContain('representative')
  })

  it('là tập con thực sự của ContractResSchema', () => {
    for (const key of listKeys) expect(detailKeys).toContain(key)
  })
})
