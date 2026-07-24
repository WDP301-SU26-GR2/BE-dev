import { ProductionStagePageService } from './production-stage-page.service'
import { StageOutputInvalidException } from '../errors/production-stage.errors'

const chapterId = '0123456789abcdef01234567'
const stageId = 'fedcba987654321001234567'
const pageId = 'aaaaaaaaaaaaaaaaaaaaaaaa'

describe('ProductionStagePageService', () => {
  it('requires an exact, duplicate-free page set for output confirmation', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue({ id: stageId, chapterId, status: 'ACTIVE' }),
      findStagePages: jest.fn().mockResolvedValue([
        {
          stageId,
          pageId,
          inputFileKey: 'input.png',
          inputSourceType: 'ORIGINAL',
          inputRevision: 1,
          outputConfirmedAt: null,
          outputFileKey: null,
          outputSourceType: null,
          outputRevision: null,
          outputConfirmedBy: null
        }
      ])
    }
    const chapterRepo = {
      findChapterById: jest.fn().mockResolvedValue({ id: chapterId, seriesId: 's1', hold: null }),
      findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'm1', editorId: 'e1' })
    }
    const service = new ProductionStagePageService(repo as never, chapterRepo as never)
    await expect(
      service.confirmOutputs('m1', chapterId, stageId, { items: [{ pageId }, { pageId, reuseInput: true }] })
    ).rejects.toBe(StageOutputInvalidException)
  })
})
