import { PaymentConditionModelSchema } from 'src/modules/payment/schemas/payment-condition.model'
import { BoardDecisionSchema } from './board.model'
import { BoardDecisionResSchema } from './board-schema'

describe('commercial JSON schemas', () => {
  it.each([
    BoardDecisionSchema.shape.details,
    BoardDecisionResSchema.shape.details,
    PaymentConditionModelSchema.shape.thresholdConfig
  ])('accepts JSON values and rejects non-JSON runtime values', (schema) => {
    expect(schema.safeParse({ threshold: 10, enabled: true, tags: ['a'], note: null }).success).toBe(true)
    expect(schema.safeParse({ invalid: new Date() }).success).toBe(false)
  })
})
