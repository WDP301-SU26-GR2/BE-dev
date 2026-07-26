import { RoleName } from 'src/core/security/constants/role.constant'
import { ReprintAssignmentService } from './reprint-assignment.service'
import { ReprintChapterService } from './reprint-chapter.service'
import { ReprintCreationService } from './reprint-creation.service'
import { ReprintQueryService } from './reprint-query.service'
import { ReprintRequestFacade } from './reprint-request.facade'
import { ReprintReviewService } from './reprint-review.service'
import { ReprintWorkflowService } from './reprint-workflow.service'

const REQUEST_ID = '0123456789abcdef01234567'
const SERIES_ID = '1123456789abcdef01234567'
const CHAPTER_ID = '2123456789abcdef01234567'
const SECOND_CHAPTER_ID = '3123456789abcdef01234567'

const baseRequest = (overrides: Record<string, unknown> = {}) => ({
  id: REQUEST_ID,
  seriesId: SERIES_ID,
  requestedBy: 'editor-1',
  revisionMode: 'WITH_REVISION',
  status: 'PENDING',
  chapters: [
    { originalChapterId: CHAPTER_ID, status: 'PENDING', reviserId: 'reviser-1', reviserType: 'OTHER_MANGAKA' },
    { originalChapterId: SECOND_CHAPTER_ID, status: 'PENDING' }
  ],
  ...overrides
})

const makeService = (
  requestOverrides: Record<string, unknown> = {},
  repositoryOverrides: Record<string, jest.Mock> = {},
  policyOverrides: Record<string, jest.Mock> = {}
) => {
  const request = baseRequest(requestOverrides)
  const repository = {
    findById: jest.fn().mockResolvedValue(request),
    findManyScoped: jest.fn().mockResolvedValue([request]),
    findAccessContext: jest.fn().mockResolvedValue({ editorId: 'editor-1', ownerMangakaIds: ['owner-1'] }),
    findActiveContractBySeriesId: jest.fn().mockResolvedValue({ contractType: 'FULL_BUYOUT', mangakaId: 'owner-1' }),
    findOriginalChaptersByRange: jest.fn().mockResolvedValue([
      { id: CHAPTER_ID, chapterNumber: 1 },
      { id: SECOND_CHAPTER_ID, chapterNumber: 2 }
    ]),
    findUserRole: jest.fn(),
    create: jest
      .fn()
      .mockImplementation((data: Record<string, unknown>) => Promise.resolve({ id: REQUEST_ID, ...data })),
    update: jest
      .fn()
      .mockImplementation((id: string, data: Record<string, unknown>) => Promise.resolve({ ...request, id, ...data })),
    ...repositoryOverrides
  }
  const notification = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const audit = { record: jest.fn().mockResolvedValue(undefined) }
  const state = {
    assertTransition: jest.fn(),
    audit: jest.fn().mockResolvedValue(undefined),
    transition: jest
      .fn()
      .mockImplementation((id: string, _from: string, to: string, _actorId: string, _reason: string, patch = {}) =>
        Promise.resolve({ ...request, id, status: to, ...patch })
      )
  }
  const policy = {
    canReadRequest: jest.fn().mockReturnValue(true),
    canReadChapter: jest.fn().mockReturnValue(true),
    filterReadableChapters: jest.fn(
      (_actor: unknown, subject: { chapters: Array<Record<string, unknown>> }) => subject.chapters
    ),
    canCreateOrApprove: jest.fn().mockReturnValue(true),
    canAssignReviser: jest.fn().mockReturnValue(true),
    canUpdateManuscript: jest.fn().mockReturnValue(true),
    ...policyOverrides
  }
  return {
    service: new ReprintRequestFacade(
      new ReprintQueryService(repository as never, policy as never),
      new ReprintChapterService(
        repository as never,
        notification as never,
        audit as never,
        state as never,
        policy as never
      ),
      new ReprintWorkflowService(
        new ReprintCreationService(repository as never, notification as never, policy as never),
        new ReprintReviewService(repository as never, notification as never, state as never),
        new ReprintAssignmentService(repository as never, notification as never, audit as never, policy as never)
      )
    ),
    repository,
    notification,
    audit,
    state,
    policy
  }
}

