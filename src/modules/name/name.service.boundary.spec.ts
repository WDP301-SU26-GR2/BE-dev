import { NameService } from './name.service'

describe('NameService boundary', () => {
  it('keeps the public application API while delegating to focused use-case services', async () => {
    const review = {
      approve: jest.fn().mockResolvedValue({ id: 'name-id' })
    }
    const content = {
      deleteChapterName: jest.fn().mockResolvedValue({ message: 'deleted' })
    }
    const query = {
      listNames: jest.fn().mockResolvedValue({ items: [] })
    }
    const service = new NameService(review as never, content as never, query as never)

    await expect(service.approve('editor-id', 'series-id', 'name-id')).resolves.toEqual({ id: 'name-id' })
    await expect(service.deleteChapterName('owner-id', 'chapter-id', 'name-id')).resolves.toEqual({
      message: 'deleted'
    })
    await expect(service.listNames({ userId: 'owner-id', roleName: 'MANGAKA' }, 'series-id')).resolves.toEqual({
      items: []
    })

    expect(review.approve).toHaveBeenCalledWith('editor-id', 'series-id', 'name-id')
    expect(content.deleteChapterName).toHaveBeenCalledWith('owner-id', 'chapter-id', 'name-id')
    expect(query.listNames).toHaveBeenCalledWith({ userId: 'owner-id', roleName: 'MANGAKA' }, 'series-id', undefined)
  })
})
