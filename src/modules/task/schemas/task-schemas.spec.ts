import { CreateTaskBodySchema, TaskResSchema, UpdateTaskBodySchema } from './task-schemas'

describe('task-schemas', () => {
  it('CreateTaskBody applies defaults (priority=0, assetIds=[])', () => {
    const parsed = CreateTaskBodySchema.parse({ pageId: 'p', assistantId: 'a', taskType: 'BACKGROUND' })
    expect(parsed.priority).toBe(0)
    expect(parsed.assetIds).toEqual([])
  })

  it('CreateTaskBody rejects unknown key (.strict)', () => {
    expect(() => CreateTaskBodySchema.parse({ pageId: 'p', assistantId: 'a', taskType: 'BACKGROUND', x: 1 })).toThrow()
  })

  it('UpdateTaskBody allows omit (partial)', () => {
    expect(UpdateTaskBodySchema.parse({})).toEqual({})
  })

  it('TaskRes keeps assetIds + versions arrays', () => {
    const r = TaskResSchema.parse({
      id: '1',
      pageId: 'p',
      regionId: null,
      assistantId: 'a',
      taskType: 'BACKGROUND',
      status: 'ASSIGNED',
      priority: 0,
      deadline: null,
      assetIds: ['k1'],
      versions: [],
      createdAt: '2026-06-29T00:00:00.000Z'
    })
    expect(r.assetIds).toEqual(['k1'])
  })
})
