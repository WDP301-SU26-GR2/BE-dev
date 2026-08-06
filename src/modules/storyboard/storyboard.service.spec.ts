import { StoryboardStatus, NotificationType, SeriesStatus } from '@prisma/client'
import { StoryboardService } from './storyboard.service'
import { DomainEvent } from 'src/core/events/domain-events'
import { InvalidStoryboardStateException } from './errors/storyboard.errors'
import { StoryboardAccessService } from './services/storyboard-access.service'
import { StoryboardContentService } from './services/storyboard-content.service'
import { StoryboardQueryService } from './services/storyboard-query.service'
import { StoryboardReviewService } from './services/storyboard-review.service'
import { StoryboardNotFoundException } from './errors/storyboard.errors'
import { StoryboardMessages } from './storyboard.messages'
import { StoryboardNotDeletableException, NotSeriesOwnerException } from './errors/storyboard.errors'
import { toStoryboardRes } from './storyboard.mapper'

const SERIES_ID = '507f1f77bcf86cd799439011'
const SB_ID = '507f1f77bcf86cd799439012'
const OTHER_SB_ID = '507f1f77bcf86cd799439016'
const CHAPTER_ID = '507f1f77bcf86cd799439013'

function createService(
  repo: unknown,
  eventBus: unknown,
  notificationService: unknown,
  appConfigService: unknown,
  revisionService: unknown
) {
  const accessService = new StoryboardAccessService(repo as never)
  const reviewService = new StoryboardReviewService(
    accessService,
    repo as never,
    eventBus as never,
    notificationService as never,
    appConfigService as never,
    revisionService as never
  )
  const contentService = new StoryboardContentService(accessService, repo as never, notificationService as never)
  const queryService = new StoryboardQueryService(repo as never)
  return new StoryboardService(reviewService, contentService, queryService)
}

function make(sbOverride: Record<string, unknown> = {}) {
  const currentSeries = { id: SERIES_ID, mangakaId: 'm1', editorId: 'e1', status: SeriesStatus.SERIALIZED }
  const sb = {
    id: SB_ID,
    seriesId: SERIES_ID,
    chapterId: CHAPTER_ID,
    status: StoryboardStatus.DRAFT,
    version: 1,
    submittedAt: null,
    pages: [],
    ...sbOverride
  }
  const repo = {
    findSeriesForGuard: jest.fn().mockResolvedValue(currentSeries),
    findStoryboardById: jest.fn().mockResolvedValue(sb),
    updateStoryboardStatus: jest
      .fn()
      .mockImplementation((id: string, data: Record<string, unknown>) => Promise.resolve({ ...sb, ...data })),
    findChapterForStoryboardGuard: jest.fn().mockResolvedValue({ id: CHAPTER_ID, seriesId: SERIES_ID }),
    findStoryboardsByChapterId: jest.fn().mockResolvedValue([]),
    deleteChapterStoryboard: jest.fn().mockResolvedValue(undefined)
  }
  const eventBus = { emit: jest.fn() }
  const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const appConfigService = { get: jest.fn().mockResolvedValue({ storyboardMaxReviewRounds: 4 }) }
  const revisionService = {
    openSafe: jest.fn().mockResolvedValue({ round: 1 }),
    currentRound: jest.fn().mockResolvedValue(1)
  }
  const service = createService(repo, eventBus, notificationService, appConfigService, revisionService)
  return {
    service,
    repo,
    eventBus,
    notificationService,
    appConfigService,
    revisionService,
    sb,
    series: currentSeries
  }
}

