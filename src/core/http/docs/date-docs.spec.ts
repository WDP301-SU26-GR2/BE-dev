import { z } from 'zod'
import { zDateField } from './date-docs'

describe('zDateField', () => {
  const Schema = z.object({
    createdAt: zDateField(),
    decidedAt: zDateField().nullable(),
    endTime: zDateField().nullable().optional()
  })

  it('converts Date to ISO string', () => {
    const out = Schema.parse({ createdAt: new Date('2026-07-12T03:00:00Z'), decidedAt: null })
    expect(out.createdAt).toBe('2026-07-12T03:00:00.000Z')
    expect(out.decidedAt).toBeNull()
  })

  it('passes an ISO string through unchanged (idempotent)', () => {
    const out = Schema.parse({ createdAt: '2026-07-12T03:00:00.000Z', decidedAt: new Date(0) })
    expect(out.createdAt).toBe('2026-07-12T03:00:00.000Z')
    expect(out.decidedAt).toBe('1970-01-01T00:00:00.000Z')
  })

  it('rejects garbage', () => {
    expect(() => Schema.parse({ createdAt: 'not-a-date', decidedAt: null })).toThrow()
  })

  // Guard chống regression: nếu ai đó đổi sang union+transform, z.toJSONSchema sẽ ném
  // "Transforms cannot be represented in JSON Schema" → VỠ BOOT Swagger. Test này bắt được ngay.
  it('produces { type: string, format: date-time } in BOTH json-schema io modes', () => {
    for (const io of ['input', 'output'] as const) {
      const json: any = z.toJSONSchema(Schema, { io })
      expect(json.properties.createdAt.type).toBe('string')
      expect(json.properties.createdAt.format).toBe('date-time')
    }
  })
})
