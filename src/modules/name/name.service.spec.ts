import { NameKind, NameStatus, NotificationType, SeriesStatus } from '@prisma/client'
import { NameService } from './name.service'
import { DomainEvent } from 'src/core/events/domain-events'

const SERIES_ID = '507f1f77bcf86cd799439011'
const NAME_ID = '507f1f77bcf86cd799439012'
const OTHER_NAME_ID = '507f1f77bcf86cd799439016'
const CHAPTER_ID = '507f1f77bcf86cd799439013'

function make(
  nameOverride: Record<string, unknown> = {},
  seriesOverride: Record<string, unknown> = {},
  seriesStatus: SeriesStatus = SeriesStatus.IN_REVIEW
) {
  const currentSeries = { id: SERIES_ID, mangakaId: 'm1', editorId: 'e1', status: seriesStatus, ...seriesOverride }
  const name = {
    id: NAME_ID,
    seriesId: SERIES_ID,
    chapterNumber: null,
    kind: NameKind.PROPOSAL,
    status: NameStatus.DRAFT,
    version: 1,
    submittedAt: null,
    pages: [],
    ...nameOverride
  }
  const nameRepo = {
    findSeriesForGuard: jest.fn().mockResolvedValue(currentSeries),
    findNameById: jest.fn().mockResolvedValue(name),
    updateNameStatus: jest
      .fn()
      .mockImplementation((id: string, data: Record<string, unknown>) => Promise.resolve({ ...name, ...data })),
    updateNamePages: jest.fn().mockResolvedValue(name),
    appendNamePage: jest
      .fn()
      .mockImplementation((id: string, page: { pageNumber: number; fileUrl: string }) =>
        Promise.resolve({ ...name, pages: [...name.pages, page] })
      ),
    createChapterName: jest.fn().mockResolvedValue({
      ...name,
      kind: NameKind.CHAPTER,
      chapterNumber: 2,
      status: NameStatus.SUBMITTED
    }),
    countChapterNameByNumber: jest.fn().mockResolvedValue(0),
    findNamesBySeriesId: jest.fn().mockResolvedValue([]),
    findNamesBySeriesIdAndKind: jest.fn().mockResolvedValue([]),
    findChapterForNameGuard: jest.fn().mockResolvedValue({ id: CHAPTER_ID, seriesId: SERIES_ID }),
    findNamesByChapterId: jest.fn().mockResolvedValue([]),
    deleteChapterName: jest.fn().mockResolvedValue(undefined)
  }
  const eventBus = { emit: jest.fn() }
  const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const appConfigService = { get: jest.fn().mockResolvedValue({ nameMaxReviewRounds: 4 }) }
  const revisionService = {
    openSafe: jest.fn().mockResolvedValue({ round: 1 }),
    currentRound: jest.fn().mockResolvedValue(1)
  }
  const service = new NameService(
    nameRepo as never,
    eventBus as never,
    notificationService as never,
    appConfigService as never,
    revisionService as never
  )
  return {
    service,
    nameRepo,
    eventBus,
    notificationService,
    appConfigService,
    revisionService,
    name,
    series: currentSeries
  }
}

