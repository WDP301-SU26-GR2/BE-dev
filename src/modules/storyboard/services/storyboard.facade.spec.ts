import { StoryboardFacade } from './storyboard.facade'

describe('StoryboardFacade', () => {
  it('keeps the controller compatibility boundary delegated to query and workflow services', async () => {
    const query = {
      chapterListStoryboards: jest.fn(),
      chapterGetStoryboard: jest.fn()
    }
    const workflow = {
      createChapterStoryboard: jest.fn(),
      chapterSubmit: jest.fn(),
      chapterRequestRevision: jest.fn(),
      chapterResubmit: jest.fn(),
      chapterApprove: jest.fn(),
      chapterUpdatePages: jest.fn(),
      chapterAddPage: jest.fn(),
      deleteChapterStoryboard: jest.fn()
    }
    const facade = new StoryboardFacade(query as never, workflow as never)
    const caller = { userId: 'user-1', roleName: 'MANGAKA' }

    await Promise.all([
      facade.createChapterStoryboard('user-1', 'chapter-1', {} as never),
      facade.chapterSubmit('user-1', 'chapter-1', 'sb-1'),
      facade.chapterListStoryboards(caller, 'chapter-1'),
      facade.chapterGetStoryboard(caller, 'chapter-1', 'sb-1'),
      facade.chapterRequestRevision('editor-1', 'chapter-1', 'sb-1', 'reason'),
      facade.chapterResubmit('user-1', 'chapter-1', 'sb-1'),
      facade.chapterApprove('editor-1', 'chapter-1', 'sb-1'),
      facade.chapterUpdatePages('user-1', 'chapter-1', 'sb-1', {} as never),
      facade.chapterAddPage('user-1', 'chapter-1', 'sb-1', {} as never),
      facade.deleteChapterStoryboard('user-1', 'chapter-1', 'sb-1')
    ])

    expect(query.chapterListStoryboards).toHaveBeenCalledWith(caller, 'chapter-1')
    expect(query.chapterGetStoryboard).toHaveBeenCalledWith(caller, 'chapter-1', 'sb-1')
    for (const delegate of Object.values(workflow)) expect(delegate).toHaveBeenCalledTimes(1)
  })
})
