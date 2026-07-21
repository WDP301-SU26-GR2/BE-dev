import {
  CreateRegionBodySchema,
  CreateTaskBodySchema,
  ListTasksQuerySchema,
  TaskResSchema,
  UpdateRegionBodySchema,
  UpdateTaskBodySchema
} from './task-schemas'

describe('task-schemas', () => {
  describe('region coordinates', () => {
    const validCoordinates = { x: 0, y: 0, width: 1, height: 1 }

    it('CreateRegionBody accepts non-negative origin and positive size', () => {
      expect(CreateRegionBodySchema.safeParse({ coordinates: validCoordinates }).success).toBe(true)
    })

    it.each([
      ['x', -1],
      ['y', -1],
      ['width', 0],
      ['height', 0]
    ] as const)('CreateRegionBody rejects invalid %s coordinate', (field, value) => {
      expect(
        CreateRegionBodySchema.safeParse({
          coordinates: { ...validCoordinates, [field]: value }
        }).success
      ).toBe(false)
    })

    it('UpdateRegionBody rejects invalid coordinate values when coordinates is provided', () => {
      expect(
        UpdateRegionBodySchema.safeParse({
          coordinates: { ...validCoordinates, width: -1 }
        }).success
      ).toBe(false)
    })
  })

  it('CreateTaskBody applies defaults (priority=0, assetIds=[], regionIds=[])', () => {
    const parsed = CreateTaskBodySchema.parse({ pageId: 'p', assistantId: 'a', taskType: 'BACKGROUND' })
    expect(parsed.priority).toBe(0)
    expect(parsed.assetIds).toEqual([])
    expect(parsed.regionIds).toEqual([])
  })

  it('CreateTaskBody accepts multiple regionIds on one page', () => {
    const parsed = CreateTaskBodySchema.parse({
      pageId: 'p',
      assistantId: 'a',
      taskType: 'BACKGROUND',
      regionIds: ['r1', 'r2']
    })
    expect(parsed.regionIds).toEqual(['r1', 'r2'])
  })

  it('CreateTaskBody rejects unknown key (.strict)', () => {
    expect(() => CreateTaskBodySchema.parse({ pageId: 'p', assistantId: 'a', taskType: 'BACKGROUND', x: 1 })).toThrow()
  })

  it('UpdateTaskBody allows omit (partial)', () => {
    expect(UpdateTaskBodySchema.parse({})).toEqual({})
  })

  it('ListTasksQuery accepts regionId filter', () => {
    const parsed = ListTasksQuerySchema.parse({ regionId: '507f1f77bcf86cd799439013' })
    expect(parsed.regionId).toBe('507f1f77bcf86cd799439013')
    expect(parsed.limit).toBe(20)
    expect(parsed.offset).toBe(0)
  })

  it('TaskRes keeps assetIds + versions arrays', () => {
    const r = TaskResSchema.parse({
      id: '1',
      pageId: 'p',
      regionIds: [],
      assistantId: 'a',
      taskType: 'BACKGROUND',
      status: 'ASSIGNED',
      statusReason: null,
      priority: 0,
      deadline: null,
      assetIds: ['k1'],
      versions: [],
      createdAt: '2026-06-29T00:00:00.000Z'
    })
    expect(r.assetIds).toEqual(['k1'])
  })
})