describe('ReprintRequestFacade query behavior', () => {
  it('returns non-Mangaka rows directly and filters Mangaka chapters', async () => {
    const { service, repository, policy } = makeService()

    await expect(service.findAll('board-1', RoleName.BOARD_MEMBER, {})).resolves.toHaveLength(1)
    await expect(service.findAll('reviser-1', RoleName.MANGAKA, {})).resolves.toHaveLength(1)

    expect(repository.findManyScoped).toHaveBeenCalledTimes(2)
    expect(policy.filterReadableChapters).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['findById', (service: ReprintRequestFacade) => service.findById(REQUEST_ID, { userId: 'x', roleName: 'MANGAKA' })],
    [
      'getChapters',
      (service: ReprintRequestFacade) => service.getChapters(REQUEST_ID, { userId: 'x', roleName: 'MANGAKA' })
    ]
  ])('%s conceals unauthorized requests', async (_label, invoke) => {
    const { service } = makeService({}, {}, { canReadRequest: jest.fn().mockReturnValue(false) })

    await expect(invoke(service)).rejects.toMatchObject({ status: 404 })
  })

  it('returns an authorized request, collection, and individual embedded chapter', async () => {
    const { service } = makeService()
    const actor = { userId: 'board-1', roleName: RoleName.BOARD_MEMBER }

    await expect(service.findById(REQUEST_ID, actor)).resolves.toMatchObject({ id: REQUEST_ID })
    await expect(service.getChapters(REQUEST_ID, actor)).resolves.toHaveLength(2)
    await expect(service.getChapterById(REQUEST_ID, CHAPTER_ID, actor)).resolves.toMatchObject({
      originalChapterId: CHAPTER_ID
    })
  })

  it('rejects malformed, missing, unauthorized, and absent chapter reads without leaking data', async () => {
    const actor = { userId: 'reviser-1', roleName: RoleName.MANGAKA }
    const malformed = makeService()
    await expect(malformed.service.findById('bad-id', actor)).rejects.toMatchObject({ status: 404 })
    expect(malformed.repository.findById).not.toHaveBeenCalled()

    const missing = makeService({}, { findById: jest.fn().mockResolvedValue(null) })
    await expect(missing.service.getChapters(REQUEST_ID, actor)).rejects.toMatchObject({ status: 404 })

    const unauthorized = makeService({}, {}, { canReadChapter: jest.fn().mockReturnValue(false) })
    await expect(unauthorized.service.getChapterById(REQUEST_ID, CHAPTER_ID, actor)).rejects.toMatchObject({
      status: 404
    })

    const absent = makeService()
    await expect(absent.service.getChapterById(REQUEST_ID, '4123456789abcdef01234567', actor)).rejects.toMatchObject({
      status: 404
    })
  })
})

describe('ReprintRequestFacade create workflow', () => {
  const dto = {
    seriesId: SERIES_ID,
    revisionMode: 'AS_IS' as const,
    reason: 'Reader demand',
    chapterRangeStart: 1,
    chapterRangeEnd: 2
  }

  it('rejects malformed series ids before access lookup', async () => {
    const { service, repository } = makeService()

    await expect(service.create('editor-1', { ...dto, seriesId: 'bad-id' })).rejects.toMatchObject({ status: 404 })
    expect(repository.findAccessContext).not.toHaveBeenCalled()
  })

  it('rejects a missing contract and an empty original chapter range before creation', async () => {
    const noContract = makeService({}, { findActiveContractBySeriesId: jest.fn().mockResolvedValue(null) })
    await expect(noContract.service.create('editor-1', dto)).rejects.toMatchObject({ status: 404 })
    expect(noContract.repository.create).not.toHaveBeenCalled()

    const noChapters = makeService({}, { findOriginalChaptersByRange: jest.fn().mockResolvedValue([]) })
    await expect(noChapters.service.create('editor-1', dto)).rejects.toMatchObject({ status: 404 })
    expect(noChapters.repository.create).not.toHaveBeenCalled()

    const nullChapters = makeService({}, { findOriginalChaptersByRange: jest.fn().mockResolvedValue(null) })
    await expect(nullChapters.service.create('editor-1', dto)).rejects.toMatchObject({ status: 404 })
  })

  it('creates PENDING embedded chapters and notifies both requester and contract owner', async () => {
    const { service, repository, notification } = makeService()

    const created = await service.create({ userId: 'editor-1', roleName: RoleName.EDITOR }, dto)

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedBy: 'editor-1',
        status: 'PENDING',
        chapters: [
          { originalChapterId: CHAPTER_ID, manuscriptFile: null, status: 'PENDING' },
          { originalChapterId: SECOND_CHAPTER_ID, manuscriptFile: null, status: 'PENDING' }
        ]
      })
    )
    expect(notification.notifySafe).toHaveBeenCalledTimes(2)
    expect(created.status).toBe('PENDING')
  })

  it('creates successfully without an owner notification when the contract owner is absent', async () => {
    const { service, notification } = makeService(
      {},
      { findActiveContractBySeriesId: jest.fn().mockResolvedValue({ contractType: 'FULL_BUYOUT', mangakaId: null }) }
    )

    await service.create('editor-1', dto)

    expect(notification.notifySafe).toHaveBeenCalledTimes(1)
  })
})

