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
  const revision = {
    openSafe: jest.fn().mockResolvedValue({ round: 1 }),
    currentRound: jest.fn().mockResolvedValue(1)
  }
  const service = new TaskReviewService(
    repo as never,
    taskState as never,
    cascade as never,
    notification as never,
    revision as never
  )
  beforeEach(() => {
    jest.clearAllMocks()
    revision.openSafe.mockResolvedValue({ round: 1 })
    revision.currentRound.mockResolvedValue(1)
  })

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
    expect(taskState.transition).toHaveBeenCalledWith(ID, 'IN_PROGRESS', undefined, 'me')
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
    expect(taskState.transition).toHaveBeenCalledWith(ID, 'SUBMITTED', undefined, 'me')
    expect(repo.pushTaskVersion).toHaveBeenCalledWith(ID, { submittedBy: 'me', versionNumber: 1, file: 'k' })
    expect(cascade.fireOnSubmitted).toHaveBeenCalled()
    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'm',
        type: 'REVIEW',
        referenceType: 'TASK_SUBMITTED',
        content: 'A task was submitted for your review (version 1)'
      })
    )
  })

  it('puts the version number in TASK_SUBMITTED content so later submissions are not deduped away', async () => {
    repo.findTaskById
      .mockResolvedValueOnce({
        id: 't',
        pageId: 'a'.repeat(24),
        assistantId: 'me',
        versions: [{ versionNumber: 1 }]
      })
      .mockResolvedValue({
        id: 't',
        pageId: 'a'.repeat(24),
        assistantId: 'me',
        status: 'SUBMITTED',
        priority: 0,
        assetIds: [],
        versions: [
          { versionNumber: 1, reviewStatus: 'REVISION_REQUESTED', submittedAt: new Date() },
          { versionNumber: 2, reviewStatus: 'PENDING', submittedAt: new Date() }
        ],
        createdAt: new Date()
      })
    repo.findPageWithOwner.mockResolvedValue(PAGE)

    await service.submit('me', ID, { file: 'k2' })

    expect(repo.pushTaskVersion).toHaveBeenCalledWith(ID, { submittedBy: 'me', versionNumber: 2, file: 'k2' })
    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceType: 'TASK_SUBMITTED',
        content: 'A task was submitted for your review (version 2)'
      })
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
    expect(taskState.transition).toHaveBeenNthCalledWith(1, ID, 'UNDER_REVIEW', undefined, 'm')
    expect(taskState.transition).toHaveBeenNthCalledWith(2, ID, 'APPROVED', undefined, 'm')
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
    revision.openSafe.mockResolvedValueOnce({ round: 2 })

    await service.requestRevision('m', ID, { reviewerNote: 'fix tone' })

    expect(taskState.transition).toHaveBeenNthCalledWith(1, ID, 'UNDER_REVIEW', undefined, 'm')
    expect(taskState.transition).toHaveBeenNthCalledWith(2, ID, 'REVISION_REQUESTED', undefined, 'm')
    expect(revision.openSafe).toHaveBeenCalledWith({
      targetType: 'TASK',
      targetId: ID,
      seriesId: null,
      reason: 'fix tone',
      requestedBy: 'm',
      recipientId: 'a'
    })
    expect(taskState.transition.mock.invocationCallOrder[1]).toBeLessThan(revision.openSafe.mock.invocationCallOrder[0])
    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'a',
        type: 'TASK',
        referenceType: 'TASK_REVISION_REQUESTED',
        content: 'Revision requested on your task (round 2): fix tone'
      })
    )
  })
})
