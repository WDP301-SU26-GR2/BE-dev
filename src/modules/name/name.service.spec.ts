import { NameKind, NameStatus, NotificationType, SeriesStatus } from '@prisma/client'
import { NameService } from './name.service'
import { DomainEvent } from 'src/core/events/domain-events'
import {
  DuplicateChapterNameException,
  NotSeriesOwnerException,
  SeriesNotSerializedException
} from './errors/name.errors'

const SERIES_ID = '507f1f77bcf86cd799439011'
const NAME_ID = '507f1f77bcf86cd799439012'

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
    findNamesBySeriesIdAndKind: jest.fn().mockResolvedValue([])
  }
  const eventBus = { emit: jest.fn() }
  const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const appConfigService = { get: jest.fn().mockResolvedValue({ nameMaxReviewRounds: 4 }) }
  const service = new NameService(
    nameRepo as never,
    eventBus as never,
    notificationService as never,
    appConfigService as never
  )
  return { service, nameRepo, eventBus, notificationService, appConfigService, name, series: currentSeries }
}

describe('NameService — lifecycle (MOVE từ series)', () => {
  it('resubmit: REVISION->IN_REVIEW with version++', async () => {
    const { service, nameRepo } = make({ status: NameStatus.REVISION, version: 2 })
    await service.resubmit('m1', SERIES_ID, NAME_ID)
    expect(nameRepo.updateNameStatus).toHaveBeenCalledWith(NAME_ID, {
      status: NameStatus.IN_REVIEW,
      version: 3
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
      content: 'Name review loop has reached 4 rounds'
    })
  })

  it('resubmit does not notify before review round threshold', async () => {
    const { service, notificationService } = make({ status: NameStatus.REVISION, version: 2 })

    await service.resubmit('m1', SERIES_ID, NAME_ID)

    expect(notificationService.notifySafe).not.toHaveBeenCalled()
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
        referenceType: 'NAME_APPROVED',
        content: expect.any(String)
      })
    )
  })

  it('approve emits NameApproved with kind payload (Spec 8 §6 event coupling)', async () => {
    const { service, eventBus } = make({
      status: NameStatus.SUBMITTED,
      kind: NameKind.CHAPTER,
      chapterNumber: 5
    })
    await service.approve('e1', SERIES_ID, NAME_ID)
    expect(eventBus.emit).toHaveBeenCalledWith(DomainEvent.NameApproved, {
      seriesId: SERIES_ID,
      nameId: NAME_ID,
      kind: NameKind.CHAPTER
    })
  })

  it('requestRevision notifies with NAME_REVISION_REQUESTED', async () => {
    const { service, notificationService } = make({ status: NameStatus.SUBMITTED })

    await service.requestRevision('e1', SERIES_ID, NAME_ID, 'fix pacing')

    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'm1',
        referenceType: 'NAME_REVISION_REQUESTED',
        content: expect.any(String)
      })
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

describe('NameService.createChapterName (Flow 2, MỚI — Spec 8 §4)', () => {
  it('creates chapter-Name when series SERIALIZED', async () => {
    const { service, nameRepo } = make({}, {}, SeriesStatus.SERIALIZED)
    await service.createChapterName('m1', SERIES_ID, {
      chapterNumber: 2,
      namePages: [{ pageNumber: 1, fileUrl: 'k' }]
    })
    expect(nameRepo.createChapterName).toHaveBeenCalledWith(SERIES_ID, {
      chapterNumber: 2,
      namePages: [{ pageNumber: 1, fileUrl: 'k' }]
    })
  })

  it('throws SeriesNotSerializedException when series status is not SERIALIZED', async () => {
    const { service } = make({}, {}, SeriesStatus.PITCHED)
    await expect(
      service.createChapterName('m1', SERIES_ID, {
        chapterNumber: 2,
        namePages: [{ pageNumber: 1, fileUrl: 'k' }]
      })
    ).rejects.toBe(SeriesNotSerializedException)
  })

  it('throws NotSeriesOwnerException when caller is not the owner', async () => {
    const { service } = make({}, {}, SeriesStatus.SERIALIZED)
    await expect(
      service.createChapterName('intruder', SERIES_ID, {
        chapterNumber: 2,
        namePages: [{ pageNumber: 1, fileUrl: 'k' }]
      })
    ).rejects.toBe(NotSeriesOwnerException)
  })

  it('throws DuplicateChapterNameException when chapterNumber already exists', async () => {
    const { service, nameRepo } = make({}, {}, SeriesStatus.SERIALIZED)
    nameRepo.countChapterNameByNumber.mockResolvedValueOnce(1)
    await expect(
      service.createChapterName('m1', SERIES_ID, {
        chapterNumber: 2,
        namePages: [{ pageNumber: 1, fileUrl: 'k' }]
      })
    ).rejects.toBe(DuplicateChapterNameException)
  })
})