describe('NameService — lifecycle (MOVE từ series)', () => {
  it('resubmit: REVISION->IN_REVIEW with version++', async () => {
    const { service, nameRepo, notificationService, revisionService } = make({
      status: NameStatus.REVISION,
      version: 2
    })
    revisionService.currentRound.mockResolvedValueOnce(2)
    await service.resubmit('m1', SERIES_ID, NAME_ID)
    expect(nameRepo.updateNameStatus).toHaveBeenCalledWith(NAME_ID, {
      status: NameStatus.IN_REVIEW,
      version: 3
    })
    expect(revisionService.currentRound).toHaveBeenCalledWith('NAME', NAME_ID)
    expect(notificationService.notifySafe).toHaveBeenCalledWith({
      recipientId: 'e1',
      type: NotificationType.REVIEW,
      referenceId: NAME_ID,
      referenceType: 'NAME_RESUBMITTED',
      content: 'Đã nộp lại name (vòng 2)'
    })
  })

  it('resubmit notifies assigned editor when review round threshold is reached', async () => {
    const { service, notificationService } = make({ status: NameStatus.REVISION, version: 3 })

    await service.resubmit('m1', SERIES_ID, NAME_ID)

    expect(notificationService.notifySafe).toHaveBeenCalledWith({
      recipientId: 'e1',
      type: NotificationType.REVIEW,
      referenceId: NAME_ID,
      referenceType: 'NAME_LOOP_WARNING',
      content: 'Quá trình duyệt name đã đạt 4 vòng'
    })
  })

  it('resubmit does not send a loop warning before review round threshold', async () => {
    const { service, notificationService } = make({ status: NameStatus.REVISION, version: 2 })

    await service.resubmit('m1', SERIES_ID, NAME_ID)

    expect(notificationService.notifySafe).not.toHaveBeenCalledWith(
      expect.objectContaining({ referenceType: 'NAME_LOOP_WARNING' })
    )
  })

  it('resubmit does not notify at threshold when series has no assigned editor', async () => {
    const { service, notificationService } = make({ status: NameStatus.REVISION, version: 3 }, { editorId: null })

    await service.resubmit('m1', SERIES_ID, NAME_ID)

    expect(notificationService.notifySafe).not.toHaveBeenCalled()
  })

  it('approve: SUBMITTED->APPROVED then emits NameApproved and notifies mangaka', async () => {
    const { service, nameRepo, eventBus, notificationService } = make({ status: NameStatus.SUBMITTED })
    await service.approve('e1', SERIES_ID, NAME_ID)
    expect(nameRepo.updateNameStatus).toHaveBeenCalledWith(NAME_ID, { status: NameStatus.APPROVED })
    expect(eventBus.emit).toHaveBeenCalledWith(
      DomainEvent.NameApproved,
      expect.objectContaining({ seriesId: SERIES_ID, nameId: NAME_ID, kind: NameKind.PROPOSAL })
    )
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'm1',
        referenceId: SERIES_ID,
        referenceType: 'NAME_APPROVED',
        content: expect.any(String)
      })
    )
  })

  it('chapterApprove emits NameApproved with kind=CHAPTER payload (Spec 8 §6 event coupling)', async () => {
    const { service, nameRepo, eventBus } = make({
      status: NameStatus.SUBMITTED,
      kind: NameKind.CHAPTER,
      chapterNumber: 5,
      chapterId: CHAPTER_ID
    })
    nameRepo.findChapterForNameGuard = jest.fn().mockResolvedValue({ id: CHAPTER_ID, seriesId: SERIES_ID })
    await service.chapterApprove('e1', CHAPTER_ID, NAME_ID)
    expect(eventBus.emit).toHaveBeenCalledWith(DomainEvent.NameApproved, {
      seriesId: SERIES_ID,
      nameId: NAME_ID,
      kind: NameKind.CHAPTER
    })
  })

  it('requestRevision notifies with NAME_REVISION_REQUESTED', async () => {
    const { service, nameRepo, notificationService, revisionService } = make({ status: NameStatus.SUBMITTED })
    revisionService.openSafe.mockResolvedValueOnce({ round: 2 })

    await service.requestRevision('e1', SERIES_ID, NAME_ID, 'fix pacing')

    expect(revisionService.openSafe).toHaveBeenCalledWith({
      targetType: 'NAME',
      targetId: NAME_ID,
      seriesId: SERIES_ID,
      reason: 'fix pacing',
      requestedBy: 'e1',
      recipientId: 'm1'
    })
    expect(nameRepo.updateNameStatus.mock.invocationCallOrder[0]).toBeLessThan(
      revisionService.openSafe.mock.invocationCallOrder[0]
    )
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'm1',
        referenceId: NAME_ID,
        referenceType: 'NAME_REVISION_REQUESTED',
        content: 'Name cần chỉnh sửa (vòng 2): fix pacing'
      })
    )
  })

  it('uses each nameId as the revision notification reference so Names in one series do not dedupe each other', async () => {
    const { service, nameRepo, notificationService, name } = make({ status: NameStatus.SUBMITTED })
    nameRepo.findNameById.mockImplementation((id: string) => Promise.resolve({ ...name, id }))

    await service.requestRevision('e1', SERIES_ID, NAME_ID, 'fix pacing')
    await service.requestRevision('e1', SERIES_ID, OTHER_NAME_ID, 'fix panel flow')

    expect(notificationService.notifySafe).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ referenceId: NAME_ID, referenceType: 'NAME_REVISION_REQUESTED' })
    )
    expect(notificationService.notifySafe).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ referenceId: OTHER_NAME_ID, referenceType: 'NAME_REVISION_REQUESTED' })
    )
  })

  it('approve by a non-assigned editor throws', async () => {
    const { service } = make({ status: NameStatus.SUBMITTED })

    await expect(service.approve('intruder', SERIES_ID, NAME_ID)).rejects.toBeDefined()
  })

  it('addPage: DRAFT appends one page', async () => {
    const { service, nameRepo } = make({ status: NameStatus.DRAFT, pages: [] })
    const page = { pageNumber: 1, fileUrl: 'k1' }

    const res = await service.addPage('m1', SERIES_ID, NAME_ID, page)

    expect(nameRepo.appendNamePage).toHaveBeenCalledWith(NAME_ID, page)
    expect(res.pages).toContainEqual(page)
  })

  it('addPage: non-editable status throws', async () => {
    const { service } = make({ status: NameStatus.APPROVED })

    await expect(service.addPage('m1', SERIES_ID, NAME_ID, { pageNumber: 1, fileUrl: 'k' })).rejects.toBeDefined()
  })
})