describe('ReprintRequestFacade board approval workflow', () => {
  it('rejects malformed and missing requests before contract access', async () => {
    const malformed = makeService()
    await expect(malformed.service.boardApprove('bad-id', { approve: true }, 'board-1')).rejects.toMatchObject({
      status: 404
    })
    expect(malformed.repository.findById).not.toHaveBeenCalled()

    const missing = makeService({}, { findById: jest.fn().mockResolvedValue(null) })
    await expect(missing.service.boardApprove(REQUEST_ID, { approve: true }, 'board-1')).rejects.toMatchObject({
      status: 404
    })
  })

  it('rejects approval when the active contract is missing', async () => {
    const { service, state } = makeService({}, { findActiveContractBySeriesId: jest.fn().mockResolvedValue(null) })

    await expect(service.boardApprove(REQUEST_ID, { approve: true }, 'board-1')).rejects.toMatchObject({
      status: 404
    })
    expect(state.assertTransition).not.toHaveBeenCalled()
  })

  it.each(['PENDING', 'PROPOSED'])('approves FULL_BUYOUT from %s', async (status) => {
    const { service, notification, state } = makeService({ status })

    await expect(service.boardApprove(REQUEST_ID, { approve: true }, 'board-1')).resolves.toMatchObject({
      status: 'BOARD_APPROVED'
    })
    expect(state.transition).toHaveBeenCalledWith(REQUEST_ID, status, 'BOARD_APPROVED', 'board-1', 'board approved', {
      boardApprovedAt: expect.any(Date)
    })
    expect(notification.notifySafe).toHaveBeenCalledTimes(2)
  })

  it('blocks FULL_BUYOUT approval from an invalid state', async () => {
    const { service, repository } = makeService({ status: 'MANGAKA_APPROVED' })

    await expect(service.boardApprove(REQUEST_ID, { approve: true }, 'board-1')).rejects.toMatchObject({
      status: 409
    })
    expect(repository.update).not.toHaveBeenCalled()
  })

  it.each(['MANGAKA_APPROVED', 'MANGAKA_REVIEW'])('approves REVENUE_SHARE from %s', async (status) => {
    const { service } = makeService(
      { status },
      {
        findActiveContractBySeriesId: jest
          .fn()
          .mockResolvedValue({ contractType: 'REVENUE_SHARE', mangakaId: 'owner-1' })
      }
    )

    await expect(service.boardApprove(REQUEST_ID, { approve: true }, 'board-1')).resolves.toMatchObject({
      status: 'BOARD_APPROVED'
    })
  })

  it('blocks REVENUE_SHARE approval before Mangaka consent', async () => {
    const { service, repository } = makeService(
      { status: 'PENDING' },
      {
        findActiveContractBySeriesId: jest
          .fn()
          .mockResolvedValue({ contractType: 'REVENUE_SHARE', mangakaId: 'owner-1' })
      }
    )

    await expect(service.boardApprove(REQUEST_ID, { approve: true }, 'board-1')).rejects.toMatchObject({
      status: 409
    })
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('approves without duplicate owner notification when no Mangaka is attached', async () => {
    const { service, notification } = makeService(
      {},
      { findActiveContractBySeriesId: jest.fn().mockResolvedValue({ contractType: 'FULL_BUYOUT', mangakaId: null }) }
    )

    await service.boardApprove(REQUEST_ID, { approve: true }, 'board-1')

    expect(notification.notifySafe).toHaveBeenCalledTimes(1)
  })
})
