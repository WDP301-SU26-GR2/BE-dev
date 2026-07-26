import { ConditionType } from '@prisma/client'
import { CreatePaymentConditionBodySchema, UpdatePaymentConditionBodySchema } from './payment-condition-schema'

describe('PaymentCondition request schemas', () => {
  it.each([
    [ConditionType.CHAPTER_MILESTONE, { chapter: 12 }],
    [ConditionType.RECURRING_CHAPTER, { every: 3 }],
    [ConditionType.RANKING_MILESTONE, { topRank: 5 }],
    [ConditionType.TIME_BOUND, { deadline: '2026-12-31' }]
  ])('accepts valid %s threshold configuration', (conditionType, thresholdConfig) => {
    const result = CreatePaymentConditionBodySchema.safeParse({
      conditionType,
      thresholdConfig,
      payoutAmount: 100,
      isRecurring: conditionType === ConditionType.RECURRING_CHAPTER
    })

    expect(result.success).toBe(true)
  })

  it.each([
    [ConditionType.CHAPTER_MILESTONE, { chapter: 0 }],
    [ConditionType.RECURRING_CHAPTER, { every: -1 }],
    [ConditionType.RANKING_MILESTONE, { topRank: 'first' }],
    [ConditionType.TIME_BOUND, { deadline: '31/12/2026' }]
  ])('rejects invalid %s threshold configuration', (conditionType, thresholdConfig) => {
    const result = CreatePaymentConditionBodySchema.safeParse({
      conditionType,
      thresholdConfig,
      payoutAmount: 100,
      isRecurring: true
    })

    expect(result.success).toBe(false)
  })

  it('requires at least one payout mechanism', () => {
    const result = CreatePaymentConditionBodySchema.safeParse({
      conditionType: ConditionType.CHAPTER_MILESTONE,
      thresholdConfig: { chapter: 12 }
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ['payoutAmount'] })]))
    }
  })

  it('requires recurring semantics for recurring chapter thresholds', () => {
    const result = CreatePaymentConditionBodySchema.safeParse({
      conditionType: ConditionType.RECURRING_CHAPTER,
      thresholdConfig: { every: 3 },
      payoutAmount: 100,
      isRecurring: false
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ['isRecurring'] })]))
    }
  })

  it('rejects an empty update but accepts every supported update field', () => {
    expect(UpdatePaymentConditionBodySchema.safeParse({}).success).toBe(false)
    expect(UpdatePaymentConditionBodySchema.safeParse({ thresholdConfig: { chapter: 20 } }).success).toBe(true)
    expect(UpdatePaymentConditionBodySchema.safeParse({ payoutAmount: 200 }).success).toBe(true)
    expect(UpdatePaymentConditionBodySchema.safeParse({ payoutPct: 20 }).success).toBe(true)
    expect(UpdatePaymentConditionBodySchema.safeParse({ isRecurring: true }).success).toBe(true)
  })
})