describe('NameService.createChapterName (chapter-first)', () => {
  function makeRepo() {
    return {
      findChapterForNameGuard: jest.fn(),
      createChapterNameForChapter: jest.fn().mockResolvedValue({
        id: 'n1',
        kind: NameKind.CHAPTER,
        status: NameStatus.DRAFT,
        chapterId: CHAPTER_ID,
        chapterNumber: 5,
        pages: []
      })
    }
  }
  const makeSvc = (repo: any) =>
    new NameService(
      repo as never,
      { emit: jest.fn() } as never,
      { notifySafe: jest.fn() } as never,
      { get: jest.fn() } as never,
      { openSafe: jest.fn(), currentRound: jest.fn() } as never
    )

  it('malformed chapterId → 404', async () => {
    const repo = makeRepo()
    await expect(
      makeSvc(repo).createChapterName('m', 'garbage', { namePages: [{ pageNumber: 1, fileUrl: 'k' }] } as any)
    ).rejects.toMatchObject({ status: 404 })
  })

  it('chapter not found → 404', async () => {
    const repo = makeRepo()
    repo.findChapterForNameGuard.mockResolvedValue(null)
    await expect(
      makeSvc(repo).createChapterName('m', CHAPTER_ID, { namePages: [{ pageNumber: 1, fileUrl: 'k' }] } as any)
    ).rejects.toMatchObject({ status: 404 })
  })

  it('not owner → 403', async () => {
    const repo = makeRepo()
    repo.findChapterForNameGuard.mockResolvedValue({
      id: CHAPTER_ID,
      seriesId: SERIES_ID,
      chapterNumber: 5,
      status: 'DRAFT',
      nameId: null,
      series: { mangakaId: 'other', status: SeriesStatus.SERIALIZED }
    })
    await expect(
      makeSvc(repo).createChapterName('m', CHAPTER_ID, { namePages: [{ pageNumber: 1, fileUrl: 'k' }] } as any)
    ).rejects.toMatchObject({ status: 403 })
  })

  it('chapter not DRAFT → 409', async () => {
    const repo = makeRepo()
    repo.findChapterForNameGuard.mockResolvedValue({
      id: CHAPTER_ID,
      seriesId: SERIES_ID,
      chapterNumber: 5,
      status: 'IN_PRODUCTION',
      nameId: null,
      series: { mangakaId: 'm', status: SeriesStatus.SERIALIZED }
    })
    await expect(
      makeSvc(repo).createChapterName('m', CHAPTER_ID, { namePages: [{ pageNumber: 1, fileUrl: 'k' }] } as any)
    ).rejects.toMatchObject({ status: 409 })
  })

  it('series not SERIALIZED → 409', async () => {
    const repo = makeRepo()
    repo.findChapterForNameGuard.mockResolvedValue({
      id: CHAPTER_ID,
      seriesId: SERIES_ID,
      chapterNumber: 5,
      status: 'DRAFT',
      nameId: null,
      series: { mangakaId: 'm', status: SeriesStatus.IN_REVIEW }
    })
    await expect(
      makeSvc(repo).createChapterName('m', CHAPTER_ID, { namePages: [{ pageNumber: 1, fileUrl: 'k' }] } as any)
    ).rejects.toMatchObject({ status: 409 })
  })

  it('chapter already has Name → 409', async () => {
    const repo = makeRepo()
    repo.findChapterForNameGuard.mockResolvedValue({
      id: CHAPTER_ID,
      seriesId: SERIES_ID,
      chapterNumber: 5,
      status: 'DRAFT',
      nameId: 'existing',
      series: { mangakaId: 'm', status: SeriesStatus.SERIALIZED }
    })
    await expect(
      makeSvc(repo).createChapterName('m', CHAPTER_ID, { namePages: [{ pageNumber: 1, fileUrl: 'k' }] } as any)
    ).rejects.toMatchObject({ status: 409 })
  })

  it('valid → creates chapter-Name (derive chapterNumber, set chapterId)', async () => {
    const repo = makeRepo()
    repo.findChapterForNameGuard.mockResolvedValue({
      id: CHAPTER_ID,
      seriesId: SERIES_ID,
      chapterNumber: 5,
      status: 'DRAFT',
      nameId: null,
      series: { mangakaId: 'm', status: SeriesStatus.SERIALIZED }
    })
    await makeSvc(repo).createChapterName('m', CHAPTER_ID, { namePages: [{ pageNumber: 1, fileUrl: 'k' }] })
    expect(repo.createChapterNameForChapter).toHaveBeenCalledWith(
      expect.objectContaining({ chapterId: CHAPTER_ID, seriesId: SERIES_ID, chapterNumber: 5 })
    )
  })
})

