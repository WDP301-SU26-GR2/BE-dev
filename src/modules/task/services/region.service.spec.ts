import { RegionService } from './region.service'
import { NotSeriesOwnerException, PageNotFoundException, RegionHasTasksException } from '../errors/task.errors'

const PAGE = {
  id: 'a'.repeat(24),
  chapterId: 'c',
  status: 'IN_PROGRESS',
  chapter: { seriesId: 's', series: { mangakaId: 'm' } }
}

describe('RegionService', () => {
  const repo = {
    findPageWithOwner: jest.fn(),
    createRegion: jest.fn(),
    findRegionById: jest.fn(),
    updateRegion: jest.fn(),
    deleteRegion: jest.fn(),
    listRegionsByPage: jest.fn(),
    countTasksByRegion: jest.fn()
  }
  const service = new RegionService(repo as never)
  const VALID_PAGE_ID = 'a'.repeat(24)
  const VALID_REGION_ID = 'b'.repeat(24)
  beforeEach(() => jest.clearAllMocks())

  it('create rejects malformed pageId → 404', async () => {
    await expect(service.create('m', 'bad-id', { coordinates: { x: 0, y: 0, width: 1, height: 1 } })).rejects.toBe(
      PageNotFoundException
    )
  })

  it('create rejects non-owner → 403', async () => {
    repo.findPageWithOwner.mockResolvedValue(PAGE)
    await expect(
      service.create('OTHER', VALID_PAGE_ID, { coordinates: { x: 0, y: 0, width: 1, height: 1 } })
    ).rejects.toBe(NotSeriesOwnerException)
  })

  it('create owner → createRegion called', async () => {
    repo.findPageWithOwner.mockResolvedValue(PAGE)
    repo.createRegion.mockResolvedValue({
      id: 'r',
      pageId: VALID_PAGE_ID,
      confirmedByMangaka: true,
      confidenceScore: null
    })
    await service.create('m', VALID_PAGE_ID, { coordinates: { x: 0, y: 0, width: 1, height: 1 } })
    expect(repo.createRegion).toHaveBeenCalled()
  })

  it('delete rejects when region has tasks → 409', async () => {
    repo.findRegionById.mockResolvedValue({ id: VALID_REGION_ID, pageId: VALID_PAGE_ID })
    repo.findPageWithOwner.mockResolvedValue(PAGE)
    repo.countTasksByRegion.mockResolvedValue(2)
    await expect(service.remove('m', VALID_REGION_ID)).rejects.toBe(RegionHasTasksException)
    expect(repo.deleteRegion).not.toHaveBeenCalled()
  })
})
