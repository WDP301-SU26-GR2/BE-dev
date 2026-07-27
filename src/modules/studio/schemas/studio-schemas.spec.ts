import { AssignmentListItemSchema, AssignmentResSchema, InviteListItemSchema, InviteResSchema } from './studio-schemas'

// Spec 25 — chống drift giữa list và detail. `.omit()` giữ 2 schema đồng bộ tự động, nhưng không có
// gì ngăn người sau thêm/bớt key trong danh sách omit. 3 test mỗi schema là lưới đó.
describe('AssignmentListItemSchema (Spec 25)', () => {
  const listKeys = Object.keys(AssignmentListItemSchema.shape)
  const detailKeys = Object.keys(AssignmentResSchema.shape)

  it('bỏ assignedTaskTypes/terminatedReason khỏi list', () => {
    for (const key of ['assignedTaskTypes', 'terminatedReason']) expect(listKeys).not.toContain(key)
    expect(listKeys).toHaveLength(12)
  })

  // activeNow là lazy-compute A-TSK-08 (KHÔNG có trạng thái EXPIRED trong DB) — card cần nó để
  // phân biệt "đang hợp tác" với "hết hạn". toAssignmentListItem phải truyền tiếp tham số `at`
  // của toAssignmentRes, nếu không mỗi item tính theo new Date() riêng → lệch trong cùng response.
  it('giữ activeNow cho card', () => {
    expect(listKeys).toContain('activeNow')
  })

  it('là tập con thực sự của AssignmentResSchema', () => {
    for (const key of listKeys) expect(detailKeys).toContain(key)
  })
})

describe('InviteListItemSchema (Spec 25)', () => {
  const listKeys = Object.keys(InviteListItemSchema.shape)
  const detailKeys = Object.keys(InviteResSchema.shape)

  it('bỏ taskTypes khỏi list', () => {
    expect(listKeys).not.toContain('taskTypes')
    expect(listKeys).toHaveLength(11)
  })

  it('là tập con thực sự của InviteResSchema', () => {
    for (const key of listKeys) expect(detailKeys).toContain(key)
  })
})