describe('NameService.createChapterName — ending phase (Fix-1 G-1)', () => {
  function makeRepo() {
    return {
      findChapterForNameGuard: jest.fn(),
      createChapterNameForChapter: jest.fn().mockResolvedValue({
        id: 'n1',
        kind: NameKind.CHAPTER,
        status: NameStatus.DRAFT,
        chapterId: CHAPTER_ID,
        chapterNumber: 8,
        pages: []
      })
    }
  }
  const makeSvc = (repo: any) =>
    new NameService(
      repo as never,
      { emit: jest.fn() } as never,
      { notifySafe: jest.fn() } as never,
      { get: jest.fn() } as never,
      { openSafe: jest.fn(), currentRound: jest.fn() } as never
    )

  it.each([SeriesStatus.CANCELLING, SeriesStatus.COMPLETING])(
    'series %s → chapter-Name vẫn creatable (ending phase, Fix-1)',
    async (status) => {
      const repo = makeRepo()
      repo.findChapterForNameGuard.mockResolvedValue({
        id: CHAPTER_ID,
        seriesId: SERIES_ID,
        chapterNumber: 8,
        status: 'DRAFT',
        nameId: null,
        series: { mangakaId: 'm', status }
      })
      await expect(
        makeSvc(repo).createChapterName('m', CHAPTER_ID, { namePages: [{ pageNumber: 1, fileUrl: 'k' }] } as any)
      ).resolves.toBeDefined()
    }
  )

  it('series HIATUS → 409 SeriesNotSerialized', async () => {
    const repo = makeRepo()
    repo.findChapterForNameGuard.mockResolvedValue({
      id: CHAPTER_ID,
      seriesId: SERIES_ID,
      chapterNumber: 8,
      status: 'DRAFT',
      nameId: null,
      series: { mangakaId: 'm', status: SeriesStatus.HIATUS }
    })
    await expect(
      makeSvc(repo).createChapterName('m', CHAPTER_ID, { namePages: [{ pageNumber: 1, fileUrl: 'k' }] } as any)
    ).rejects.toMatchObject({ status: 409 })
  })
})

