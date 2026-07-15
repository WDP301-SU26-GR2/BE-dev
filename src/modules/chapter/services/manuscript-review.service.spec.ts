import { ManuscriptStatus, NotificationType } from '@prisma/client'
import { ManuscriptReviewService } from './manuscript-review.service'

function makeDeps(over: Record<string, unknown> = {}) {
  const repo = {
    findChapterById: jest.fn().mockResolvedValue({ id: 'c1', seriesId: 's1' }),
    findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'u1', editorId: 'e1' }),
    countIncompletePages: jest.fn().mockResolvedValue(0),
    ...over
  }
  const manuscriptState = { transition: jest.fn().mockResolvedValue({ id: 'c1' }) }
  const notification = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const revision = {
    openSafe: jest.fn().mockResolvedValue({ round: 1 }),
    currentRound: jest.fn().mockResolvedValue(1)
  }
  return { repo, manuscriptState, notification, revision }
}

describe('ManuscriptReviewService', () => {
  it('mark-composite-ready (Mangaka) → COMPOSITE_REVIEW', async () => {
    const { repo, manuscriptState, notification, revision } = makeDeps()
    const svc = new ManuscriptReviewService(
      repo as never,
      manuscriptState as never,
      notification as never,
      revision as never
    )
    await svc.markCompositeReady('u1', 'c1')
    expect(manuscriptState.transition).toHaveBeenCalledWith('c1', ManuscriptStatus.COMPOSITE_REVIEW, {
      changedBy: 'u1'
    })
  })

  it('submit blocked when pages not all completed (409)', async () => {
    const { repo, manuscriptState, notification, revision } = makeDeps({
      countIncompletePages: jest.fn().mockResolvedValue(2)
    })
    const svc = new ManuscriptReviewService(
      repo as never,
      manuscriptState as never,
      notification as never,
      revision as never
    )
    await expect(svc.submit('u1', 'c1')).rejects.toBeDefined()
    expect(manuscriptState.transition).not.toHaveBeenCalled()
  })

  it('submit → EDITOR_REVIEW + notify editor', async () => {
    const { repo, manuscriptState, notification, revision } = makeDeps()
    const svc = new ManuscriptReviewService(
      repo as never,
      manuscriptState as never,
      notification as never,
      revision as never
    )
    await svc.submit('u1', 'c1')
    expect(manuscriptState.transition).toHaveBeenCalledWith('c1', ManuscriptStatus.EDITOR_REVIEW, { changedBy: 'u1' })
    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'e1',
        type: NotificationType.REVIEW,
        referenceType: 'MANUSCRIPT_SUBMITTED'
      })
    )
  })

  it('request-revision (Editor) → EDITOR_REVISION + notify mangaka', async () => {
    const { repo, manuscriptState, notification, revision } = makeDeps()
    const svc = new ManuscriptReviewService(
      repo as never,
      manuscriptState as never,
      notification as never,
      revision as never
    )
    revision.openSafe.mockResolvedValueOnce({ round: 2 })
    await svc.requestRevision('e1', 'c1', 'fix dialog')
    expect(manuscriptState.transition).toHaveBeenCalledWith('c1', ManuscriptStatus.EDITOR_REVISION, {
      changedBy: 'e1',
      reason: 'fix dialog'
    })
    expect(revision.openSafe).toHaveBeenCalledWith({
      targetType: 'MANUSCRIPT',
      targetId: 'c1',
      seriesId: 's1',
      reason: 'fix dialog',
      requestedBy: 'e1',
      recipientId: 'u1'
    })
    expect(manuscriptState.transition.mock.invocationCallOrder[0]).toBeLessThan(
      revision.openSafe.mock.invocationCallOrder[0]
    )
    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'u1',
        referenceType: 'MANUSCRIPT_REVISION_REQUESTED',
        content: 'Editor requested revision (round 2): fix dialog'
      })
    )
  })

  it('resubmit uses the current manuscript round in the editor notification', async () => {
    const { repo, manuscriptState, notification, revision } = makeDeps()
    const svc = new ManuscriptReviewService(
      repo as never,
      manuscriptState as never,
      notification as never,
      revision as never
    )
    revision.currentRound.mockResolvedValueOnce(2)

    await svc.resubmit('u1', 'c1')

    expect(revision.currentRound).toHaveBeenCalledWith('MANUSCRIPT', 'c1')
    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'e1',
        referenceType: 'MANUSCRIPT_RESUBMITTED',
        content: 'Manuscript resubmitted (round 2)'
      })
    )
  })

  it('approve (Editor) → READY_FOR_PRINT', async () => {
    const { repo, manuscriptState, notification, revision } = makeDeps()
    const svc = new ManuscriptReviewService(
      repo as never,
      manuscriptState as never,
      notification as never,
      revision as never
    )
    await svc.approve('e1', 'c1')
    expect(manuscriptState.transition).toHaveBeenCalledWith('c1', ManuscriptStatus.READY_FOR_PRINT, { changedBy: 'e1' })
    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'u1', referenceType: 'MANUSCRIPT_APPROVED' })
    )
  })

  it('non-owner submit forbidden (403)', async () => {
    const { repo, manuscriptState, notification, revision } = makeDeps()
    const svc = new ManuscriptReviewService(
      repo as never,
      manuscriptState as never,
      notification as never,
      revision as never
    )
    await expect(svc.submit('other', 'c1')).rejects.toBeDefined()
  })
})
