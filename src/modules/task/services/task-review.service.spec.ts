import { TaskReviewService } from './task-review.service'
import { NotSeriesOwnerException, NotTaskAssigneeException } from '../errors/task.errors'

const PAGE = {
  id: 'a'.repeat(24),
  chapterId: 'c',
  status: 'IN_PROGRESS',
  chapter: { seriesId: 's', series: { mangakaId: 'm' } }
}
const ID = 'a'.repeat(24)

describe('TaskReviewService', () => {
  const repo = {
    findTaskById: jest.fn(),
    findPageWithOwner: jest.fn(),
    pushTaskVersion: jest.fn(),
    setLatestVersionReview: jest.fn()
  }
  const taskState = { transition: jest.fn() }
  const cascade = { fireOnSubmitted: jest.fn() }
  const notification = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const service = new TaskReviewService(repo as never, taskState as never, cascade as never, notification as never)
  beforeEach(() => jest.clearAllMocks())

  it('start assignee: transition ASSIGNED → IN_PROGRESS', async () => {
    repo.findTaskById
      .mockResolvedValueOnce({ id: 't', pageId: 'a'.repeat(24), assistantId: 'me', status: 'ASSIGNED', versions: [] })
      .mockResolvedValue({
        id: 't',
        pageId: 'a'.repeat(24),
        assistantId: 'me',
        status: 'IN_PROGRESS',
        priority: 0,
        assetIds: [],
        versions: [],
        createdAt: new Date()
      })
    await service.start('me', ID)
    expect(taskState.transition).toHaveBeenCalledWith(ID, 'IN_PROGRESS')
  })

  it('start rejects non-assignee → 403', async () => {
    repo.findTaskById.mockResolvedValue({ id: 't', pageId: 'a'.repeat(24), assistantId: 'OTHER', versions: [] })
    await expect(service.start('me', ID)).rejects.toBe(NotTaskAssigneeException)
  })

  it('submit rejects non-assignee → 403', async () => {
    repo.findTaskById.mockResolvedValue({ id: 't', pageId: 'a'.repeat(24), assistantId: 'OTHER', versions: [] })
    await expect(service.submit('me', ID, { file: 'k' })).rejects.toBe(NotTaskAssigneeException)
  })

  it('submit assignee: transition SUBMITTED + push version + cascade', async () => {
    repo.findTaskById
      .mockResolvedValueOnce({ id: 't', pageId: 'a'.repeat(24), assistantId: 'me', versions: [] })
      .mockResolvedValue({
        id: 't',
        pageId: 'a'.repeat(24),
        assistantId: 'me',
        status: 'SUBMITTED',
        priority: 0,
        assetIds: [],
        versions: [{ versionNumber: 1, reviewStatus: 'PENDING', submittedAt: new Date() }],
        createdAt: new Date()
      })
    repo.findPageWithOwner.mockResolvedValue(PAGE)
    await service.submit('me', ID, { file: 'k' })
    expect(taskState.transition).toHaveBeenCalledWith(ID, 'SUBMITTED')
    expect(repo.pushTaskVersion).toHaveBeenCalledWith(ID, { submittedBy: 'me', versionNumber: 1, file: 'k' })
    expect(cascade.fireOnSubmitted).toHaveBeenCalled()
    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'm', type: 'REVIEW', referenceType: 'TASK_SUBMITTED' })
    )
  })

  it('approve rejects non-owner → 403', async () => {
    repo.findTaskById.mockResolvedValue({ id: 't', pageId: 'a'.repeat(24), assistantId: 'a', versions: [] })
    repo.findPageWithOwner.mockResolvedValue({ ...PAGE, chapter: { seriesId: 's', series: { mangakaId: 'OWNER' } } })
    await expect(service.approve('m', ID)).rejects.toBe(NotSeriesOwnerException)
  })

  it('approve owner: 2-step transition + version APPROVED', async () => {
    repo.findTaskById.mockResolvedValue({
      id: 't',
      pageId: 'a'.repeat(24),
      assistantId: 'a',
      status: 'SUBMITTED',
      priority: 0,
      assetIds: [],
      versions: [],
      createdAt: new Date()
    })
    repo.findPageWithOwner.mockResolvedValue(PAGE)
    await service.approve('m', ID)
    expect(taskState.transition).toHaveBeenNthCalledWith(1, ID, 'UNDER_REVIEW')
    expect(taskState.transition).toHaveBeenNthCalledWith(2, ID, 'APPROVED')
    expect(repo.setLatestVersionReview).toHaveBeenCalledWith(ID, { reviewStatus: 'APPROVED', reviewerNote: null })
    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'a', type: 'TASK', referenceType: 'TASK_APPROVED' })
    )
  })

  it('request revision notifies assistant with TASK_REVISION_REQUESTED', async () => {
    repo.findTaskById.mockResolvedValue({
      id: 't',
      pageId: 'a'.repeat(24),
      assistantId: 'a',
      status: 'SUBMITTED',
      priority: 0,
      assetIds: [],
      versions: [],
      createdAt: new Date()
    })
    repo.findPageWithOwner.mockResolvedValue(PAGE)

    await service.requestRevision('m', ID, { reviewerNote: 'fix tone' })

    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'a', type: 'TASK', referenceType: 'TASK_REVISION_REQUESTED' })
    )
  })
})
