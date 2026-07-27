import { RevisionTargetType } from '@prisma/client'
import { ListRevisionRequestsQuerySchema, RevisionRequestResSchema } from './revision-schemas'

describe('ListRevisionRequestsQuerySchema', () => {
  it('keeps the three-state boolean semantics and applies pagination defaults', () => {
    expect(ListRevisionRequestsQuerySchema.parse({ isResolved: 'false' })).toEqual({
      isResolved: false,
      limit: 20,
      offset: 0
    })
    expect(ListRevisionRequestsQuerySchema.parse({ isResolved: 'true' }).isResolved).toBe(true)
    expect(ListRevisionRequestsQuerySchema.parse({}).isResolved).toBeUndefined()
  })

  it('parses the documented target type and rejects unknown query keys', () => {
    expect(ListRevisionRequestsQuerySchema.parse({ targetType: 'MANUSCRIPT' }).targetType).toBe(
      RevisionTargetType.MANUSCRIPT
    )
    expect(() => ListRevisionRequestsQuerySchema.parse({ unexpected: 'value' })).toThrow()
  })
})

// Spec 25 — revision KHÔNG tách list-item: module này không có route detail
// (`GET /revision-requests/:id` không tồn tại) nên field bỏ khỏi list là mất khỏi mọi đường GET.
describe('RevisionRequestResSchema dùng cho cả list (Spec 25)', () => {
  const keys = Object.keys(RevisionRequestResSchema.shape)

  // 🔴 `reason` = "cần sửa cái gì", người nhận phải đọc được TRƯỚC khi resolve.
  // 🔴 `resolvedBy` + `resolver` = "ai đã sửa xong". Mangaka KHÔNG có endpoint nào resolve
  // id→tên của Assistant, nên bỏ embed là FE chỉ còn một chuỗi ObjectId vô nghĩa.
  it('giữ reason + resolvedBy + resolver vì không có route detail để đọc thay', () => {
    for (const key of ['reason', 'resolvedBy', 'resolver']) expect(keys).toContain(key)
  })

  // Spec 20 AC1: embed là additive — scalar ID phải ở lại cho logic/điều hướng.
  it('mỗi embed người đều đi kèm field ID vô hướng', () => {
    for (const pair of [
      ['requestedBy', 'requester'],
      ['recipientId', 'recipient'],
      ['resolvedBy', 'resolver']
    ]) {
      expect(keys).toContain(pair[0])
      expect(keys).toContain(pair[1])
    }
  })

  it('resolver nullable + optional (chưa resolve thì null; mutation response có thể vắng)', () => {
    expect(RevisionRequestResSchema.shape.resolver.safeParse(null).success).toBe(true)
    expect(RevisionRequestResSchema.shape.resolver.safeParse(undefined).success).toBe(true)
  })
})
