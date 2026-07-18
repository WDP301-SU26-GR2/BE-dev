import { ChapterAccessDeniedException, ChapterNotFoundException } from '../errors/chapter.errors'
import { ChapterProgressService } from './chapter-progress.service'

const CID = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const MID = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const EID = 'cccccccccccccccccccccccc'

function makeService() {
  const repo = {
    findChapterById: jest.fn(),
    findSeriesById: jest.fn(),
    countPagesByStatus: jest.fn().mockResolvedValue({}),
    countTasksByStatusForChapter: jest.fn().mockResolvedValue({}),
    findNameStatus: jest.fn().mockResolvedValue(null),
    findScheduleByChapterId: jest.fn().mockResolvedValue(null),
    findActiveChaptersForMangaka: jest.fn(),
    findActiveChaptersForEditor: jest.fn(),
    groupPagesByChapter: jest.fn().mockResolvedValue([]),
    groupTasksByChapter: jest.fn().mockResolvedValue([])
  }
  const service = new ChapterProgressService(repo as never)
  return { service, repo }
}

const baseChapter = { id: CID, seriesId: 's1', nameId: null, hold: null }
const baseSeries = { id: 's1', mangakaId: MID, editorId: EID, publicationType: 'WEEKLY' }

describe('ChapterProgressService.getProgress', () => {
  it('throws ChapterNotFound for malformed id without hitting repo', async () => {
    const { service, repo } = makeService()
    await expect(service.getProgress({ userId: MID, roleName: 'MANGAKA' }, 'not-hex')).rejects.toBe(
      ChapterNotFoundException
    )
    expect(repo.findChapterById).not.toHaveBeenCalled()
  })

  it('denies mangaka who is not the series owner (403)', async () => {
    const { service, repo } = makeService()
    repo.findChapterById.mockResolvedValue(baseChapter)
    repo.findSeriesById.mockResolvedValue(baseSeries)
    await expect(service.getProgress({ userId: 'ffffffffffffffffffffffff', roleName: 'MANGAKA' }, CID)).rejects.toBe(
      ChapterAccessDeniedException
    )
  })

  it.each([
    ['MANGAKA owner', { userId: MID, roleName: 'MANGAKA' }],
    ['assigned EDITOR', { userId: EID, roleName: 'EDITOR' }],
    ['BOARD_MEMBER', { userId: 'ffffffffffffffffffffffff', roleName: 'BOARD_MEMBER' }],
    ['SUPER_ADMIN', { userId: 'ffffffffffffffffffffffff', roleName: 'SUPER_ADMIN' }]
  ])('allows %s', async (_label, user) => {
    const { service, repo } = makeService()
    repo.findChapterById.mockResolvedValue(baseChapter)
    repo.findSeriesById.mockResolvedValue(baseSeries)
    await expect(service.getProgress(user, CID)).resolves.toBeDefined()
  })

  it('aggregates pages/tasks, computes progressPct + RED warning for near-deadline weekly chapter', async () => {
    const { service, repo } = makeService()
    repo.findChapterById.mockResolvedValue({ ...baseChapter, nameId: 'n1', hold: { reason: 'x' } })
    repo.findSeriesById.mockResolvedValue(baseSeries)
    repo.countPagesByStatus.mockResolvedValue({ COMPLETED: 1, IN_PROGRESS: 1, COMPOSITE_READY: 1, NOT_STARTED: 1 })
    repo.countTasksByStatusForChapter.mockResolvedValue({ ASSIGNED: 2, APPROVED: 1, CANCELLED: 3 })
    repo.findNameStatus.mockResolvedValue('APPROVED')
    repo.findScheduleByChapterId.mockResolvedValue({ currentDeadline: new Date(Date.now() + 20 * 3600 * 1000) })

    const res = await service.getProgress({ userId: EID, roleName: 'EDITOR' }, CID)

    expect(res.totalPages).toBe(4)
    expect(res.pagesCompleted).toBe(1)
    expect(res.pagesInProgress).toBe(2) // IN_PROGRESS + COMPOSITE_READY
    expect(res.pagesNotStarted).toBe(1)
    expect(res.progressPct).toBe(0.25)
    expect(res.taskBreakdown).toEqual({
      assigned: 2,
      inProgress: 0,
      submitted: 0,
      underReview: 0,
      approved: 1,
      revisionRequested: 0,
      onHold: 0,
      cancelled: 3
    })
    expect(res.nameStatus).toBe('APPROVED')
    expect(res.warningLevel).toBe('RED') // weekly, còn ~20h, 25% < 90%
    expect(res.remainingHours).toBeGreaterThan(19)
    expect(res.onHold).toBe(true)
  })

  it('totalPages=0 → progressPct 0; no deadline → warningLevel NONE + null remainingHours', async () => {
    const { service, repo } = makeService()
    repo.findChapterById.mockResolvedValue(baseChapter)
    repo.findSeriesById.mockResolvedValue(baseSeries)

    const res = await service.getProgress({ userId: MID, roleName: 'MANGAKA' }, CID)

    expect(res.totalPages).toBe(0)
    expect(res.progressPct).toBe(0)
    expect(res.deadline).toBeNull()
    expect(res.remainingHours).toBeNull()
    expect(res.warningLevel).toBe('NONE')
    expect(res.onHold).toBe(false)
  })
})

