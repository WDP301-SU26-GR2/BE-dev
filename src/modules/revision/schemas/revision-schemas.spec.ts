import { RevisionTargetType } from '@prisma/client'
import { ListRevisionRequestsQuerySchema } from './revision-schemas'

describe('ListRevisionRequestsQuerySchema', () => {
  it('keeps the three-state boolean semantics and applies pagination defaults', () => {
    expect(ListRevisionRequestsQuerySchema.parse({ isResolved: 'false' })).toEqual({
      isResolved: false,
      limit: 20,
      offset: 0
    })
    expect(ListRevisionRequestsQuerySchema.parse({ isResolved: 'true' }).isResolved).toBe(true)
    expect(ListRevisionRequestsQuerySchema.parse({}).isResolved).toBeUndefined()
  })

  it('parses the documented target type and rejects unknown query keys', () => {
    expect(ListRevisionRequestsQuerySchema.parse({ targetType: 'MANUSCRIPT' }).targetType).toBe(
      RevisionTargetType.MANUSCRIPT
    )
    expect(() => ListRevisionRequestsQuerySchema.parse({ unexpected: 'value' })).toThrow()
  })
})
