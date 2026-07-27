import { AmendmentListItemSchema, AmendmentResSchema } from './contract-amendment-schema'

// Spec 25 — chống drift giữa list và detail.
describe('AmendmentListItemSchema (Spec 25)', () => {
  const listKeys = Object.keys(AmendmentListItemSchema.shape)
  const detailKeys = Object.keys(AmendmentResSchema.shape)

  it('bỏ signatures/changedClauses + string dài + 2 mốc ký khỏi list', () => {
    for (const key of [
      'signatures',
      'changedClauses',
      'reason',
      'terminationClause',
      'voidReason',
      'mangakaSignedAt',
      'boardSignedAt'
    ]) {
      expect(listKeys).not.toContain(key)
    }
    expect(listKeys).toHaveLength(13)
  })

  // Nội dung phụ lục (reason/changedClauses/signatures) vẫn đọc được ở route detail
  // `GET /contracts/:contractId/amendments/:id` — đã verify route đó tồn tại, nên bỏ khỏi list
  // là an toàn. `status` là thứ card cần để biết phụ lục đang ở đâu trong vòng đời.
  it('giữ status cho card', () => {
    expect(listKeys).toContain('status')
  })

  it('là tập con thực sự của AmendmentResSchema', () => {
    for (const key of listKeys) expect(detailKeys).toContain(key)
  })
})