import { NameNotFoundException } from './errors/name.errors'

describe('NameService — series-scoped routes are PROPOSAL-only (Spec 12)', () => {
  it('getName returns 404 for a chapter-Name via the series-scoped route', async () => {
    const { service } = make({ kind: NameKind.CHAPTER, chapterId: CHAPTER_ID })
    await expect(service.getName({ userId: 'm1', roleName: 'MANGAKA' }, SERIES_ID, NAME_ID)).rejects.toBe(
      NameNotFoundException
    )
  })

  it('listNames only ever asks the repo for PROPOSAL names', async () => {
    const { service, nameRepo } = make()
    await service.listNames({ userId: 'm1', roleName: 'MANGAKA' }, SERIES_ID)
    expect(nameRepo.findNamesBySeriesIdAndKind).toHaveBeenCalledWith(SERIES_ID, NameKind.PROPOSAL, undefined)
  })

  it('listNames forwards limit/offset to the repo (query đã khai thì phải được dùng)', async () => {
    const { service, nameRepo } = make()
    await service.listNames({ userId: 'm1', roleName: 'MANGAKA' }, SERIES_ID, { limit: 5, offset: 10 })
    expect(nameRepo.findNamesBySeriesIdAndKind).toHaveBeenCalledWith(SERIES_ID, NameKind.PROPOSAL, {
      limit: 5,
      offset: 10
    })
  })

  it('approve on a chapter-Name via the series-scoped route returns 404', async () => {
    const { service } = make({ status: NameStatus.SUBMITTED, kind: NameKind.CHAPTER, chapterId: CHAPTER_ID })
    await expect(service.approve('e1', SERIES_ID, NAME_ID)).rejects.toBe(NameNotFoundException)
  })

  it('requestRevision on a chapter-Name via the series-scoped route returns 404', async () => {
    const { service } = make({ status: NameStatus.SUBMITTED, kind: NameKind.CHAPTER, chapterId: CHAPTER_ID })
    await expect(service.requestRevision('e1', SERIES_ID, NAME_ID, 'fix')).rejects.toBe(NameNotFoundException)
  })

  it('a PROPOSAL name still works on the series-scoped route (không hồi quy)', async () => {
    const { service, nameRepo } = make({ status: NameStatus.SUBMITTED, kind: NameKind.PROPOSAL })
    await service.approve('e1', SERIES_ID, NAME_ID)
    expect(nameRepo.updateNameStatus).toHaveBeenCalledWith(NAME_ID, { status: NameStatus.APPROVED })
  })
})

