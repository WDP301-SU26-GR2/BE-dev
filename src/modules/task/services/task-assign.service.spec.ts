import { TaskAssignService } from './task-assign.service'
import {
  AssetNotFoundException,
  AssistantNotHiredException,
  NotSeriesOwnerException,
  TaskNotReassignableException
} from '../errors/task.errors'

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
  const notification = { notify: jest.fn() }
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
    expect(notification.notify).toHaveBeenCalled()
  })

  it('reassign rejects non-ON_HOLD task → 409', async () => {
    repo.findTaskById.mockResolvedValue({ id: 't', pageId: 'a'.repeat(24), status: 'IN_PROGRESS' })
    repo.findPageWithOwner.mockResolvedValue(PAGE)
    await expect(service.reassign('m', ID, { assistantId: ID })).rejects.toBe(TaskNotReassignableException)
  })
})
