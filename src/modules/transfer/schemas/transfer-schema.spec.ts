import { TransferRequestListItemSchema, TransferRequestSchema } from './transfer-schema'

// Spec 25 — chống drift giữa list và detail.
// ⚠️ 1 schema ăn 2 route (`/transfers/requests/mine` + `/transfers/requests/pending-board`).
// `planDescription` vẫn đọc được ở `GET /transfers/requests/:id`.
describe('TransferRequestListItemSchema (Spec 25)', () => {
  const listKeys = Object.keys(TransferRequestListItemSchema.shape)
  const detailKeys = Object.keys(TransferRequestSchema.shape)

  it('bỏ planDescription khỏi list', () => {
    expect(listKeys).not.toContain('planDescription')
    expect(listKeys).toHaveLength(14)
  })

  // 🔴 originalContractType là biến điều khiển Ownership Principle (BR-CONTRACT-03): FULL_BUYOUT =
  // Board toàn quyền, REVENUE_SHARE = phải deal với Mangaka gốc. FE cần nó để hiện đúng nhánh
  // ngay ở danh sách, không phải mở từng cái ra mới biết.
  it('giữ originalContractType cho nhánh Ownership Principle', () => {
    expect(listKeys).toContain('originalContractType')
  })

  it('là tập con thực sự của TransferRequestSchema', () => {
    for (const key of listKeys) expect(detailKeys).toContain(key)
  })
})