describe('ChapterProgressService.overviewForMangaka', () => {
  it('builds items with openTasks, sorts by severity then deadline (null deadline last)', async () => {
    const { service, repo } = makeService()
    const soon = new Date(Date.now() + 10 * 3600 * 1000) // weekly → RED khi progress 0
    const later = new Date(Date.now() + 500 * 3600 * 1000) // xa → NONE
    repo.findActiveChaptersForMangaka.mockResolvedValue({
      series: [{ id: 's1', title: 'Series One', publicationType: 'WEEKLY' }],
      chapters: [
        {
          id: 'c-none',
          seriesId: 's1',
          chapterNumber: 1,
          title: null,
          hold: null,
          manuscript: { status: 'IN_PRODUCTION' },
          schedule: { currentDeadline: later }
        },
        {
          id: 'c-red',
          seriesId: 's1',
          chapterNumber: 2,
          title: 'Ch 2',
          hold: null,
          manuscript: { status: 'IN_PRODUCTION' },
          schedule: { currentDeadline: soon }
        },
        {
          id: 'c-nodeadline',
          seriesId: 's1',
          chapterNumber: 3,
          title: null,
          hold: { reason: 'x' },
          manuscript: { status: 'EDITOR_REVIEW' },
          schedule: null
        }
      ]
    })
    repo.groupPagesByChapter.mockResolvedValue([
      { chapterId: 'c-red', status: 'NOT_STARTED', _count: { _all: 2 } },
      { chapterId: 'c-none', status: 'COMPLETED', _count: { _all: 2 } }
    ])
    repo.groupTasksByChapter.mockResolvedValue([
      { chapterId: 'c-red', status: 'ASSIGNED', count: 2 },
      { chapterId: 'c-red', status: 'CANCELLED', count: 5 }, // không tính vào openTasks
      { chapterId: 'c-none', status: 'APPROVED', count: 1 } // không tính vào openTasks
    ])

    const res = await service.overviewForMangaka(MID)

    expect(res.items.map((i) => i.chapterId)).toEqual(['c-red', 'c-none', 'c-nodeadline'])
    const red = res.items[0]
    expect(red.warningLevel).toBe('RED')
    expect(red.openTasks).toBe(2)
    expect(red.seriesTitle).toBe('Series One')
    expect(red.progressPct).toBe(0)
    const none = res.items[1]
    expect(none.warningLevel).toBe('NONE')
    expect(none.progressPct).toBe(1)
    expect(none.openTasks).toBe(0)
    expect(res.items[2].onHold).toBe(true)
    expect(res.items[2].deadline).toBeNull()
  })

  it('returns empty items when mangaka has no active chapters', async () => {
    const { service, repo } = makeService()
    repo.findActiveChaptersForMangaka.mockResolvedValue({ series: [], chapters: [] })
    const res = await service.overviewForMangaka(MID)
    expect(res.items).toEqual([])
    expect(repo.groupPagesByChapter).not.toHaveBeenCalled()
  })
})

describe('ChapterProgressService.overviewForEditor', () => {
  it('loads the assigned editor series and builds the shared overview shape', async () => {
    const { service, repo } = makeService()
    repo.findActiveChaptersForEditor.mockResolvedValue({
      series: [{ id: 's1', title: 'Series One', publicationType: 'WEEKLY' }],
      chapters: [
        {
          id: 'c-editor',
          seriesId: 's1',
          chapterNumber: 1,
          title: 'Editor chapter',
          hold: null,
          manuscript: { status: 'IN_PRODUCTION' },
          schedule: null
        }
      ]
    })

    const res = await service.overviewForEditor(EID)

    expect(repo.findActiveChaptersForEditor).toHaveBeenCalledWith(EID)
    expect(res).toEqual({
      items: [
        expect.objectContaining({
          chapterId: 'c-editor',
          seriesId: 's1',
          seriesTitle: 'Series One',
          warningLevel: 'NONE',
          totalPages: 0,
          openTasks: 0
        })
      ]
    })
  })
})
