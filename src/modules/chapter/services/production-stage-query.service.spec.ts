import { ProductionStageQueryService } from './production-stage-query.service'

describe('ProductionStageQueryService', () => {
  it('exposes read capabilities without leaking the repository to consumers', async () => {
    const stage = { id: 'stage-1' }
    const stagePage = { stageId: 'stage-1', pageId: 'page-1' }
    const repository = {
      countByChapter: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(stage),
      findStagePage: jest.fn().mockResolvedValue(stagePage)
    }
    const service = new ProductionStageQueryService(repository as never)

    await expect(service.countByChapter('chapter-1')).resolves.toBe(2)
    await expect(service.findById('stage-1')).resolves.toBe(stage)
    await expect(service.findStagePage('stage-1', 'page-1')).resolves.toBe(stagePage)
    await expect(service.hasStagePage('stage-1', 'page-1')).resolves.toBe(true)
  })
})
