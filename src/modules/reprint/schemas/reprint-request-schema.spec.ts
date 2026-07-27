import { ReprintRequestListItemSchema, ReprintRequestResSchema } from './reprint-request-schema'

// Spec 25 — chống drift giữa list và detail.
// `chapters[]` và `reason` vẫn đọc được ở `GET /reprint-requests/:id`.
describe('ReprintRequestListItemSchema (Spec 25)', () => {
  const listKeys = Object.keys(ReprintRequestListItemSchema.shape)
  const detailKeys = Object.keys(ReprintRequestResSchema.shape)

  it('bỏ chapters[]/reason khỏi list', () => {
    for (const key of ['chapters', 'reason']) expect(listKeys).not.toContain(key)
    expect(listKeys).toHaveLength(13)
  })

  // Card phải hiện được "tái bản AS_IS chương 1–10" — 3 field này là nội dung của dòng đó.
  it('giữ revisionMode + khoảng chương cho card', () => {
    for (const key of ['revisionMode', 'chapterRangeStart', 'chapterRangeEnd']) {
      expect(listKeys).toContain(key)
    }
  })

  it('là tập con thực sự của ReprintRequestResSchema', () => {
    for (const key of listKeys) expect(detailKeys).toContain(key)
  })
})
