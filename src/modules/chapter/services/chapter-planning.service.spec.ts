import { ChapterPlanningService } from './chapter-planning.service'

const chapter = {
  id: 'chapter-1',
  seriesId: 'series-1',
  storyboardId: null,
  chapterNumber: 1,
  title: 'Chapter 1',
  totalPages: 0,
  status: 'DRAFT',
  publishedAt: null,
  hold: null
}

describe('ChapterPlanningService', () => {
  const creationService = { create: jest.fn() }
  const crudService = { updateChapter: jest.fn(), deleteChapter: jest.fn() }
  const scheduleService = { setSchedule: jest.fn(), extendDeadline: jest.fn() }
  const holdService = { hold: jest.fn(), resume: jest.fn() }
  const queryService = { getOneUnchecked: jest.fn() }
  const service = new ChapterPlanningService(
    creationService as never,
    crudService as never,
    scheduleService as never,
    holdService as never,
    queryService as never
  )

  beforeEach(() => {
    jest.clearAllMocks()
    creationService.create.mockResolvedValue(chapter)
    crudService.updateChapter.mockResolvedValue(chapter)
    queryService.getOneUnchecked.mockResolvedValue({ id: 'chapter-1' })
  })

  it('maps create and update results to the public chapter shape', async () => {
    await expect(service.create('user-1', {} as never)).resolves.toMatchObject({
      id: 'chapter-1',
      publishedAt: null,
      manuscriptStatus: null,
      schedule: null
    })
    await expect(service.updateChapter('user-1', 'chapter-1', {})).resolves.toMatchObject({
      id: 'chapter-1'
    })
  })

  it('reloads the chapter after schedule commands commit', async () => {
    await expect(service.setSchedule('user-1', 'chapter-1', {})).resolves.toEqual({ id: 'chapter-1' })
    await expect(service.extendDeadline('user-1', 'chapter-1', {} as never)).resolves.toEqual({ id: 'chapter-1' })
    expect(scheduleService.setSchedule).toHaveBeenCalledWith('user-1', 'chapter-1', {})
    expect(scheduleService.extendDeadline).toHaveBeenCalledWith('user-1', 'chapter-1', {})
    expect(queryService.getOneUnchecked).toHaveBeenCalledTimes(2)
  })

  it('delegates delete, hold and resume commands', async () => {
    crudService.deleteChapter.mockResolvedValue({ message: 'deleted' })
    holdService.hold.mockResolvedValue({ message: 'held' })
    holdService.resume.mockResolvedValue({ message: 'resumed' })

    await expect(service.deleteChapter('user-1', 'chapter-1')).resolves.toEqual({ message: 'deleted' })
    await expect(service.hold('user-1', 'chapter-1', {} as never)).resolves.toEqual({ message: 'held' })
    await expect(service.resume('user-1', 'chapter-1')).resolves.toEqual({ message: 'resumed' })
  })
})
