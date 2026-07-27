import { AnnotationListResSchema, AnnotationResSchema, ListAnnotationQuerySchema } from './annotation-schemas'

// Spec 25 — annotation KHÔNG tách list-item (không có `GET /annotations/:id` để đọc `content` thay).
// Bù lại bằng phân trang, vì `content` cap 5000 ký tự mà list trước đây trả không giới hạn bản ghi.
describe('ListAnnotationQuerySchema phân trang (Spec 25)', () => {
  const base = { targetType: 'PAGE', targetId: '507f1f77bcf86cd799439011' }

  it('mặc định limit=20 offset=0 khi client không gửi', () => {
    const parsed = ListAnnotationQuerySchema.parse(base)
    expect(parsed.limit).toBe(20)
    expect(parsed.offset).toBe(0)
  })

  it('ép kiểu từ query string', () => {
    const parsed = ListAnnotationQuerySchema.parse({ ...base, limit: '50', offset: '10' })
    expect(parsed.limit).toBe(50)
    expect(parsed.offset).toBe(10)
  })

  // Trần 100 là thứ chặn "1 request kéo cả nghìn ghi chú" — mất nó là mất luôn lý do phân trang.
  it.each([
    ['limit vượt trần', { limit: 101 }],
    ['limit 0', { limit: 0 }],
    ['limit âm', { limit: -1 }],
    ['offset âm', { offset: -1 }]
  ])('từ chối %s', (_label, bad) => {
    expect(ListAnnotationQuerySchema.safeParse({ ...base, ...bad }).success).toBe(false)
  })

  it('vẫn bắt buộc targetType + targetId', () => {
    expect(ListAnnotationQuerySchema.safeParse({ targetId: 'x' }).success).toBe(false)
    expect(ListAnnotationQuerySchema.safeParse({ targetType: 'PAGE' }).success).toBe(false)
  })
})

describe('AnnotationListResSchema (Spec 25)', () => {
  it('trả kèm total/limit/offset như mọi list phân trang khác', () => {
    for (const key of ['items', 'total', 'limit', 'offset']) {
      expect(Object.keys(AnnotationListResSchema.shape)).toContain(key)
    }
  })

  // 🔴 `content` là chính nội dung ghi chú markup review (Flow 3 Mangaka↔Assistant).
  // Không có route detail nào đọc thay ⇒ bỏ khỏi list là chết tính năng, không phải "tối ưu payload".
  it('item vẫn là AnnotationRes đầy đủ, GIỮ content', () => {
    expect(Object.keys(AnnotationResSchema.shape)).toContain('content')
    expect(Object.keys(AnnotationResSchema.shape)).toHaveLength(14)
  })
})