describe('NameService — chapter-scoped delegates (Spec 12)', () => {
  it('chapterApprove resolves seriesId from the chapter and approves the chapter-Name', async () => {
    const { service, nameRepo } = make({
      status: NameStatus.SUBMITTED,
      kind: NameKind.CHAPTER,
      chapterId: CHAPTER_ID
    })
    const out = await service.chapterApprove('e1', CHAPTER_ID, NAME_ID)
    expect(nameRepo.findChapterForNameGuard).toHaveBeenCalledWith(CHAPTER_ID)
    expect(nameRepo.updateNameStatus).toHaveBeenCalledWith(NAME_ID, { status: NameStatus.APPROVED })
    expect(out.chapterId).toBe(CHAPTER_ID)
  })

  it('chapterApprove returns 404 when the Name belongs to a DIFFERENT chapter', async () => {
    const { service } = make({
      status: NameStatus.SUBMITTED,
      kind: NameKind.CHAPTER,
      chapterId: 'ffffffffffffffffffffffff'
    })
    await expect(service.chapterApprove('e1', CHAPTER_ID, NAME_ID)).rejects.toBe(NameNotFoundException)
  })

  it('chapterApprove returns 404 for a malformed chapterId without touching the name repo', async () => {
    const { service, nameRepo } = make({ kind: NameKind.CHAPTER, chapterId: CHAPTER_ID })
    await expect(service.chapterApprove('e1', 'garbage', NAME_ID)).rejects.toMatchObject({ status: 404 })
    expect(nameRepo.findNameById).not.toHaveBeenCalled()
  })

  it('chapterResubmit bumps the version for a chapter-Name', async () => {
    const { service, nameRepo } = make({
      status: NameStatus.REVISION,
      version: 2,
      kind: NameKind.CHAPTER,
      chapterId: CHAPTER_ID
    })
    await service.chapterResubmit('m1', CHAPTER_ID, NAME_ID)
    expect(nameRepo.updateNameStatus).toHaveBeenCalledWith(NAME_ID, {
      status: NameStatus.IN_REVIEW,
      version: 3
    })
  })

  it('chapterListNames reads by chapterId', async () => {
    const { service, nameRepo } = make({ kind: NameKind.CHAPTER, chapterId: CHAPTER_ID })
    await service.chapterListNames({ userId: 'm1', roleName: 'MANGAKA' }, CHAPTER_ID)
    expect(nameRepo.findNamesByChapterId).toHaveBeenCalledWith(CHAPTER_ID)
  })

  it('chapterGetName enforces the caller scope (outsider mangaka → 403)', async () => {
    const { service } = make({ kind: NameKind.CHAPTER, chapterId: CHAPTER_ID })
    await expect(
      service.chapterGetName({ userId: 'someone-else', roleName: 'MANGAKA' }, CHAPTER_ID, NAME_ID)
    ).rejects.toMatchObject({ status: 403 })
  })
})

import { NameMessages } from './name.messages'
import { NameNotDeletableException, NotSeriesOwnerException } from './errors/name.errors'

describe('NameService.deleteChapterName (Spec 12)', () => {
  const chapterRow = (status: string) => ({
    id: CHAPTER_ID,
    seriesId: SERIES_ID,
    chapterNumber: 1,
    status,
    nameId: NAME_ID,
    series: { mangakaId: 'm1', status: SeriesStatus.SERIALIZED }
  })

  function makeDelRepo(chapterStatus = 'DRAFT', nameStatus: NameStatus = NameStatus.SUBMITTED, chapterId = CHAPTER_ID) {
    return {
      findChapterForNameGuard: jest.fn().mockResolvedValue(chapterRow(chapterStatus)),
      findNameById: jest.fn().mockResolvedValue({ id: NAME_ID, chapterId, status: nameStatus }),
      deleteChapterName: jest.fn().mockResolvedValue(undefined)
    }
  }
  const makeDelSvc = (repo: any) =>
    new NameService(
      repo as never,
      { emit: jest.fn() } as never,
      { notifySafe: jest.fn() } as never,
      {
        get: jest.fn()
      } as never,
      { openSafe: jest.fn(), currentRound: jest.fn() } as never
    )

  it('deletes the Name and unsets Chapter.nameId when the chapter is DRAFT', async () => {
    const repo = makeDelRepo()
    const out = await makeDelSvc(repo).deleteChapterName('m1', CHAPTER_ID, NAME_ID)
    expect(repo.deleteChapterName).toHaveBeenCalledWith(CHAPTER_ID, NAME_ID)
    expect(out).toEqual({ message: NameMessages.response.chapterNameDeleted })
  })

  it('409 when the chapter is no longer DRAFT', async () => {
    const repo = makeDelRepo('IN_PRODUCTION')
    await expect(makeDelSvc(repo).deleteChapterName('m1', CHAPTER_ID, NAME_ID)).rejects.toBe(NameNotDeletableException)
    expect(repo.deleteChapterName).not.toHaveBeenCalled()
  })

  it('409 when the Name is already APPROVED (checkpoint — gate page depends on it)', async () => {
    const repo = makeDelRepo('DRAFT', NameStatus.APPROVED)
    await expect(makeDelSvc(repo).deleteChapterName('m1', CHAPTER_ID, NAME_ID)).rejects.toBe(NameNotDeletableException)
    expect(repo.deleteChapterName).not.toHaveBeenCalled()
  })

  it('403 when the caller is not the series owner', async () => {
    const repo = makeDelRepo()
    await expect(makeDelSvc(repo).deleteChapterName('other', CHAPTER_ID, NAME_ID)).rejects.toBe(NotSeriesOwnerException)
  })

  it('404 when the Name belongs to a different chapter', async () => {
    const repo = makeDelRepo('DRAFT', NameStatus.SUBMITTED, 'ffffffffffffffffffffffff')
    await expect(makeDelSvc(repo).deleteChapterName('m1', CHAPTER_ID, NAME_ID)).rejects.toBe(NameNotFoundException)
  })

  it('404 for a malformed chapterId without touching the repo', async () => {
    const repo = makeDelRepo()
    await expect(makeDelSvc(repo).deleteChapterName('m1', 'garbage', NAME_ID)).rejects.toMatchObject({ status: 404 })
    expect(repo.findChapterForNameGuard).not.toHaveBeenCalled()
  })
})

