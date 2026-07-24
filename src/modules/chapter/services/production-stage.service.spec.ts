import { ProductionStageService } from './production-stage.service'
import { StageAccessDeniedException } from '../errors/production-stage.errors'

const chapterId = '0123456789abcdef01234567'

describe('ProductionStageService', () => {
  it('denies stage analytics outside the chapter scope', async () => {
    const repo = { findByChapter: jest.fn(), findTasksForStageAnalytics: jest.fn() }
    const chapterRepo = {
      findChapterById: jest.fn().mockResolvedValue({ id: chapterId, seriesId: 's1' }),
      findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'other', editorId: 'e1' })
    }
    const service = new ProductionStageService(repo as never, chapterRepo as never, {} as never)
    await expect(service.list({ userId: 'm1', roleName: 'MANGAKA' }, chapterId)).rejects.toBe(
      StageAccessDeniedException
    )
  })
})
