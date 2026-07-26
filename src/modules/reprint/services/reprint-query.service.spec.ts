import { ReprintQueryService } from './reprint-query.service'
import { RoleName } from 'src/core/security/constants/role.constant'

const REQUEST_ID = '0123456789abcdef01234567'
const CHAPTER_A = '1123456789abcdef01234567'
const CHAPTER_B = '2123456789abcdef01234567'

const request = {
  id: REQUEST_ID,
  seriesId: 'series-1',
  requestedBy: 'editor-fallback',
  chapters: [
    { originalChapterId: CHAPTER_A, reviserId: 'reviser-1', reviserType: 'OTHER_MANGAKA' },
    { originalChapterId: CHAPTER_B, reviserId: null, reviserType: null }
  ]
}

const makeService = (overrides: Record<string, jest.Mock> = {}) => {
  const repository = {
    findManyScoped: jest.fn().mockResolvedValue([request]),
    findById: jest.fn().mockResolvedValue(request),
    findAccessContext: jest.fn().mockResolvedValue({
      editorId: 'editor-1',
      ownerMangakaIds: ['owner-1']
    }),
    ...overrides
  }
  const policy = {
    canReadRequest: jest.fn().mockReturnValue(true),
    canReadChapter: jest.fn().mockReturnValue(true),
    filterReadableChapters: jest.fn(
      (_actor: unknown, subject: { chapters: Array<Record<string, unknown>> }) => subject.chapters
    )
  }
  return {
    service: new ReprintQueryService(repository as never, policy as never),
    repository,
    policy
  }
}

describe('ReprintQueryService', () => {
  it('rejects malformed ids before repository access', async () => {
    const repository = { findById: jest.fn() }
    const service = new ReprintQueryService(repository as never, {} as never)

    await expect(service.findById('bad-id', { userId: 'u1', roleName: 'EDITOR' })).rejects.toMatchObject({
      status: 404
    })
    expect(repository.findById).not.toHaveBeenCalled()
  })

  it('returns non-Mangaka scoped rows without extra per-row access queries', async () => {
    const { service, repository } = makeService()

    await expect(service.findAll('board-1', RoleName.BOARD_MEMBER, { status: 'PENDING' })).resolves.toEqual([request])
    expect(repository.findManyScoped).toHaveBeenCalledWith({
      userId: 'board-1',
      roleName: RoleName.BOARD_MEMBER,
      status: 'PENDING',
      seriesId: undefined
    })
    expect(repository.findAccessContext).not.toHaveBeenCalled()
  })

  it('filters every Mangaka row through its object-level chapter scope', async () => {
    const second = { ...request, id: '3123456789abcdef01234567', seriesId: 'series-2' }
    const { service, repository, policy } = makeService({
      findManyScoped: jest.fn().mockResolvedValue([request, second])
    })
    policy.filterReadableChapters.mockImplementation(
      (_actor: unknown, subject: { chapters: Array<Record<string, unknown>> }) => subject.chapters.slice(0, 1)
    )

    const rows = await service.findAll('reviser-1', RoleName.MANGAKA, { seriesId: 'series-1' })

    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.chapters.length === 1)).toBe(true)
    expect(repository.findAccessContext).toHaveBeenCalledTimes(2)
  })

  it('uses requestedBy as editor fallback and an empty chapter array when access data is sparse', async () => {
    const sparse = { id: REQUEST_ID, seriesId: 'series-1', requestedBy: 'editor-fallback', chapters: null }
    const { service, repository, policy } = makeService({
      findById: jest.fn().mockResolvedValue(sparse),
      findAccessContext: jest.fn().mockResolvedValue({ editorId: null, ownerMangakaIds: [] })
    })

    await service.findById(REQUEST_ID, { userId: 'editor-fallback', roleName: RoleName.EDITOR })

    expect(policy.canReadRequest).toHaveBeenCalledWith(
      { userId: 'editor-fallback', roleName: RoleName.EDITOR },
      { editorId: 'editor-fallback', ownerMangakaIds: [], chapters: [] }
    )
    expect(repository.findAccessContext).toHaveBeenCalledWith('series-1')
  })

  it.each([
    ['findById', (service: ReprintQueryService) => service.findById(REQUEST_ID, { userId: 'x', roleName: 'MANGAKA' })],
    [
      'getChapters',
      (service: ReprintQueryService) => service.getChapters(REQUEST_ID, { userId: 'x', roleName: 'MANGAKA' })
    ]
  ])('%s conceals an existing request from an unauthorized actor', async (_label, invoke) => {
    const { service, policy } = makeService()
    policy.canReadRequest.mockReturnValue(false)

    await expect(invoke(service)).rejects.toMatchObject({ status: 404 })
  })

  it('returns the policy-filtered chapter collection', async () => {
    const { service, policy } = makeService()
    policy.filterReadableChapters.mockReturnValue([request.chapters[0]])

    await expect(service.getChapters(REQUEST_ID, { userId: 'reviser-1', roleName: RoleName.MANGAKA })).resolves.toEqual(
      [request.chapters[0]]
    )
  })

  it('rejects malformed chapter ids before loading the request', async () => {
    const { service, repository } = makeService()

    await expect(
      service.getChapterById(REQUEST_ID, 'bad-chapter', { userId: 'board-1', roleName: RoleName.BOARD_MEMBER })
    ).rejects.toMatchObject({ status: 404 })
    expect(repository.findById).not.toHaveBeenCalled()
  })

  it('conceals a chapter from an unauthorized reviser', async () => {
    const { service, policy } = makeService()
    policy.canReadChapter.mockReturnValue(false)

    await expect(
      service.getChapterById(REQUEST_ID, CHAPTER_B, { userId: 'reviser-1', roleName: RoleName.MANGAKA })
    ).rejects.toMatchObject({ status: 404 })
  })

  it('distinguishes an authorized but missing embedded chapter', async () => {
    const { service } = makeService()

    await expect(
      service.getChapterById(REQUEST_ID, '3123456789abcdef01234567', {
        userId: 'board-1',
        roleName: RoleName.BOARD_MEMBER
      })
    ).rejects.toMatchObject({ status: 404 })
  })

  it('returns an authorized embedded chapter', async () => {
    const { service } = makeService()

    await expect(
      service.getChapterById(REQUEST_ID, CHAPTER_A, { userId: 'reviser-1', roleName: RoleName.MANGAKA })
    ).resolves.toEqual(request.chapters[0])
  })

  it('returns not found when a valid request id has no record', async () => {
    const { service } = makeService({ findById: jest.fn().mockResolvedValue(null) })

    await expect(
      service.findById(REQUEST_ID, { userId: 'board-1', roleName: RoleName.BOARD_MEMBER })
    ).rejects.toMatchObject({ status: 404 })
  })
})
