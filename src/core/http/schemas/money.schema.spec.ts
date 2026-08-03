import { MONEY_MAX, UNITS_SOLD_MAX, zMoney } from './money.schema'

describe('zMoney', () => {
  const positive = zMoney({ positive: true })
  const nonNegative = zMoney()

  it('nhận số nguyên dương trong trần', () => {
    expect(positive.safeParse(1_000_000).success).toBe(true)
    expect(positive.safeParse(MONEY_MAX).success).toBe(true)
  })

  it('từ chối số vượt trần', () => {
    expect(positive.safeParse(MONEY_MAX + 1).success).toBe(false)
  })

  it('từ chối số thập phân (VND không có hào)', () => {
    expect(positive.safeParse(1000.5).success).toBe(false)
  })

  it('từ chối NaN và Infinity', () => {
    expect(positive.safeParse(Number.NaN).success).toBe(false)
    expect(positive.safeParse(Number.POSITIVE_INFINITY).success).toBe(false)
    expect(positive.safeParse(Number.NEGATIVE_INFINITY).success).toBe(false)
  })

  it('biến thể positive từ chối 0, biến thể mặc định nhận 0', () => {
    expect(positive.safeParse(0).success).toBe(false)
    expect(nonNegative.safeParse(0).success).toBe(true)
  })

  it('từ chối số âm ở cả hai biến thể', () => {
    expect(positive.safeParse(-1).success).toBe(false)
    expect(nonNegative.safeParse(-1).success).toBe(false)
  })

  it('trần bản in là số riêng, lớn hơn 0', () => {
    expect(UNITS_SOLD_MAX).toBeGreaterThan(0)
  })
})
