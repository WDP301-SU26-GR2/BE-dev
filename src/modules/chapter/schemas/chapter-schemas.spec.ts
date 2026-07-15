import { ReasonBodySchema, RevisionReasonBodySchema } from './chapter-schemas'

describe('chapter reason schemas', () => {
  it('requires a non-empty reason for manuscript revision requests', () => {
    expect(RevisionReasonBodySchema.safeParse({}).success).toBe(false)
    expect(RevisionReasonBodySchema.safeParse({ reason: '' }).success).toBe(false)
    expect(RevisionReasonBodySchema.safeParse({ reason: 'Fix the dialogue' }).success).toBe(true)
  })

  it('keeps the shared ReasonBodySchema optional for co-owner rejection', () => {
    expect(ReasonBodySchema.safeParse({}).success).toBe(true)
    expect(
      (ReasonBodySchema as typeof ReasonBodySchema & { metaOpenApi?: Record<string, unknown> }).metaOpenApi
    ).toMatchObject({
      title: 'OptionalReasonBody',
      description: 'Optional reason for co-owner rejection and other general chapter actions'
    })
    expect(
      (RevisionReasonBodySchema as typeof RevisionReasonBodySchema & { metaOpenApi?: Record<string, unknown> })
        .metaOpenApi
    ).toMatchObject({ title: 'RevisionReasonBody' })
  })
})
