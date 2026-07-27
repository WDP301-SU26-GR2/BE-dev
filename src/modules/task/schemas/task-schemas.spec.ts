import {
  CreateRegionBodySchema,
  CreateTaskBodySchema,
  ListTasksQuerySchema,
  TaskListItemSchema,
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
      description: null,
      priority: 0,
      deadline: null,
      assetIds: ['k1'],
      versions: [],
      createdAt: '2026-06-29T00:00:00.000Z'
    })
    expect(r.assetIds).toEqual(['k1'])
  })

  it('trims a task description and preserves nullish PATCH semantics', () => {
    const create = CreateTaskBodySchema.parse({
      pageId: 'p',
      assistantId: 'a',
      taskType: 'BACKGROUND',
      description: '  Keep dialogue bubbles intact.  '
    })
    expect(create.description).toBe('Keep dialogue bubbles intact.')
    expect(UpdateTaskBodySchema.parse({ description: null })).toEqual({ description: null })
  })
})

// Spec 25 — chống drift giữa list và detail. `.omit()` giữ 2 schema đồng bộ tự động,
// nhưng không có gì ngăn người sau thêm/bớt key trong danh sách omit. 3 test dưới là lưới đó.
describe('TaskListItemSchema (Spec 25)', () => {
  const listKeys = Object.keys(TaskListItemSchema.shape)
  const detailKeys = Object.keys(TaskResSchema.shape)

  it('bỏ đúng 10 field nặng khỏi list item', () => {
    for (const key of [
      'versions',
      'assets',
      'description',
      'stageInputFile',
      'stageInputSourceType',
      'stageInputRevision',
      'pageOriginalFile',
      'statusReason',
      'startedAt',
      'completedAt'
    ]) {
      expect(listKeys).not.toContain(key)
    }
    expect(listKeys).toHaveLength(16)
  })

  // 🔴 RÀNG BUỘC NGHIỆP VỤ — KHÔNG được bỏ 2 field này để "cho gọn".
  // Assistant bị 403 ở GET /pages/:id/regions ⇒ endpoint task là đường DUY NHẤT
  // họ lấy được toạ độ vùng cần làm (§74 vá lỗ hổng "Flow 3 đứt ở BE").
  // Bỏ đi sẽ làm vỡ F03-RE05 / F03-RE06 — 2 case flowtest tồn tại đúng để canh điều này.
  it('GIỮ regions[] và regionIds cho Assistant', () => {
    expect(listKeys).toContain('regions')
    expect(listKeys).toContain('regionIds')
  })

  it('giữ field mà card danh sách cần', () => {
    for (const key of [
      'id',
      'pageId',
      'assistantId',
      'assistant',
      'taskType',
      'status',
      'stageId',
      'priority',
      'deadline',
      'assetIds',
      'groupId',
      'groupTitle',
      'pageDisplayFile',
      'createdAt'
    ]) {
      expect(listKeys).toContain(key)
    }
  })

  it('là tập con thực sự của TaskResSchema', () => {
    for (const key of listKeys) expect(detailKeys).toContain(key)
  })
})
