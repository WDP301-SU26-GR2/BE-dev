import { RoleName } from 'src/core/security/constants/role.constant'
import { ReprintAccessPolicy } from './reprint-access.policy'
import { ReprintAssignmentService } from './reprint-assignment.service'
import { ReprintChapterService } from './reprint-chapter.service'
import { ReprintCreationService } from './reprint-creation.service'
import { ReprintQueryService } from './reprint-query.service'
import { ReprintRequestFacade } from './reprint-request.facade'
import { ReprintReviewService } from './reprint-review.service'
import { ReprintWorkflowService } from './reprint-workflow.service'

const REQUEST_ID = '012345678901234567890123'
const CHAPTER_A = '0123456789abcdef01234567'
const CHAPTER_B = '0123456789abcdef01234568'

const makeService = (overrides: Record<string, jest.Mock> = {}) => {
  const repo = {
    findById: jest.fn().mockResolvedValue({
      id: REQUEST_ID,
      seriesId: 'series-1',
      requestedBy: 'editor-1',
      status: 'BOARD_APPROVED',
      chapters: [
        {
          originalChapterId: CHAPTER_A,
          status: 'READY',
          reviserId: 'reviser-a',
          reviserType: 'OTHER_MANGAKA'
        },
        { originalChapterId: CHAPTER_B, status: 'READY' }
      ]
    }),
    findAccessContext: jest.fn().mockResolvedValue({
      editorId: 'editor-1',
      ownerMangakaIds: ['owner-1']
    }),
    findActiveContractBySeriesId: jest.fn(),
    findOriginalChaptersByRange: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    ...overrides
  }
  const notification = { notifySafe: jest.fn() }
  const audit = { record: jest.fn() }
  const state = {
    assertTransition: jest.fn(),
    audit: jest.fn(),
    transition: jest
      .fn()
      .mockImplementation((id: string, _from: string, to: string, _actorId: string, _reason: string, patch = {}) =>
        Promise.resolve({ id, status: to, ...patch })
      )
  }
  const policy = new ReprintAccessPolicy()
  const service = new ReprintRequestFacade(
    new ReprintQueryService(repo as never, policy),
    new ReprintChapterService(repo as never, notification as never, audit as never, state as never, policy),
    new ReprintWorkflowService(
      new ReprintCreationService(repo as never, notification as never, policy),
      new ReprintReviewService(repo as never, notification as never, state as never),
      new ReprintAssignmentService(repo as never, notification as never, audit as never, policy)
    )
  )
  return { service, repo, notification }
}

describe('Reprint object-level mutation authorization', () => {
  it('other editor cannot create and no mutation/notification side effect runs', async () => {
    const { service, repo, notification } = makeService()

    await expect(
      service.create(
        { userId: 'editor-2', roleName: RoleName.EDITOR },
        {
          seriesId: '012345678901234567890999',
          revisionMode: 'AS_IS',
          reason: 'unauthorized',
          chapterRangeStart: 1,
          chapterRangeEnd: 2
        }
      )
    ).rejects.toMatchObject({ status: 403 })

    expect(repo.findActiveContractBySeriesId).not.toHaveBeenCalled()
    expect(repo.findOriginalChaptersByRange).not.toHaveBeenCalled()
    expect(repo.create).not.toHaveBeenCalled()
    expect(notification.notifySafe).not.toHaveBeenCalled()
  })

  it.each([
    ['other mangaka', { userId: 'other-1', roleName: RoleName.MANGAKA }, CHAPTER_A],
    ['reviser assigned to chapter A targeting B', { userId: 'reviser-a', roleName: RoleName.MANGAKA }, CHAPTER_B]
  ])('%s cannot upload manuscript and causes no side effect', async (_label, actor, chapterId) => {
    const { service, repo, notification } = makeService()

    await expect(
      service.updateChapterManuscript(
        REQUEST_ID,
        chapterId,
        { originalChapterId: chapterId, manuscriptFile: 'manuscripts/forbidden.pdf' },
        actor
      )
    ).rejects.toMatchObject({ status: 403 })

    expect(repo.update).not.toHaveBeenCalled()
    expect(notification.notifySafe).not.toHaveBeenCalled()
  })

  it('other editor cannot approve and causes no mutation side effect', async () => {
    const { service, repo, notification } = makeService()

    await expect(
      service.approveChapter(
        REQUEST_ID,
        CHAPTER_A,
        { originalChapterId: CHAPTER_A, approve: true },
        { userId: 'editor-2', roleName: RoleName.EDITOR }
      )
    ).rejects.toMatchObject({ status: 403 })

    expect(repo.update).not.toHaveBeenCalled()
    expect(notification.notifySafe).not.toHaveBeenCalled()
  })
})