describe('StoryboardService — chapter-scoped lifecycle (Spec 28)', () => {
  it('response omits legacy kind and chapterNumber fields even for a legacy-shaped row', () => {
    const response = toStoryboardRes({
      ...make().sb,
      kind: 'CHAPTER',
      chapterNumber: 7
    } as never)
    expect(response).not.toHaveProperty('kind')
    expect(response).not.toHaveProperty('chapterNumber')
  })

  it('chapterResubmit: REVISION->IN_REVIEW with version++', async () => {
    const { service, repo, notificationService, revisionService } = make({
      status: StoryboardStatus.REVISION,
      version: 2
    })
    revisionService.currentRound.mockResolvedValueOnce(2)
    await service.chapterResubmit('m1', CHAPTER_ID, SB_ID)
    expect(repo.updateStoryboardStatus).toHaveBeenCalledWith(SB_ID, {
      status: StoryboardStatus.IN_REVIEW,
      version: 3
    })
    expect(revisionService.currentRound).toHaveBeenCalledWith('STORYBOARD', SB_ID)
    expect(notificationService.notifySafe).toHaveBeenCalledWith({
      recipientId: 'e1',
      type: NotificationType.REVIEW,
      referenceId: SB_ID,
      referenceType: 'STORYBOARD_RESUBMITTED',
      content: 'Tác giả đã nộp lại bản phác thảo (vòng 2)'
    })
  })

  it('chapterApprove: SUBMITTED->APPROVED then emits StoryboardApproved and notifies mangaka', async () => {
    const { service, repo, eventBus, notificationService } = make({ status: StoryboardStatus.SUBMITTED })
    await service.chapterApprove('e1', CHAPTER_ID, SB_ID)
    expect(repo.updateStoryboardStatus).toHaveBeenCalledWith(SB_ID, { status: StoryboardStatus.APPROVED })
    expect(eventBus.emit).toHaveBeenCalledWith(DomainEvent.StoryboardApproved, {
      seriesId: SERIES_ID,
      storyboardId: SB_ID,
      chapterId: CHAPTER_ID
    })
    expect(Object.keys(eventBus.emit.mock.calls[0][1] as Record<string, unknown>).sort()).toEqual([
      'chapterId',
      'seriesId',
      'storyboardId'
    ])
    expect(repo.updateStoryboardStatus.mock.invocationCallOrder[0]).toBeLessThan(
      eventBus.emit.mock.invocationCallOrder[0]
    )
    expect(repo.updateStoryboardStatus.mock.invocationCallOrder[0]).toBeLessThan(
      notificationService.notifySafe.mock.invocationCallOrder[0]
    )
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'm1',
        referenceId: SERIES_ID,
        referenceType: 'STORYBOARD_APPROVED',
        content: expect.any(String)
      })
    )
  })

  it('chapterRequestRevision notifies with STORYBOARD_REVISION_REQUESTED', async () => {
    const { service, repo, notificationService, revisionService } = make({ status: StoryboardStatus.SUBMITTED })
    revisionService.openSafe.mockResolvedValueOnce({ round: 2 })

    await service.chapterRequestRevision('e1', CHAPTER_ID, SB_ID, 'fix pacing')

    expect(revisionService.openSafe).toHaveBeenCalledWith({
      targetType: 'STORYBOARD',
      targetId: SB_ID,
      seriesId: SERIES_ID,
      reason: 'fix pacing',
      requestedBy: 'e1',
      recipientId: 'm1'
    })
    expect(repo.updateStoryboardStatus.mock.invocationCallOrder[0]).toBeLessThan(
      revisionService.openSafe.mock.invocationCallOrder[0]
    )
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'm1',
        referenceId: SB_ID,
        referenceType: 'STORYBOARD_REVISION_REQUESTED',
        content: 'Bản phác thảo cần chỉnh sửa (vòng 2): fix pacing'
      })
    )
  })

  it('chapterRequestRevision keeps an APPROVED chapter-storyboard blocked', async () => {
    const { service, repo } = make({ status: StoryboardStatus.APPROVED })

    await expect(service.chapterRequestRevision('e1', CHAPTER_ID, SB_ID, 'must remain approved')).rejects.toBe(
      InvalidStoryboardStateException
    )
    expect(repo.updateStoryboardStatus).not.toHaveBeenCalled()
  })

  it('uses each storyboardId as the revision notification reference so storyboards in one chapter do not dedupe each other', async () => {
    const { service, repo, notificationService, sb } = make({ status: StoryboardStatus.SUBMITTED })
    repo.findStoryboardById.mockImplementation((id: string) => Promise.resolve({ ...sb, id }))

    await service.chapterRequestRevision('e1', CHAPTER_ID, SB_ID, 'fix pacing')
    await service.chapterRequestRevision('e1', CHAPTER_ID, OTHER_SB_ID, 'fix panel flow')

    expect(notificationService.notifySafe).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ referenceId: SB_ID, referenceType: 'STORYBOARD_REVISION_REQUESTED' })
    )
    expect(notificationService.notifySafe).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ referenceId: OTHER_SB_ID, referenceType: 'STORYBOARD_REVISION_REQUESTED' })
    )
  })

  it('chapterApprove throws for a non-assigned editor', async () => {
    const { service } = make({ status: StoryboardStatus.SUBMITTED })

    await expect(service.chapterApprove('intruder', CHAPTER_ID, SB_ID)).rejects.toBeDefined()
  })
})

