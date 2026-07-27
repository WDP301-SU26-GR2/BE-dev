import { PaymentRecordListItemSchema, PaymentRecordResSchema } from './payment-schema'

// Spec 25 — chống drift giữa list và detail.
// ⚠️ PaymentRecordResSchema phục vụ 4 route (`/payments`, `/payments/contracts/:id/payments`,
// `/payments/series/:id/payments`, `/payments/users/:id/payments`) ⇒ sửa 1 schema là cả 4 đổi theo.
describe('PaymentRecordListItemSchema (Spec 25)', () => {
  const listKeys = Object.keys(PaymentRecordListItemSchema.shape)
  const detailKeys = Object.keys(PaymentRecordResSchema.shape)

  it('bỏ 11 field audit/thao-tác khỏi list', () => {
    for (const key of [
      'description',
      'note',
      'cancelReason',
      'transactionReference',
      'paymentMethod',
      'approvedBy',
      'approvedAt',
      'cancelledAt',
      'createdBy',
      'conditionId',
      'approver'
    ]) {
      expect(listKeys).not.toContain(key)
    }
    expect(listKeys).toHaveLength(13)
  })

  it('giữ amount/status/period + mini-embed series & receiver', () => {
    for (const key of ['amount', 'status', 'period', 'paymentType', 'paymentSource', 'series', 'receiver']) {
      expect(listKeys).toContain(key)
    }
  })

  // Màn danh sách cần sắp xếp/lọc theo ngày chi thật — paidAt KHÔNG được bỏ chung với nhóm
  // field thao-tác (approvedAt/cancelledAt) dù nghe giống nhau.
  it('giữ paidAt để sắp xếp/lọc theo ngày chi', () => {
    expect(listKeys).toContain('paidAt')
  })

  it('là tập con thực sự của PaymentRecordResSchema', () => {
    for (const key of listKeys) expect(detailKeys).toContain(key)
  })
})
