import { CreateBoardSessionBodySchema } from './board-schema'

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