describe('StoryboardService — chapter-scoped queries (Spec 28)', () => {
  it('chapterListStoryboards reads by chapterId', async () => {
    const { service, repo } = make()
    await service.chapterListStoryboards({ userId: 'm1', roleName: 'MANGAKA' }, CHAPTER_ID)
    expect(repo.findStoryboardsByChapterId).toHaveBeenCalledWith(CHAPTER_ID)
  })

  it('chapterGetStoryboard enforces the caller scope (outsider mangaka → 403)', async () => {
    const { service } = make()
    await expect(
      service.chapterGetStoryboard({ userId: 'someone-else', roleName: 'MANGAKA' }, CHAPTER_ID, SB_ID)
    ).rejects.toMatchObject({ status: 403 })
  })

  it('chapterApprove returns 404 for a malformed chapterId without touching the storyboard repo', async () => {
    const { service, repo } = make()
    await expect(service.chapterApprove('e1', 'garbage', SB_ID)).rejects.toMatchObject({ status: 404 })
    expect(repo.findStoryboardById).not.toHaveBeenCalled()
  })

  it('chapterApprove returns 404 when the storyboard belongs to a DIFFERENT chapter', async () => {
    const { service } = make({
      status: StoryboardStatus.SUBMITTED,
      chapterId: 'ffffffffffffffffffffffff'
    })
    await expect(service.chapterApprove('e1', CHAPTER_ID, SB_ID)).rejects.toBe(StoryboardNotFoundException)
  })

  it('chapterResubmit bumps the version for a chapter-storyboard', async () => {
    const { service, repo } = make({
      status: StoryboardStatus.REVISION,
      version: 2
    })
    await service.chapterResubmit('m1', CHAPTER_ID, SB_ID)
    expect(repo.updateStoryboardStatus).toHaveBeenCalledWith(SB_ID, {
      status: StoryboardStatus.IN_REVIEW,
      version: 3
    })
  })
})