// ── Option A (chapter-Name born DRAFT + explicit submit) ─────────────────────
describe('NameService.chapterSubmit', () => {
  const CHAPTER_NAME = { kind: NameKind.CHAPTER, chapterId: CHAPTER_ID, chapterNumber: 2 }

  it('DRAFT chapter-Name → SUBMITTED and stamps submittedAt', async () => {
    const { service, nameRepo } = make({ ...CHAPTER_NAME, status: NameStatus.DRAFT })
    nameRepo.findChapterForNameGuard.mockResolvedValue({ id: CHAPTER_ID, seriesId: SERIES_ID })

    const res = await service.chapterSubmit('m1', CHAPTER_ID, NAME_ID)

    expect(res.status).toBe(NameStatus.SUBMITTED)
    const call = nameRepo.updateNameStatus.mock.calls[0]
    expect(call[0]).toBe(NAME_ID)
    expect(call[1].status).toBe(NameStatus.SUBMITTED)
    expect(call[1].submittedAt).toBeInstanceOf(Date)
  })

  it('non-DRAFT chapter-Name (already SUBMITTED) → 409 InvalidNameState', async () => {
    const { service, nameRepo } = make({ ...CHAPTER_NAME, status: NameStatus.SUBMITTED })
    nameRepo.findChapterForNameGuard.mockResolvedValue({ id: CHAPTER_ID, seriesId: SERIES_ID })

    await expect(service.chapterSubmit('m1', CHAPTER_ID, NAME_ID)).rejects.toMatchObject({ status: 409 })
    expect(nameRepo.updateNameStatus).not.toHaveBeenCalled()
  })

  it('non-owner → 403', async () => {
    const { service, nameRepo } = make({ ...CHAPTER_NAME, status: NameStatus.DRAFT })
    nameRepo.findChapterForNameGuard.mockResolvedValue({ id: CHAPTER_ID, seriesId: SERIES_ID })

    await expect(service.chapterSubmit('someone-else', CHAPTER_ID, NAME_ID)).rejects.toMatchObject({ status: 403 })
    expect(nameRepo.updateNameStatus).not.toHaveBeenCalled()
  })

  it('chapterAddPage works while the chapter-Name is still DRAFT (the whole point of Option A)', async () => {
    const { service, nameRepo } = make({ ...CHAPTER_NAME, status: NameStatus.DRAFT, pages: [] })
    nameRepo.findChapterForNameGuard.mockResolvedValue({ id: CHAPTER_ID, seriesId: SERIES_ID })

    await service.chapterAddPage('m1', CHAPTER_ID, NAME_ID, { pageNumber: 1, fileUrl: 'k' })

    expect(nameRepo.appendNamePage).toHaveBeenCalledWith(NAME_ID, { pageNumber: 1, fileUrl: 'k' })
  })
})
