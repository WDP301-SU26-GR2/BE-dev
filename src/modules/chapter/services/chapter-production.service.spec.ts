import { ChapterProductionService } from './chapter-production.service'

const page = {
  id: 'page-1',
  chapterId: 'chapter-1',
  pageNumber: 1,
  originalFile: 'original.png',
  compositeFile: null,
  compositeRevision: 0,
  canvasWidth: 100,
  canvasHeight: 200,
  status: 'DRAFT',
  createdAt: new Date('2026-01-01T00:00:00.000Z')
}

describe('ChapterProductionService', () => {
  const pageService = {
    createPage: jest.fn(),
    listPages: jest.fn(),
    deletePage: jest.fn(),
    deletePagesBulk: jest.fn(),
    updatePage: jest.fn()
  }
  const reviewService = {
    submit: jest.fn(),
    requestRevision: jest.fn(),
    resubmit: jest.fn(),
    approve: jest.fn()
  }
  const publishService = { publish: jest.fn() }
  const coOwnerService = { approve: jest.fn(), reject: jest.fn() }
  const queryService = { getOneUnchecked: jest.fn() }
  const service = new ChapterProductionService(
    pageService as never,
    reviewService as never,
    publishService as never,
    coOwnerService as never,
    queryService as never
  )

  beforeEach(() => {
    jest.clearAllMocks()
    pageService.createPage.mockResolvedValue(page)
    pageService.listPages.mockResolvedValue([page])
    pageService.updatePage.mockResolvedValue(page)
    queryService.getOneUnchecked.mockResolvedValue({ id: 'chapter-1' })
  })

  it('maps page write and list results while preserving the display-file contract', async () => {
    await expect(service.createPage('user-1', 'chapter-1', {} as never)).resolves.toMatchObject({
      id: 'page-1',
      displayFile: 'original.png',
      createdAt: '2026-01-01T00:00:00.000Z'
    })
    await expect(service.listPages('user-1', 'MANGAKA', 'chapter-1')).resolves.toMatchObject({
      items: [{ id: 'page-1', displayFile: 'original.png' }]
    })
    await expect(service.updatePage('user-1', 'page-1', {})).resolves.toMatchObject({ id: 'page-1' })
  })

  it('delegates page deletion commands without changing their result', async () => {
    pageService.deletePage.mockResolvedValue({ message: 'deleted' })
    pageService.deletePagesBulk.mockResolvedValue({ message: 'deleted in bulk' })

    await expect(service.deletePage('user-1', 'page-1')).resolves.toEqual({ message: 'deleted' })
    await expect(service.deletePagesBulk('user-1', 'chapter-1', {} as never)).resolves.toEqual({
      message: 'deleted in bulk'
    })
  })

  it.each([
    ['submit', reviewService.submit, []],
    ['requestRevision', reviewService.requestRevision, ['reason']],
    ['resubmit', reviewService.resubmit, []],
    ['approve', reviewService.approve, []],
    ['publish', publishService.publish, []],
    ['coOwnerApprove', coOwnerService.approve, []],
    ['coOwnerReject', coOwnerService.reject, ['reason']]
  ] as const)('runs %s then reloads the committed chapter', async (method, command, extra) => {
    command.mockResolvedValue(undefined)

    await expect(
      (service[method] as (userId: string, chapterId: string, reason?: string) => Promise<unknown>)(
        'user-1',
        'chapter-1',
        extra[0]
      )
    ).resolves.toEqual({ id: 'chapter-1' })
    expect(command).toHaveBeenCalledWith('user-1', 'chapter-1', ...extra)
    expect(queryService.getOneUnchecked).toHaveBeenCalledWith('chapter-1')
  })
})
