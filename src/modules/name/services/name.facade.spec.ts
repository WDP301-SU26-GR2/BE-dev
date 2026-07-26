import { NameFacade } from './name.facade'

describe('NameFacade', () => {
  it('keeps the controller compatibility boundary delegated to query and workflow services', async () => {
    const query = {
      listNames: jest.fn(),
      getName: jest.fn(),
      chapterListNames: jest.fn(),
      chapterGetName: jest.fn()
    }
    const workflow = {
      createChapterName: jest.fn(),
      requestRevision: jest.fn(),
      resubmit: jest.fn(),
      approve: jest.fn(),
      updatePages: jest.fn(),
      addPage: jest.fn(),
      chapterSubmit: jest.fn(),
      chapterRequestRevision: jest.fn(),
      chapterResubmit: jest.fn(),
      chapterApprove: jest.fn(),
      chapterUpdatePages: jest.fn(),
      chapterAddPage: jest.fn(),
      deleteChapterName: jest.fn()
    }
    const facade = new NameFacade(query as never, workflow as never)
    const caller = { userId: 'user-1', roleName: 'MANGAKA' }

    await Promise.all([
      facade.listNames(caller, 'series-1', { limit: 10, offset: 0 }),
      facade.getName(caller, 'series-1', 'name-1'),
      facade.createChapterName('user-1', 'chapter-1', {} as never),
      facade.requestRevision('editor-1', 'series-1', 'name-1', 'reason'),
      facade.resubmit('user-1', 'series-1', 'name-1'),
      facade.approve('editor-1', 'series-1', 'name-1'),
      facade.updatePages('user-1', 'series-1', 'name-1', {} as never),
      facade.addPage('user-1', 'series-1', 'name-1', {} as never),
      facade.chapterSubmit('user-1', 'chapter-1', 'name-1'),
      facade.chapterListNames(caller, 'chapter-1'),
      facade.chapterGetName(caller, 'chapter-1', 'name-1'),
      facade.chapterRequestRevision('editor-1', 'chapter-1', 'name-1', 'reason'),
      facade.chapterResubmit('user-1', 'chapter-1', 'name-1'),
      facade.chapterApprove('editor-1', 'chapter-1', 'name-1'),
      facade.chapterUpdatePages('user-1', 'chapter-1', 'name-1', {} as never),
      facade.chapterAddPage('user-1', 'chapter-1', 'name-1', {} as never),
      facade.deleteChapterName('user-1', 'chapter-1', 'name-1')
    ])

    expect(query.listNames).toHaveBeenCalledWith(caller, 'series-1', { limit: 10, offset: 0 })
    expect(query.getName).toHaveBeenCalledWith(caller, 'series-1', 'name-1')
    expect(query.chapterListNames).toHaveBeenCalledWith(caller, 'chapter-1')
    expect(query.chapterGetName).toHaveBeenCalledWith(caller, 'chapter-1', 'name-1')
    for (const delegate of Object.values(workflow)) expect(delegate).toHaveBeenCalledTimes(1)
  })
})
