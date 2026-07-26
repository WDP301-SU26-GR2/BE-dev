import { ReprintChapterService } from './reprint-chapter.service'
import { RoleName } from 'src/core/security/constants/role.constant'

const REQUEST_ID = '0123456789abcdef01234567'
const CHAPTER_ID = '1123456789abcdef01234567'
const SECOND_CHAPTER_ID = '2123456789abcdef01234567'

const makeService = (
  requestOverrides: Record<string, unknown> = {},
  policyOverrides: Record<string, jest.Mock> = {}
) => {
  const request = {
    id: REQUEST_ID,
    seriesId: 'series-1',
    requestedBy: 'editor-1',
    status: 'BOARD_APPROVED',
    chapters: [
      { originalChapterId: CHAPTER_ID, status: 'READY', manuscriptFile: null },
      { originalChapterId: SECOND_CHAPTER_ID, status: 'READY', manuscriptFile: null }
    ],
    ...requestOverrides
  }
  const repository = {
    findById: jest.fn().mockResolvedValue(request),
    findAccessContext: jest.fn().mockResolvedValue({ editorId: 'editor-1', ownerMangakaIds: ['owner-1'] }),
    findActiveContractBySeriesId: jest.fn().mockResolvedValue({ mangakaId: 'owner-1' }),
    update: jest
      .fn()
      .mockImplementation((id: string, data: Record<string, unknown>) => Promise.resolve({ ...request, id, ...data }))
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
    canUpdateManuscript: jest.fn().mockReturnValue(true),
    canCreateOrApprove: jest.fn().mockReturnValue(true),
    ...policyOverrides
  }
  return {
    service: new ReprintChapterService(
      repository as never,
      notification as never,
      audit as never,
      state as never,
      policy as never
    ),
    repository,
    notification,
    audit,
    state,
    policy
  }
}

