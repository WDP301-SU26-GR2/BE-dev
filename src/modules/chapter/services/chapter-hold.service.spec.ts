import { AuditEntityType, ManuscriptStatus } from '@prisma/client'
import { ChapterHoldService } from './chapter-hold.service'
import {
  ChapterAlreadyOnHoldException,
  ChapterNotHoldableException,
  ChapterNotOnHoldException,
  NotSeriesEditorException
} from '../errors/chapter.errors'

const CHAPTER_ID = 'a'.repeat(24)
const EDITOR_ID = 'editor-1'
const MANGAKA_ID = 'mangaka-1'
const SERIES = { id: 'series-1', editorId: EDITOR_ID, mangakaId: MANGAKA_ID }

describe('ChapterHoldService', () => {
  const repo = {
    findChapterById: jest.fn(),
    findSeriesById: jest.fn(),
    findManuscriptByChapterId: jest.fn(),
    setChapterHold: jest.fn(),
    unsetChapterHold: jest.fn()
  }
  const notification = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const audit = { record: jest.fn().mockResolvedValue(undefined) }
  const service = new ChapterHoldService(repo as never, notification as never, audit as never)

  beforeEach(() => jest.clearAllMocks())

  it.each([
    ManuscriptStatus.IN_PRODUCTION,
    ManuscriptStatus.EDITOR_REVIEW,
    ManuscriptStatus.EDITOR_REVISION,
    ManuscriptStatus.READY_FOR_PRINT
  ])('holds chapter when manuscript is %s', async (status) => {
    repo.findChapterById.mockResolvedValue({ id: CHAPTER_ID, seriesId: SERIES.id, hold: null })
    repo.findSeriesById.mockResolvedValue(SERIES)
    repo.findManuscriptByChapterId.mockResolvedValue({ status })
    repo.setChapterHold.mockResolvedValue({
      id: CHAPTER_ID,
      seriesId: SERIES.id,
      hold: { reason: 'break', expectedReturnDate: null, heldBy: EDITOR_ID, heldAt: new Date() }
    })

    await service.hold(EDITOR_ID, CHAPTER_ID, { reason: 'break' })

    expect(repo.setChapterHold).toHaveBeenCalledWith(
      CHAPTER_ID,
      expect.objectContaining({ reason: 'break', expectedReturnDate: null, heldBy: EDITOR_ID })
    )
    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: MANGAKA_ID, referenceType: 'CHAPTER_HELD' })
    )
    expect(audit.record).toHaveBeenCalledWith({
      actorId: EDITOR_ID,
      entityType: AuditEntityType.CHAPTER,
      entityId: CHAPTER_ID,
      action: 'HOLD',
      reason: 'break'
    })
  })

  it.each([ManuscriptStatus.DRAFT, ManuscriptStatus.PUBLISHED, ManuscriptStatus.AWAITING_CO_OWNER_APPROVAL])(
    'rejects hold when manuscript is %s',
    async (status) => {
      repo.findChapterById.mockResolvedValue({ id: CHAPTER_ID, seriesId: SERIES.id, hold: null })
      repo.findSeriesById.mockResolvedValue(SERIES)
      repo.findManuscriptByChapterId.mockResolvedValue({ status })
      await expect(service.hold(EDITOR_ID, CHAPTER_ID, { reason: 'break' })).rejects.toBe(ChapterNotHoldableException)
    }
  )

  it('rejects double hold and resume without hold', async () => {
    repo.findChapterById.mockResolvedValue({ id: CHAPTER_ID, seriesId: SERIES.id, hold: { reason: 'break' } })
    repo.findSeriesById.mockResolvedValue(SERIES)
    await expect(service.hold(EDITOR_ID, CHAPTER_ID, { reason: 'again' })).rejects.toBe(ChapterAlreadyOnHoldException)

    repo.findChapterById.mockResolvedValue({ id: CHAPTER_ID, seriesId: SERIES.id, hold: null })
    await expect(service.resume(EDITOR_ID, CHAPTER_ID)).rejects.toBe(ChapterNotOnHoldException)
  })

  it('resumes chapter by unsetting hold and notifying mangaka', async () => {
    repo.findChapterById.mockResolvedValue({ id: CHAPTER_ID, seriesId: SERIES.id, hold: { reason: 'break' } })
    repo.findSeriesById.mockResolvedValue(SERIES)
    repo.unsetChapterHold.mockResolvedValue({ id: CHAPTER_ID, seriesId: SERIES.id, hold: null })

    await service.resume(EDITOR_ID, CHAPTER_ID)

    expect(repo.unsetChapterHold).toHaveBeenCalledWith(CHAPTER_ID, EDITOR_ID)
    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: MANGAKA_ID, referenceType: 'CHAPTER_RESUMED' })
    )
    expect(audit.record).toHaveBeenCalledWith({
      actorId: EDITOR_ID,
      entityType: AuditEntityType.CHAPTER,
      entityId: CHAPTER_ID,
      action: 'RESUME'
    })
  })

  it('rejects non-assigned editor', async () => {
    repo.findChapterById.mockResolvedValue({ id: CHAPTER_ID, seriesId: SERIES.id, hold: null })
    repo.findSeriesById.mockResolvedValue({ ...SERIES, editorId: 'other-editor' })

    await expect(service.hold(EDITOR_ID, CHAPTER_ID, { reason: 'break' })).rejects.toBe(NotSeriesEditorException)
  })
})
