import {
  BoardConfigResSchema,
  CreateBoardDecisionBodySchema,
  CreateBoardSessionBodySchema,
  ListBoardDecisionsQuerySchema,
  ListBoardSessionsQuerySchema,
  UpdateBoardConfigBodySchema
} from './board-schema'

describe('CreateBoardSessionBodySchema endTime (Fix-2)', () => {
  const base = {
    title: 'Phien hop thang 7',
    startTime: new Date(Date.now() + 3_600_000).toISOString(),
    allowedEditorIds: ['012345678901234567890123', '012345678901234567890124', '012345678901234567890125']
  }

  it('accepts endTime after startTime', () => {
    const result = CreateBoardSessionBodySchema.safeParse({
      ...base,
      endTime: new Date(Date.now() + 7_200_000).toISOString()
    })
    expect(result.success).toBe(true)
  })

  it('rejects endTime <= startTime', () => {
    const result = CreateBoardSessionBodySchema.safeParse({
      ...base,
      endTime: new Date(Date.now() + 1_800_000).toISOString()
    })
    expect(result.success).toBe(false)
  })

  it('accepts missing endTime', () => {
    expect(CreateBoardSessionBodySchema.safeParse(base).success).toBe(true)
  })
})

describe('CreateBoardDecisionBodySchema details validation (Spec 16)', () => {
  const base = {
    boardSessionId: 'a'.repeat(24),
    decisionType: 'SERIALIZATION',
    targetSeriesId: 'b'.repeat(24)
  }
  const slot = { magazine: 'Weekly Mangaka Jump', startIssueNumber: 32, publicationType: 'WEEKLY' }

  it('accepts SERIALIZATION with a complete publication slot', () => {
    expect(CreateBoardDecisionBodySchema.safeParse({ ...base, details: slot }).success).toBe(true)
  })

  it('rejects SERIALIZATION with missing or invalid publication slot fields', () => {
    expect(CreateBoardDecisionBodySchema.safeParse(base).success).toBe(false)
    expect(CreateBoardDecisionBodySchema.safeParse({ ...base, details: {} }).success).toBe(false)
    expect(CreateBoardDecisionBodySchema.safeParse({ ...base, details: { ...slot, magazine: ' ' } }).success).toBe(
      false
    )
    expect(
      CreateBoardDecisionBodySchema.safeParse({ ...base, details: { ...slot, publicationType: 'DAILY' } }).success
    ).toBe(false)
    expect(
      CreateBoardDecisionBodySchema.safeParse({ ...base, details: { ...slot, startIssueNumber: 0 } }).success
    ).toBe(false)
  })

  it('allows optional CANCELLATION allowance and enforces integer range 1..10 when present', () => {
    const cancellation = { ...base, decisionType: 'CANCELLATION' }
    expect(CreateBoardDecisionBodySchema.safeParse({ ...cancellation, details: null }).success).toBe(true)
    expect(
      CreateBoardDecisionBodySchema.safeParse({ ...cancellation, details: { endingChapterAllowance: 3 } }).success
    ).toBe(true)
    expect(
      CreateBoardDecisionBodySchema.safeParse({ ...cancellation, details: { endingChapterAllowance: 0 } }).success
    ).toBe(false)
    expect(
      CreateBoardDecisionBodySchema.safeParse({ ...cancellation, details: { endingChapterAllowance: 11 } }).success
    ).toBe(false)
  })

  it('keeps details free-form for other current DecisionType values', () => {
    expect(CreateBoardDecisionBodySchema.safeParse({ ...base, decisionType: 'REPRINT', details: {} }).success).toBe(
      true
    )
  })
})

describe('ListBoardSessionsQuerySchema mine parsing (Spec 16)', () => {
  it('parses true and false without truthy string coercion', () => {
    expect(ListBoardSessionsQuerySchema.parse({ mine: 'true' }).mine).toBe(true)
    expect(ListBoardSessionsQuerySchema.parse({ mine: 'false' }).mine).toBe(false)
  })

  it('rejects non-boolean query strings', () => {
    expect(ListBoardSessionsQuerySchema.safeParse({ mine: '1' }).success).toBe(false)
  })
})

describe('Board API contracts (Spec 17)', () => {
  it('accepts targetSeriesId alone or combined with boardSessionId', () => {
    expect(ListBoardDecisionsQuerySchema.parse({ targetSeriesId: 'a'.repeat(24) })).toEqual({
      targetSeriesId: 'a'.repeat(24)
    })
    expect(
      ListBoardDecisionsQuerySchema.parse({ boardSessionId: 'b'.repeat(24), targetSeriesId: 'a'.repeat(24) })
    ).toEqual({ boardSessionId: 'b'.repeat(24), targetSeriesId: 'a'.repeat(24) })
  })

  it('documents quorumMin as the default roster size instead of vote quorum', () => {
    expect(UpdateBoardConfigBodySchema.shape.quorumMin.description).toContain('roster')
    expect(BoardConfigResSchema.shape.quorumMin.description).toContain('roster')
  })
})
