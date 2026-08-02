import { MESSAGE_CATALOGS } from './error-text.registry'

// §3.1 Spec 29 — từ BẮT BUỘC dịch. Không có \b ở regex sẽ khớp nhầm `seriesId` → phải giữ \b.
const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bseries\b/i, 'bộ truyện'],
  [/\bmangaka\b/i, 'tác giả'],
  [/\bdeadline\b/i, 'hạn nộp'],
  [/\beditor\b/i, 'biên tập viên'],
  [/\btask\b/i, 'công việc'],
  [/\bstoryboard\b/i, 'bản phác thảo'],
  [/\breview\b/i, 'duyệt / xem xét'],
  [/\bboard\b/i, 'Hội đồng'],
  [/\bcanvas\b/i, 'khung vẽ'],
  [/\btoken\b/i, 'phiên đăng nhập']
]

// CHỈ soi nhóm hiển thị. Nhóm `error` là MÃ LỖI (Error.PascalCase) — giữ tiếng Anh, KHÔNG soi.
const DISPLAY_GROUPS = ['response', 'notification', 'reason', 'errorText'] as const

// Giá trị có thể là string hoặc hàm template. Với hàm, gọi bằng đối số giả để lấy chuỗi thật.
// Gọi 2 bộ đối số để phủ cả nhánh `x != null ? ... : ...`.
const renderValues = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  if (typeof value !== 'function') return []
  const out: string[] = []
  for (const args of [
    [1, 'x', 'y'],
    [null, 'x', 'y']
  ]) {
    try {
      const r = (value as (...a: unknown[]) => unknown)(...args)
      if (typeof r === 'string') out.push(r)
    } catch {
      // Chữ ký khác — bỏ qua, bộ đối số kia đã phủ.
    }
  }
  return out
}

type AnyCatalog = Record<string, Record<string, unknown> | undefined>

describe('Message hiển thị phải là tiếng Việt (Spec 29)', () => {
  it('không còn từ tiếng Anh nằm trong bảng từ điển bắt buộc dịch', () => {
    const violations: string[] = []

    for (const { name, catalog } of MESSAGE_CATALOGS) {
      for (const group of DISPLAY_GROUPS) {
        const entries = (catalog as unknown as AnyCatalog)[group]
        if (!entries) continue
        // ⚠️ CHỈ soi VALUE. Key của errorText là `Error.SeriesNotFound`, soi key sẽ báo nhầm.
        for (const [key, value] of Object.entries(entries)) {
          for (const text of renderValues(value)) {
            for (const [re, vi] of FORBIDDEN) {
              if (re.test(text)) violations.push(`${name}.${group}.${key}: "${text}" → dùng "${vi}"`)
            }
          }
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('không còn câu tiếng Anh nguyên văn trong text hiển thị', () => {
    const asciiOnly = /^[\x20-\x7E]+$/
    const violations: string[] = []

    for (const { name, catalog } of MESSAGE_CATALOGS) {
      for (const group of DISPLAY_GROUPS) {
        const entries = (catalog as unknown as AnyCatalog)[group]
        if (!entries) continue
        for (const [key, value] of Object.entries(entries)) {
          if (typeof value !== 'string') continue // Hàm template có nội suy → bỏ qua ở test này.
          if (!asciiOnly.test(value)) continue // Có dấu tiếng Việt → đạt.
          const words = value.match(/[A-Za-z]+/g) ?? []
          if (words.length < 3) continue // Quá ngắn, không phải câu.
          violations.push(`${name}.${group}.${key}: "${value}"`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('allowlist hoạt động — từ mượn hợp lệ KHÔNG bị báo vi phạm', () => {
    const allowed = [
      'Đã gửi mã OTP',
      'Email này đã được đăng ký',
      'Không tìm thấy hợp tác studio',
      'Đã ghi nhận doanh số tankobon',
      'Thông tin đăng nhập Google không hợp lệ'
    ]
    for (const text of allowed) {
      expect(FORBIDDEN.filter(([re]) => re.test(text))).toEqual([])
    }
  })
})
