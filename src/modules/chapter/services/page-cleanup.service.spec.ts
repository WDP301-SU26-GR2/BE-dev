import { TaskStatus } from '@prisma/client'
import { PageCleanupService } from './page-cleanup.service'

const PAGE_ID = '507f1f77bcf86cd799439011'
const PAGE_ID_2 = '507f1f77bcf86cd799439012'
const CHAPTER_ID = '507f1f77bcf86cd799439013'

type RemovedTask = {
  id: string
  assistantId: string | null
  status: string
  taskType: string | null
  versionCount: number
}

const build = ({
  removedTasks = [],
  pageTasks = [],
  counts = { deletedTasks: removedTasks.length, deletedRegions: 3, deletedAnnotations: 5 }
}: {
  removedTasks?: RemovedTask[]
  pageTasks?: Array<{ id: string; assistantId: string | null; status: string }>
  counts?: { deletedTasks: number; deletedRegions: number; deletedAnnotations: number }
} = {}) => {
  const auditService = { record: jest.fn().mockResolvedValue(undefined) }
  const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const chapterRepository = {
    findPageById: jest.fn().mockResolvedValue({
      id: PAGE_ID,
      chapterId: CHAPTER_ID,
      status: 'DRAFT',
      originalFile: 'original-key',
      compositeFile: null
    }),
    findPagesByIds: jest.fn().mockResolvedValue([
      { id: PAGE_ID, chapterId: CHAPTER_ID, status: 'DRAFT', originalFile: 'original-key', compositeFile: null },
      { id: PAGE_ID_2, chapterId: CHAPTER_ID, status: 'DRAFT', originalFile: 'original-key-2', compositeFile: null }
    ]),
    findTasksByPage: jest.fn().mockResolvedValue(pageTasks),
    findTasksByPages: jest.fn().mockResolvedValue(pageTasks),
    deletePageCascade: jest.fn().mockResolvedValue({ ...counts, removedTasks }),
    deletePagesCascade: jest.fn().mockResolvedValue({ ...counts, removedTasks })
  }
  const service = new PageCleanupService(
    chapterRepository as never,
    notificationService as never,
    auditService as never,
    { deleteObject: jest.fn().mockResolvedValue(undefined) } as never,
    { requireOwner: jest.fn().mockResolvedValue({ id: CHAPTER_ID }) } as never,
    undefined
  )
  return { service, auditService, notificationService }
}

describe('PageCleanupService audit trail', () => {
  it('writes task id, assistant, type, status and version count into the single-page audit reason', async () => {
    const { service, auditService } = build({
      removedTasks: [{ id: 't1', assistantId: 'a1', status: 'IN_PROGRESS', taskType: 'INKING', versionCount: 2 }]
    })

    const result = await service.deletePage('u1', PAGE_ID)
    const reason = auditService.record.mock.calls[0][0].reason as string

    expect(reason).toContain('t1:a1:INKING:IN_PROGRESS:v2')
    expect(reason).toContain('regions=3')
    expect(reason).toContain('annotations=5')
    expect(result).toEqual({ pageId: PAGE_ID, deletedTasks: 1, deletedRegions: 3 })
    expect(result).not.toHaveProperty('deletedAnnotations')
    expect(result).not.toHaveProperty('removedTasks')
  })

  it('renders an unassigned task without breaking the audit reason', async () => {
    const { service, auditService } = build({
      removedTasks: [{ id: 't2', assistantId: null, status: 'ASSIGNED', taskType: null, versionCount: 0 }]
    })

    await service.deletePage('u1', PAGE_ID)

    expect(auditService.record.mock.calls[0][0].reason).toContain('t2:unassigned:none:ASSIGNED:v0')
  })

  it('caps the task list at 20 entries and reports the remaining count', async () => {
    const removedTasks = Array.from({ length: 25 }, (_, index) => ({
      id: `t${index}`,
      assistantId: null,
      status: 'ASSIGNED',
      taskType: null,
      versionCount: 0
    }))
    const { service, auditService } = build({ removedTasks })

    await service.deletePage('u1', PAGE_ID)
    const reason = auditService.record.mock.calls[0][0].reason as string

    expect(reason).toContain('+5 more')
    expect(reason).not.toContain('t20:')
  })

  it('adds page ids and the task summary to bulk-delete audit without changing the response shape', async () => {
    const { service, auditService } = build({
      removedTasks: [
        { id: 't-bulk', assistantId: 'a-bulk', status: 'UNDER_REVIEW', taskType: 'LETTERING', versionCount: 3 }
      ],
      counts: { deletedTasks: 1, deletedRegions: 4, deletedAnnotations: 6 }
    })

    const result = await service.deletePagesBulk('u1', CHAPTER_ID, { pageIds: [PAGE_ID, PAGE_ID_2] })
    const reason = auditService.record.mock.calls[0][0].reason as string

    expect(reason).toContain(`pages=[${PAGE_ID},${PAGE_ID_2}]`)
    expect(reason).toContain('t-bulk:a-bulk:LETTERING:UNDER_REVIEW:v3')
    expect(reason).toContain('regions=4')
    expect(reason).toContain('annotations=6')
    expect(result).toEqual({ deletedPages: 2, deletedTasks: 1, deletedRegions: 4 })
    expect(result).not.toHaveProperty('deletedAnnotations')
    expect(result).not.toHaveProperty('removedTasks')
  })

  it('keeps task-removal notification behavior based on the pre-delete task list', async () => {
    const { service, notificationService } = build({
      pageTasks: [
        { id: 'notify-me', assistantId: 'assistant-1', status: TaskStatus.ASSIGNED },
        { id: 'skip-unassigned', assistantId: null, status: TaskStatus.ASSIGNED }
      ],
      removedTasks: [
        { id: 'audit-only', assistantId: 'assistant-2', status: 'ASSIGNED', taskType: null, versionCount: 0 }
      ]
    })

    await service.deletePage('u1', PAGE_ID)

    expect(notificationService.notifySafe).toHaveBeenCalledTimes(1)
    expect(notificationService.notifySafe.mock.calls[0][0]).toMatchObject({
      recipientId: 'assistant-1',
      referenceId: 'notify-me',
      referenceType: 'TASK_CANCELLED'
    })
  })
})
