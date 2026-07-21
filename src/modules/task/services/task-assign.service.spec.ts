import { TaskAssignService } from './task-assign.service'
import { CreateTaskGroupBodySchema } from '../schemas/task-schemas'
import {
  AssetNotFoundException,
  AssistantNotHiredException,
  NotSeriesOwnerException,
  PageNotEditableTaskException,
  RegionNotFoundException,
  TaskNotCancellableException,
  TaskNotReassignableException
} from '../errors/task.errors'
import { TaskMessages } from '../task.messages'

const PAGE = {
  id: 'a'.repeat(24),
  chapterId: 'c',
  status: 'DRAFT',
  chapter: { seriesId: 's', series: { mangakaId: 'm' } }
}
const ID = 'a'.repeat(24)

describe('TaskAssignService', () => {
  const repo = {
    findPageWithOwner: jest.fn(),
    createTask: jest.fn(),
    findTaskById: jest.fn(),
    setAssistant: jest.fn(),
    updateTaskFields: jest.fn(),
    findRegionsByIds: jest.fn()
  }
  const REG = 'b'.repeat(24)
  const studio = { findActiveForPair: jest.fn() }
  const storage = { findAssetsByIds: jest.fn() }
  const taskState = { transition: jest.fn() }
  const notification = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const service = new TaskAssignService(
    repo as never,
    studio as never,
    storage as never,
    taskState as never,
    notification as never
  )
  beforeEach(() => jest.clearAllMocks())

  it('rejects non-owner → 403', async () => {
    repo.findPageWithOwner.mockResolvedValue(PAGE)
    await expect(
      service.create('OTHER', {
        pageId: ID,
        assistantId: ID,
        taskType: 'BACKGROUND',
        priority: 0,
        assetIds: []
      } as never)
    ).rejects.toBe(NotSeriesOwnerException)
  })

  it('rejects assistant not hired → 409', async () => {
    repo.findPageWithOwner.mockResolvedValue(PAGE)
    studio.findActiveForPair.mockResolvedValue(null)
    await expect(
      service.create('m', { pageId: ID, assistantId: ID, taskType: 'BACKGROUND', priority: 0, assetIds: [] } as never)
    ).rejects.toBe(AssistantNotHiredException)
  })

  it('rejects missing asset → 422', async () => {
    repo.findPageWithOwner.mockResolvedValue(PAGE)
    studio.findActiveForPair.mockResolvedValue({ id: 'sa' })
    storage.findAssetsByIds.mockResolvedValue([])
    await expect(
      service.create('m', {
        pageId: ID,
        assistantId: ID,
        taskType: 'BACKGROUND',
        priority: 0,
        assetIds: ['k1']
      } as never)
    ).rejects.toBe(AssetNotFoundException)
  })

  it('rejects task creation on a COMPLETED page before checking hire', async () => {
    repo.findPageWithOwner.mockResolvedValue({ ...PAGE, status: 'COMPLETED' })
    await expect(
      service.create('m', { pageId: ID, assistantId: ID, taskType: 'BACKGROUND', priority: 0, assetIds: [] } as never)
    ).rejects.toBe(PageNotEditableTaskException)
    expect(studio.findActiveForPair).not.toHaveBeenCalled()
  })

  it('rejects task cancellation on a COMPLETED page', async () => {
    repo.findTaskById.mockResolvedValue({ id: ID, pageId: ID, status: 'ASSIGNED', assistantId: ID })
    repo.findPageWithOwner.mockResolvedValue({ ...PAGE, status: 'COMPLETED' })
    await expect(service.cancel('m', ID, {})).rejects.toBe(PageNotEditableTaskException)
    expect(taskState.transition).not.toHaveBeenCalled()
  })

  it('creates task ASSIGNED + notifies', async () => {
    repo.findPageWithOwner.mockResolvedValue(PAGE)
    studio.findActiveForPair.mockResolvedValue({ id: 'sa' })
    repo.createTask.mockResolvedValue({
      id: 't',
      pageId: 'p',
      status: 'ASSIGNED',
      priority: 0,
      assetIds: [],
      versions: [],
      createdAt: new Date()
    })
    await service.create('m', {
      pageId: ID,
      assistantId: ID,
      taskType: 'BACKGROUND',
      priority: 0,
      assetIds: []
    } as never)
    expect(repo.createTask).toHaveBeenCalled()
    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: ID,
        type: 'TASK',
        referenceType: 'TASK_ASSIGNED',
        content: expect.any(String)
      })
    )
  })

  it('validates + passes multiple regionIds (same page) through to createTask', async () => {
    repo.findPageWithOwner.mockResolvedValue(PAGE)
    studio.findActiveForPair.mockResolvedValue({ id: 'sa' })
    repo.findRegionsByIds.mockResolvedValue([
      { id: REG, pageId: PAGE.id },
      { id: 'c'.repeat(24), pageId: PAGE.id }
    ])
    repo.createTask.mockResolvedValue({
      id: 't',
      pageId: PAGE.id,
      regionIds: [REG, 'c'.repeat(24)],
      status: 'ASSIGNED',
      priority: 0,
      assetIds: [],
      versions: [],
      createdAt: new Date()
    })
    await service.create('m', {
      pageId: PAGE.id,
      assistantId: ID,
      taskType: 'BACKGROUND',
      priority: 0,
      assetIds: [],
      regionIds: [REG, 'c'.repeat(24)]
    } as never)
    expect(repo.createTask).toHaveBeenCalledWith(expect.objectContaining({ regionIds: [REG, 'c'.repeat(24)] }))
  })

  it('rejects a regionId that belongs to another page → RegionNotFound', async () => {
    repo.findPageWithOwner.mockResolvedValue(PAGE)
    studio.findActiveForPair.mockResolvedValue({ id: 'sa' })
    repo.findRegionsByIds.mockResolvedValue([{ id: REG, pageId: 'd'.repeat(24) }])
    await expect(
      service.create('m', {
        pageId: PAGE.id,
        assistantId: ID,
        taskType: 'BACKGROUND',
        priority: 0,
        assetIds: [],
        regionIds: [REG]
      } as never)
    ).rejects.toBe(RegionNotFoundException)
    expect(repo.createTask).not.toHaveBeenCalled()
  })

  it('reassign rejects non-ON_HOLD task → 409', async () => {
    repo.findTaskById.mockResolvedValue({ id: 't', pageId: 'a'.repeat(24), status: 'SUBMITTED' })
    repo.findPageWithOwner.mockResolvedValue(PAGE)
    await expect(service.reassign('m', ID, { assistantId: ID })).rejects.toBe(TaskNotReassignableException)
  })

  it('cancels cancellable task with reason and notifies assistant', async () => {
    repo.findTaskById
      .mockResolvedValueOnce({ id: ID, pageId: ID, status: 'ASSIGNED', assistantId: 'old-assistant' })
      .mockResolvedValueOnce({
        id: ID,
        pageId: ID,
        status: 'CANCELLED',
        assistantId: 'old-assistant',
        priority: 0,
        assetIds: [],
        versions: [],
        createdAt: new Date()
      })
    repo.findPageWithOwner.mockResolvedValue(PAGE)
    await service.cancel('m', ID, { reason: 'layout changed' })
    expect(taskState.transition).toHaveBeenCalledWith(ID, 'CANCELLED', 'layout changed', 'm')
    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'old-assistant', referenceType: 'TASK_CANCELLED', referenceId: ID })
    )
  })

  it('rejects APPROVED/CANCELLED task cancellation', async () => {
    repo.findTaskById.mockResolvedValue({ id: ID, pageId: ID, status: 'APPROVED', assistantId: ID })
    repo.findPageWithOwner.mockResolvedValue(PAGE)
    await expect(service.cancel('m', ID, {})).rejects.toBe(TaskNotCancellableException)
  })

  it('skips cancel notification when task has no assistant', async () => {
    repo.findTaskById
      .mockResolvedValueOnce({ id: ID, pageId: ID, status: 'ASSIGNED', assistantId: null })
      .mockResolvedValueOnce({
        id: ID,
        pageId: ID,
        status: 'CANCELLED',
        assistantId: null,
        priority: 0,
        assetIds: [],
        versions: [],
        createdAt: new Date()
      })
    repo.findPageWithOwner.mockResolvedValue(PAGE)
    await service.cancel('m', ID, {})
    expect(notification.notifySafe).not.toHaveBeenCalledWith(
      expect.objectContaining({ referenceType: 'TASK_CANCELLED' })
    )
  })

  it.each(['ASSIGNED', 'IN_PROGRESS', 'REVISION_REQUESTED', 'ON_HOLD'])('reassign allows %s task', async (status) => {
    repo.findTaskById
      .mockResolvedValueOnce({ id: ID, pageId: ID, status, assistantId: 'old-assistant' })
      .mockResolvedValueOnce({
        id: ID,
        pageId: ID,
        status: 'ASSIGNED',
        assistantId: 'new-assistant',
        priority: 0,
        assetIds: [],
        versions: [],
        createdAt: new Date()
      })
    repo.findPageWithOwner.mockResolvedValue(PAGE)
    studio.findActiveForPair.mockResolvedValue({ id: 'sa' })
    await service.reassign('m', ID, { assistantId: 'new-assistant' })
    expect(repo.setAssistant).toHaveBeenCalledWith(ID, 'new-assistant')
    if (status === 'ASSIGNED') {
      expect(taskState.transition).not.toHaveBeenCalled()
    } else {
      expect(taskState.transition).toHaveBeenCalledWith(ID, 'ASSIGNED', TaskMessages.reason.reassigned, 'm')
    }
    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'old-assistant', referenceType: 'TASK_REASSIGNED' })
    )
    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'new-assistant', referenceType: 'TASK_ASSIGNED' })
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Task group: giao MỘT lần cho nhiều trang, nhưng dưới DB vẫn là N task 1-trang
// (giữ nguyên region / pagesReady / cascade / duyệt từng trang).
// ─────────────────────────────────────────────────────────────────────────────
describe('TaskAssignService.createGroup', () => {
  const P1 = '0123456789abcdef01230001'
  const P2 = '0123456789abcdef01230002'
  const A1 = '0123456789abcdef01230003'

  function makeDeps(over: Record<string, unknown> = {}) {
    const taskRepository = {
      findPageWithOwner: jest.fn().mockResolvedValue({
        id: P1,
        chapterId: 'c1',
        status: 'DRAFT',
        chapter: { seriesId: 's1', hold: null, series: { mangakaId: 'mangaka' } }
      }),
      createTasksBatch: jest.fn().mockImplementation((items: Array<Record<string, unknown>>) =>
        Promise.resolve(
          items.map((item, index) => ({
            id: `t${index}`,
            ...item,
            status: 'ASSIGNED',
            statusReason: null,
            versions: [],
            createdAt: new Date('2026-07-21T00:00:00.000Z')
          }))
        )
      ),
      ...over
    }
    const studioAssignmentService = { findActiveForPair: jest.fn().mockResolvedValue({ id: 'sa1' }) }
    const storageRepository = { findAssetsByIds: jest.fn().mockResolvedValue([]) }
    const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
    const taskStateService = { transition: jest.fn() }
    return { taskRepository, studioAssignmentService, storageRepository, notificationService, taskStateService }
  }

  function makeSvc(d: ReturnType<typeof makeDeps>) {
    return new TaskAssignService(
      d.taskRepository as never,
      d.studioAssignmentService as never,
      d.storageRepository as never,
      d.taskStateService as never,
      d.notificationService as never
    )
  }

  const body = { pageIds: [P1, P2], assistantId: A1, taskType: 'BACKGROUND', priority: 0, assetIds: [] }

  it('tạo mỗi trang một task, tất cả dùng CHUNG groupId', async () => {
    const d = makeDeps()

    const res = await makeSvc(d).createGroup('mangaka', { ...body, groupTitle: 'Nền ch.5' } as never)

    const created = d.taskRepository.createTasksBatch.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(created).toHaveLength(2)
    expect(created[0].pageId).toBe(P1)
    expect(created[1].pageId).toBe(P2)
    expect(created[0].groupId).toBeTruthy()
    expect(created[0].groupId).toBe(created[1].groupId)
    expect(created[0].groupTitle).toBe('Nền ch.5')
    expect(res.groupId).toBe(created[0].groupId)
    expect(res.items).toHaveLength(2)
  })

  it('validate TOÀN BỘ trang trước khi tạo (all-or-nothing)', async () => {
    const d = makeDeps({
      findPageWithOwner: jest
        .fn()
        .mockResolvedValueOnce({
          id: P1,
          chapterId: 'c1',
          status: 'DRAFT',
          chapter: { seriesId: 's1', hold: null, series: { mangakaId: 'mangaka' } }
        })
        .mockResolvedValueOnce({
          id: P2,
          chapterId: 'c1',
          status: 'COMPLETED', // trang đã khoá
          chapter: { seriesId: 's1', hold: null, series: { mangakaId: 'mangaka' } }
        })
    })

    await expect(makeSvc(d).createGroup('mangaka', { ...body } as never)).rejects.toBeDefined()
    expect(d.taskRepository.createTasksBatch).not.toHaveBeenCalled()
  })

  it('trang không thuộc mình → không tạo task nào', async () => {
    const d = makeDeps({
      findPageWithOwner: jest.fn().mockResolvedValue({
        id: P1,
        chapterId: 'c1',
        status: 'DRAFT',
        chapter: { seriesId: 's1', hold: null, series: { mangakaId: 'someone-else' } }
      })
    })

    await expect(makeSvc(d).createGroup('mangaka', { ...body } as never)).rejects.toBeDefined()
    expect(d.taskRepository.createTasksBatch).not.toHaveBeenCalled()
  })

  it('assistant chưa được thuê → chặn (BR-ASSIST-01)', async () => {
    const d = makeDeps()
    d.studioAssignmentService.findActiveForPair = jest.fn().mockResolvedValue(null)

    await expect(makeSvc(d).createGroup('mangaka', { ...body } as never)).rejects.toBeDefined()
    expect(d.taskRepository.createTasksBatch).not.toHaveBeenCalled()
  })

  it('mỗi trợ lý nhận đúng một notification cho mỗi task', async () => {
    const d = makeDeps()
    await makeSvc(d).createGroup('mangaka', { ...body } as never)
    expect(d.notificationService.notifySafe).toHaveBeenCalledTimes(2)
  })
})

describe('CreateTaskGroupBodySchema', () => {
  const ID = '0123456789abcdef01230001'

  it('cần ít nhất 1 trang', () => {
    expect(CreateTaskGroupBodySchema.safeParse({ pageIds: [], assistantId: ID, taskType: 'BACKGROUND' }).success).toBe(
      false
    )
  })

  it('chặn quá 50 trang', () => {
    const pageIds = Array.from({ length: 51 }, () => ID)
    expect(CreateTaskGroupBodySchema.safeParse({ pageIds, assistantId: ID, taskType: 'BACKGROUND' }).success).toBe(
      false
    )
  })

  it('nhận đúng shape tối thiểu', () => {
    expect(
      CreateTaskGroupBodySchema.safeParse({ pageIds: [ID], assistantId: ID, taskType: 'BACKGROUND' }).success
    ).toBe(true)
  })
})
