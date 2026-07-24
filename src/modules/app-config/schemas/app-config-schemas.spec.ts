import { PatchAppConfigBodySchema } from './app-config-schemas'

describe('PatchAppConfigBodySchema', () => {
  it.each([0, -0.01, 1.01])('rejects an aggregate coverage ratio outside (0, 1]: %s', (ratio) => {
    expect(PatchAppConfigBodySchema.safeParse({ rankingAggregateMinCoverageRatio: ratio }).success).toBe(false)
  })

  it('accepts the inclusive upper coverage boundary', () => {
    expect(PatchAppConfigBodySchema.parse({ rankingAggregateMinCoverageRatio: 1 })).toEqual({
      rankingAggregateMinCoverageRatio: 1
    })
  })
})