describe('StoryboardService.deleteChapterStoryboard (Spec 28)', () => {
  const chapterRow = (status: string) => ({
    id: CHAPTER_ID,
    seriesId: SERIES_ID,
    status,
    storyboardId: SB_ID,
    series: { mangakaId: 'm1', status: SeriesStatus.SERIALIZED }
  })

  function makeDelRepo(
    chapterStatus = 'DRAFT',
    sbStatus: StoryboardStatus = StoryboardStatus.SUBMITTED,
    chapterId = CHAPTER_ID
  ) {
    return {
      findChapterForStoryboardGuard: jest.fn().mockResolvedValue(chapterRow(chapterStatus)),
      findStoryboardById: jest.fn().mockResolvedValue({ id: SB_ID, chapterId, status: sbStatus }),
      deleteChapterStoryboard: jest.fn().mockResolvedValue(undefined)
    }
  }
  const makeDelSvc = (repo: any) =>
    createService(
      repo,
      { emit: jest.fn() },
      { notifySafe: jest.fn() },
      { get: jest.fn() },
      { openSafe: jest.fn(), currentRound: jest.fn() }
    )

  it('deletes the storyboard and unsets Chapter.storyboardId when the chapter is DRAFT', async () => {
    const repo = makeDelRepo()
    const out = await makeDelSvc(repo).deleteChapterStoryboard('m1', CHAPTER_ID, SB_ID)
    expect(repo.deleteChapterStoryboard).toHaveBeenCalledWith(CHAPTER_ID, SB_ID)
    expect(out).toEqual({ message: StoryboardMessages.response.chapterStoryboardDeleted })
  })

  it('409 when the chapter is no longer DRAFT', async () => {
    const repo = makeDelRepo('IN_PRODUCTION')
    await expect(makeDelSvc(repo).deleteChapterStoryboard('m1', CHAPTER_ID, SB_ID)).rejects.toBe(
      StoryboardNotDeletableException
    )
    expect(repo.deleteChapterStoryboard).not.toHaveBeenCalled()
  })

  it('409 when the storyboard is already APPROVED (checkpoint — gate page depends on it)', async () => {
    const repo = makeDelRepo('DRAFT', StoryboardStatus.APPROVED)
    await expect(makeDelSvc(repo).deleteChapterStoryboard('m1', CHAPTER_ID, SB_ID)).rejects.toBe(
      StoryboardNotDeletableException
    )
    expect(repo.deleteChapterStoryboard).not.toHaveBeenCalled()
  })

  it('403 when the caller is not the series owner', async () => {
    const repo = makeDelRepo()
    await expect(makeDelSvc(repo).deleteChapterStoryboard('other', CHAPTER_ID, SB_ID)).rejects.toBe(
      NotSeriesOwnerException
    )
  })

  it('404 when the storyboard belongs to a different chapter', async () => {
    const repo = makeDelRepo('DRAFT', StoryboardStatus.SUBMITTED, 'ffffffffffffffffffffffff')
    await expect(makeDelSvc(repo).deleteChapterStoryboard('m1', CHAPTER_ID, SB_ID)).rejects.toBe(
      StoryboardNotFoundException
    )
  })

  it('404 for a malformed chapterId without touching the repo', async () => {
    const repo = makeDelRepo()
    await expect(makeDelSvc(repo).deleteChapterStoryboard('m1', 'garbage', SB_ID)).rejects.toMatchObject({
      status: 404
    })
    expect(repo.findChapterForStoryboardGuard).not.toHaveBeenCalled()
  })
})

// ── Option A (chapter-storyboard born DRAFT + explicit submit) ─────────────────────
describe('StoryboardService.chapterSubmit', () => {
  const CHAPTER_SB = { chapterId: CHAPTER_ID }

  it('DRAFT chapter-storyboard → SUBMITTED and stamps submittedAt', async () => {
    const { service, repo } = make({ ...CHAPTER_SB, status: StoryboardStatus.DRAFT })
    repo.findChapterForStoryboardGuard.mockResolvedValue({ id: CHAPTER_ID, seriesId: SERIES_ID })

    const res = await service.chapterSubmit('m1', CHAPTER_ID, SB_ID)

    expect(res.status).toBe(StoryboardStatus.SUBMITTED)
    const call = repo.updateStoryboardStatus.mock.calls[0]
    expect(call[0]).toBe(SB_ID)
    expect(call[1].status).toBe(StoryboardStatus.SUBMITTED)
    expect(call[1].submittedAt).toBeInstanceOf(Date)
  })

  it('non-DRAFT chapter-storyboard (already SUBMITTED) → 409 InvalidStoryboardState', async () => {
    const { service, repo } = make({ ...CHAPTER_SB, status: StoryboardStatus.SUBMITTED })
    repo.findChapterForStoryboardGuard.mockResolvedValue({ id: CHAPTER_ID, seriesId: SERIES_ID })

    await expect(service.chapterSubmit('m1', CHAPTER_ID, SB_ID)).rejects.toMatchObject({ status: 409 })
    expect(repo.updateStoryboardStatus).not.toHaveBeenCalled()
  })

  it('non-owner → 403', async () => {
    const { service, repo } = make({ ...CHAPTER_SB, status: StoryboardStatus.DRAFT })
    repo.findChapterForStoryboardGuard.mockResolvedValue({ id: CHAPTER_ID, seriesId: SERIES_ID })

    await expect(service.chapterSubmit('someone-else', CHAPTER_ID, SB_ID)).rejects.toMatchObject({ status: 403 })
    expect(repo.updateStoryboardStatus).not.toHaveBeenCalled()
  })
})
