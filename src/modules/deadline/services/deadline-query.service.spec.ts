import { DeadlineQueryService } from './deadline-query.service'

const CHAPTER_ID = '507f1f77bcf86cd799439011'
const REQUEST_ID = '507f1f77bcf86cd799439012'

function make() {
  const schedule = { getDeadlineContext: jest.fn() }
  const repository = { listByChapter: jest.fn(), findById: jest.fn() }
  return { service: new DeadlineQueryService(schedule as never, repository as never), schedule, repository }
}

describe('DeadlineQueryService', () => {
  it('allows SUPER_ADMIN to list a chapter without ownership scoping', async () => {
    const { service, schedule, repository } = make()
    schedule.getDeadlineContext.mockResolvedValue({ series: { mangakaId: 'm1', editorId: 'e1' } })
    repository.listByChapter.mockResolvedValue([])

    await expect(service.list('admin-1', 'SUPER_ADMIN', { chapterId: CHAPTER_ID })).resolves.toEqual({ items: [] })
    expect(repository.listByChapter).toHaveBeenCalledWith(CHAPTER_ID, undefined)
  })

  it('loads a request then verifies its chapter access before returning it', async () => {
    const { service, schedule, repository } = make()
    repository.findById.mockResolvedValue({
      id: REQUEST_ID,
      chapterId: CHAPTER_ID,
      createdAt: new Date(),
      currentDeadline: null,
      requestedDeadline: null,
      resolvedAt: null
    })
    schedule.getDeadlineContext.mockResolvedValue({ series: { mangakaId: 'm1', editorId: 'e1' } })

    await expect(service.getOne('admin-1', 'SUPER_ADMIN', REQUEST_ID)).resolves.toMatchObject({ id: REQUEST_ID })
  })
})