describe('ReprintChapterService authorization ordering', () => {
  it('checks policy before mutation and side effects', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue({
        id: REQUEST_ID,
        seriesId: 'series-1',
        requestedBy: 'editor-1',
        status: 'BOARD_APPROVED',
        chapters: [{ originalChapterId: CHAPTER_ID, status: 'PENDING' }]
      }),
      findAccessContext: jest.fn().mockResolvedValue({ editorId: 'editor-1', ownerMangakaIds: ['owner-1'] }),
      update: jest.fn()
    }
    const notification = { notifySafe: jest.fn() }
    const audit = { record: jest.fn() }
    const policy = { canUpdateManuscript: jest.fn().mockReturnValue(false) }
    const service = new ReprintChapterService(
      repository as never,
      notification as never,
      audit as never,
      {} as never,
      policy as never
    )

    await expect(
      service.updateChapterManuscript(
        REQUEST_ID,
        CHAPTER_ID,
        { originalChapterId: CHAPTER_ID, manuscriptFile: 's3://manuscript.pdf' },
        { userId: 'outsider', roleName: 'MANGAKA' }
      )
    ).rejects.toMatchObject({ status: 403 })
    expect(repository.update).not.toHaveBeenCalled()
    expect(notification.notifySafe).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })

  it.each([
    ['request', 'bad-request', CHAPTER_ID],
    ['chapter', REQUEST_ID, 'bad-chapter']
  ])('rejects malformed %s id before repository access', async (_label, requestId, chapterId) => {
    const { service, repository } = makeService()

    await expect(
      service.updateChapterManuscript(
        requestId,
        chapterId,
        { originalChapterId: chapterId, manuscriptFile: 'manuscripts/new.pdf' },
        'owner-1'
      )
    ).rejects.toMatchObject({ status: 404 })
    expect(repository.findById).not.toHaveBeenCalled()
  })

  it('returns not found for a valid request id with no record', async () => {
    const { service, repository } = makeService()
    repository.findById.mockResolvedValue(null)

    await expect(
      service.approveChapter(REQUEST_ID, CHAPTER_ID, { originalChapterId: CHAPTER_ID, approve: true }, 'editor-1')
    ).rejects.toMatchObject({ status: 404 })
  })

  it('submits a manuscript, notifies the requester and records the actor audit', async () => {
    const { service, repository, notification, audit, policy } = makeService()

    const result = await service.updateChapterManuscript(
      REQUEST_ID,
      CHAPTER_ID,
      { originalChapterId: CHAPTER_ID, manuscriptFile: 'manuscripts/new.pdf' },
      'owner-1'
    )

    expect(policy.canUpdateManuscript).toHaveBeenCalledWith(
      { userId: 'owner-1', roleName: RoleName.MANGAKA },
      expect.objectContaining({ ownerMangakaIds: ['owner-1'] }),
      CHAPTER_ID
    )
    expect(repository.update).toHaveBeenCalledWith(
      REQUEST_ID,
      expect.objectContaining({
        chapters: expect.arrayContaining([
          expect.objectContaining({
            originalChapterId: CHAPTER_ID,
            manuscriptFile: 'manuscripts/new.pdf',
            status: 'READY'
          })
        ])
      })
    )
    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'editor-1', referenceType: 'REPRINT_CHAPTER_SUBMITTED' })
    )
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'owner-1', action: 'CHAPTER_MANUSCRIPT_SUBMITTED' })
    )
    expect(result.id).toBe(REQUEST_ID)
  })

  it.each(['PENDING', 'PUBLISHED'])('blocks manuscript mutation from invalid request state %s', async (status) => {
    const { service, repository } = makeService({ status })

    await expect(
      service.updateChapterManuscript(
        REQUEST_ID,
        CHAPTER_ID,
        { originalChapterId: CHAPTER_ID, manuscriptFile: 'manuscripts/new.pdf' },
        { userId: 'owner-1', roleName: RoleName.MANGAKA }
      )
    ).rejects.toMatchObject({ status: 409 })
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('does not mutate when the authorized chapter is absent from the embedded request', async () => {
    const { service, repository } = makeService({ chapters: [] })

    await expect(
      service.updateChapterManuscript(
        REQUEST_ID,
        CHAPTER_ID,
        { originalChapterId: CHAPTER_ID, manuscriptFile: 'manuscripts/new.pdf' },
        'owner-1'
      )
    ).rejects.toMatchObject({ status: 404 })
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('sends a rejected chapter back to revision without publishing the request', async () => {
    const { service, repository, notification, state } = makeService()

    await service.approveChapter(REQUEST_ID, CHAPTER_ID, { originalChapterId: CHAPTER_ID, approve: false }, 'editor-1')

    expect(repository.update).toHaveBeenCalledWith(
      REQUEST_ID,
      expect.objectContaining({
        chapters: expect.arrayContaining([
          expect.objectContaining({ originalChapterId: CHAPTER_ID, status: 'IN_REVISION' })
        ])
      })
    )
    expect(state.assertTransition).not.toHaveBeenCalled()
    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ referenceType: 'REPRINT_CHAPTER_REVIEWED' })
    )
  })

  it('approves a non-final chapter without publishing the request', async () => {
    const { service, repository, state } = makeService()

    await service.approveChapter(
      REQUEST_ID,
      CHAPTER_ID,
      { originalChapterId: CHAPTER_ID, approve: true },
      { userId: 'editor-1', roleName: RoleName.EDITOR }
    )

    expect(repository.update).toHaveBeenCalledWith(REQUEST_ID, expect.not.objectContaining({ status: 'PUBLISHED' }))
    expect(state.assertTransition).not.toHaveBeenCalled()
  })

  it('publishes after the final chapter approval and notifies requester plus contract owner', async () => {
    const { service, repository, notification, state } = makeService({
      chapters: [
        { originalChapterId: CHAPTER_ID, status: 'READY' },
        { originalChapterId: SECOND_CHAPTER_ID, status: 'APPROVED' }
      ]
    })

    const result = await service.approveChapter(
      REQUEST_ID,
      CHAPTER_ID,
      { originalChapterId: CHAPTER_ID, approve: true },
      'editor-1'
    )

    expect(state.transition).toHaveBeenCalledWith(
      REQUEST_ID,
      'BOARD_APPROVED',
      'PUBLISHED',
      'editor-1',
      'all chapters approved',
      expect.objectContaining({ chapters: expect.any(Array), publishedAt: expect.any(Date) })
    )
    expect(repository.findActiveContractBySeriesId).toHaveBeenCalledWith('series-1')
    expect(notification.notifySafe).toHaveBeenCalledTimes(2)
    expect(result.status).toBe('PUBLISHED')
  })

  it('publishes without a duplicate owner notification when the active contract has no Mangaka', async () => {
    const { service, repository, notification } = makeService({
      chapters: [{ originalChapterId: CHAPTER_ID, status: 'READY' }],
      requestedBy: null
    })
    repository.findActiveContractBySeriesId.mockResolvedValue(null)

    await service.approveChapter(REQUEST_ID, CHAPTER_ID, { originalChapterId: CHAPTER_ID, approve: true }, 'editor-1')

    expect(notification.notifySafe).toHaveBeenCalledTimes(1)
    expect(notification.notifySafe).toHaveBeenCalledWith(expect.objectContaining({ recipientId: '' }))
  })

  it.each(['PENDING', 'REJECTED'])('blocks editor approval from invalid request state %s', async (status) => {
    const { service, repository } = makeService({ status })

    await expect(
      service.approveChapter(REQUEST_ID, CHAPTER_ID, { originalChapterId: CHAPTER_ID, approve: true }, 'editor-1')
    ).rejects.toMatchObject({ status: 409 })
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('rejects approval of a missing embedded chapter', async () => {
    const { service, repository } = makeService({ chapters: [] })

    await expect(
      service.approveChapter(REQUEST_ID, CHAPTER_ID, { originalChapterId: CHAPTER_ID, approve: true }, 'editor-1')
    ).rejects.toMatchObject({ status: 404 })
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('checks editor policy for approval before any mutation', async () => {
    const { service, repository, policy } = makeService({}, { canCreateOrApprove: jest.fn().mockReturnValue(false) })

    await expect(
      service.approveChapter(
        REQUEST_ID,
        CHAPTER_ID,
        { originalChapterId: CHAPTER_ID, approve: true },
        { userId: 'editor-2', roleName: RoleName.EDITOR }
      )
    ).rejects.toMatchObject({ status: 403 })
    expect(policy.canCreateOrApprove).toHaveBeenCalled()
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('keeps concurrent unauthorized attempts side-effect free', async () => {
    const { service, repository, notification, audit } = makeService(
      {},
      { canUpdateManuscript: jest.fn().mockReturnValue(false) }
    )

    const attempts = await Promise.allSettled([
      service.updateChapterManuscript(
        REQUEST_ID,
        CHAPTER_ID,
        { originalChapterId: CHAPTER_ID, manuscriptFile: 'manuscripts/a.pdf' },
        { userId: 'outsider-a', roleName: RoleName.MANGAKA }
      ),
      service.updateChapterManuscript(
        REQUEST_ID,
        SECOND_CHAPTER_ID,
        { originalChapterId: SECOND_CHAPTER_ID, manuscriptFile: 'manuscripts/b.pdf' },
        { userId: 'outsider-b', roleName: RoleName.MANGAKA }
      )
    ])

    expect(attempts.every((result) => result.status === 'rejected')).toBe(true)
    expect(repository.update).not.toHaveBeenCalled()
    expect(notification.notifySafe).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })
})
