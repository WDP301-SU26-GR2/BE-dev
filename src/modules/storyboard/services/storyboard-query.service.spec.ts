import { RoleName } from 'src/core/security/constants/role.constant'
import { StoryboardQueryService } from './storyboard-query.service'

const SERIES_ID = '0123456789abcdef01234567'
const CHAPTER_ID = '0123456789abcdef01234599'

describe('StoryboardQueryService.chapterListStoryboards', () => {
  it('rejects an unrelated editor before loading storyboards', async () => {
    const repository = {
      findSeriesForGuard: jest.fn().mockResolvedValue({ id: SERIES_ID, editorId: 'assigned', mangakaId: 'owner' }),
      findChapterForStoryboardGuard: jest.fn().mockResolvedValue({ id: CHAPTER_ID, seriesId: SERIES_ID }),
      findStoryboardsByChapterId: jest.fn()
    }
    const service = new StoryboardQueryService(repository as never)

    await expect(
      service.chapterListStoryboards({ userId: 'other-editor', roleName: RoleName.EDITOR }, CHAPTER_ID)
    ).rejects.toMatchObject({ status: 403 })
    expect(repository.findStoryboardsByChapterId).not.toHaveBeenCalled()
  })

  it('returns chapter storyboards for the assigned editor', async () => {
    const repository = {
      findSeriesForGuard: jest.fn().mockResolvedValue({ id: SERIES_ID, editorId: 'assigned', mangakaId: 'owner' }),
      findChapterForStoryboardGuard: jest.fn().mockResolvedValue({ id: CHAPTER_ID, seriesId: SERIES_ID }),
      findStoryboardsByChapterId: jest.fn().mockResolvedValue([])
    }
    const service = new StoryboardQueryService(repository as never)

    await expect(
      service.chapterListStoryboards({ userId: 'assigned', roleName: RoleName.EDITOR }, CHAPTER_ID)
    ).resolves.toEqual({ items: [] })
  })
})
