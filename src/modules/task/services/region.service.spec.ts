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
    countTasksByRegion: jest.fn(),
    findAiRegionsByPage: jest.fn(),
    replaceAiRegions: jest.fn()
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

  it('assertPageOwner returns page for owner', async () => {
    const page = { ...PAGE, originalFile: 'uploads/x.png' }
    repo.findPageWithOwner.mockResolvedValue(page)
    await expect(service.assertPageOwner('m', VALID_PAGE_ID)).resolves.toBe(page)
  })

  it('applyAiRegions deletes bare AI regions and skips confirmed/task-linked regions', async () => {
    const proposed = [
      {
        regionType: 'PANEL' as const,
        detectedSubtype: 'frame',
        coordinates: { x: 0, y: 0, width: 10, height: 10 },
        confidenceScore: 0.9
      }
    ]
    repo.findAiRegionsByPage.mockResolvedValue([
      { id: '1'.repeat(24), pageId: VALID_PAGE_ID, confirmedByMangaka: false },
      { id: '2'.repeat(24), pageId: VALID_PAGE_ID, confirmedByMangaka: true },
      { id: '3'.repeat(24), pageId: VALID_PAGE_ID, confirmedByMangaka: false }
    ])
    repo.countTasksByRegion.mockImplementation((id: string) => Promise.resolve(id === '3'.repeat(24) ? 1 : 0))
    repo.replaceAiRegions.mockResolvedValue(1)

    await expect(service.applyAiRegions(VALID_PAGE_ID, proposed, { aiModelVersion: 'x@1' })).resolves.toEqual({
      created: 1,
      removed: 1,
      skipped: 2
    })
    expect(repo.replaceAiRegions).toHaveBeenCalledWith(VALID_PAGE_ID, ['1'.repeat(24)], proposed, {
      aiModelVersion: 'x@1'
    })
  })
})
