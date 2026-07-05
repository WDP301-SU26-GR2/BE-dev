import { TaskAssignService } from './task-assign.service'
import {
  AssetNotFoundException,
  AssistantNotHiredException,
  NotSeriesOwnerException,
  TaskNotCancellableException,
  TaskNotReassignableException
} from '../errors/task.errors'
import { TaskMessages } from '../task.messages'

const PAGE = {
  id: 'a'.repeat(24),
  chapterId: 'c',
  status: 'IN_PROGRESS',
  chapter: { seriesId: 's', series: { mangakaId: 'm' } }
}
const ID = 'a'.repeat(24)

describe('TaskAssignService', () => {
  const repo = {
    findPageWithOwner: jest.fn(),
    createTask: jest.fn(),
    findTaskById: jest.fn(),
    setAssistant: jest.fn(),
    updateTaskFields: jest.fn()
  }
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
