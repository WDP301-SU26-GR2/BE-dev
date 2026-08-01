import { StoryboardService } from './storyboard.service'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { StoryboardModule } from './storyboard.module'

describe('StoryboardService boundary', () => {
  it('wires only the chapter-storyboard controller', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, StoryboardModule) as Array<{ name?: string }>
    expect(controllers.map((controller) => controller.name)).toEqual(['ChapterStoryboardController'])
  })

  it('keeps the public application API while delegating to focused use-case services', async () => {
    const review = {
      chapterApprove: jest.fn().mockResolvedValue({ id: 'sb-id' })
    }
    const content = {
      deleteChapterStoryboard: jest.fn().mockResolvedValue({ message: 'deleted' })
    }
    const query = {
      chapterListStoryboards: jest.fn().mockResolvedValue({ items: [] })
    }
    const service = new StoryboardService(review as never, content as never, query as never)

    await expect(service.chapterApprove('editor-id', 'chapter-id', 'sb-id')).resolves.toEqual({ id: 'sb-id' })
    await expect(service.deleteChapterStoryboard('owner-id', 'chapter-id', 'sb-id')).resolves.toEqual({
      message: 'deleted'
    })
    await expect(
      service.chapterListStoryboards({ userId: 'owner-id', roleName: 'MANGAKA' }, 'chapter-id')
    ).resolves.toEqual({
      items: []
    })

    expect(review.chapterApprove).toHaveBeenCalledWith('editor-id', 'chapter-id', 'sb-id')
    expect(content.deleteChapterStoryboard).toHaveBeenCalledWith('owner-id', 'chapter-id', 'sb-id')
    expect(query.chapterListStoryboards).toHaveBeenCalledWith({ userId: 'owner-id', roleName: 'MANGAKA' }, 'chapter-id')
  })
})
