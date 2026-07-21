import { RoleName } from 'src/core/security/constants/role.constant'
import { TaskService } from './task.service'

const makeTask = (over: Record<string, unknown> = {}) => ({
  id: '507f1f77bcf86cd799439011',
  pageId: '507f1f77bcf86cd799439012',
  regionIds: ['507f1f77bcf86cd799439013'],
  assistantId: '507f1f77bcf86cd799439014',
  taskType: 'BACKGROUND',
  status: 'ASSIGNED',
  statusReason: null,
  priority: 0,
  deadline: null,
  assetIds: [],
  versions: [],
  createdAt: new Date(),
  ...over
})

function makeRepo(over: Record<string, unknown> = {}) {
  return {
    findPageWithOwner: jest.fn().mockResolvedValue({
      id: '507f1f77bcf86cd799439012',
      chapter: { series: { mangakaId: 'mangaka-1' } }
    }),
    listTasks: jest.fn().mockResolvedValue([makeTask()]),
    countTasks: jest.fn().mockResolvedValue(1),
    ...over
  }
}

function makeService(repo: ReturnType<typeof makeRepo>) {
  return new TaskService({} as never, {} as never, {} as never, {} as never, repo as never)
}

describe('TaskService.listTasks', () => {
  it('applies regionId filter for assistants', async () => {
    const repo = makeRepo()
    const svc = makeService(repo)
    const regionId = '507f1f77bcf86cd799439013'

    await svc.listTasks('assistant-1', RoleName.ASSISTANT, { regionId, limit: 20, offset: 0 })

    expect(repo.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ assistantId: 'assistant-1', regionIds: { has: regionId } }),
      {
        limit: 20,
        offset: 0
      }
    )
    expect(repo.countTasks).toHaveBeenCalledWith(
      expect.objectContaining({ assistantId: 'assistant-1', regionIds: { has: regionId } })
    )
  })

  it('applies regionId filter for mangaka-owned page', async () => {
    const repo = makeRepo()
    const svc = makeService(repo)
    const pageId = '507f1f77bcf86cd799439012'
    const regionId = '507f1f77bcf86cd799439013'

    await svc.listTasks('mangaka-1', RoleName.MANGAKA, { pageId, regionId, limit: 20, offset: 0 })

    expect(repo.findPageWithOwner).toHaveBeenCalledWith(pageId)
    expect(repo.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ pageId, regionIds: { has: regionId } }),
      {
        limit: 20,
        offset: 0
      }
    )
  })

  it('returns empty for malformed assistant pageId or regionId without repository calls', async () => {
    const repo = makeRepo()
    const svc = makeService(repo)

    await expect(
      svc.listTasks('assistant-1', RoleName.ASSISTANT, { pageId: 'bad-id', limit: 20, offset: 0 })
    ).resolves.toMatchObject({ items: [], total: 0 })
    await expect(
      svc.listTasks('assistant-1', RoleName.ASSISTANT, { regionId: 'bad-id', limit: 20, offset: 0 })
    ).resolves.toMatchObject({ items: [], total: 0 })

    expect(repo.listTasks).not.toHaveBeenCalled()
    expect(repo.countTasks).not.toHaveBeenCalled()
  })

  it('returns empty for malformed mangaka filters before Prisma lookup', async () => {
    const repo = makeRepo()
    const svc = makeService(repo)

    await expect(
      svc.listTasks('mangaka-1', RoleName.MANGAKA, {
        pageId: '507f1f77bcf86cd799439012',
        regionId: 'bad-id',
        limit: 20,
        offset: 0
      })
    ).resolves.toMatchObject({ items: [], total: 0 })
    await expect(
      svc.listTasks('mangaka-1', RoleName.MANGAKA, {
        pageId: '507f1f77bcf86cd799439012',
        assistantId: 'bad-id',
        limit: 20,
        offset: 0
      })
    ).resolves.toMatchObject({ items: [], total: 0 })

    expect(repo.findPageWithOwner).not.toHaveBeenCalled()
    expect(repo.listTasks).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Mangaka list task KHÔNG cần bám flow page → filter dần assistant/series/chapter/page.
// Trước đây thiếu pageId là trả rỗng ⇒ không có màn "tất cả việc của tôi".
// ─────────────────────────────────────────────────────────────────────────────
describe('TaskService.listTasks — mangaka scope toàn bộ series của mình', () => {
  const S1 = '0123456789abcdef01230001'
  const C1 = '0123456789abcdef01230002'
  const P1 = '0123456789abcdef01230003'
  const A1 = '0123456789abcdef01230004'

  function makeDeps(over: Record<string, unknown> = {}) {
    const repo = {
      findOwnedPageIds: jest.fn().mockResolvedValue([P1]),
      findPageWithOwner: jest.fn().mockResolvedValue({
        id: P1,
        chapterId: C1,
        chapter: { seriesId: S1, hold: null, series: { mangakaId: 'mangaka' } }
      }),
      listTasks: jest.fn().mockResolvedValue([]),
      countTasks: jest.fn().mockResolvedValue(0),
      ...over
    }
    return repo
  }

  function makeSvc(repo: Record<string, unknown>) {
    return new TaskService({} as never, {} as never, {} as never, {} as never, repo as never)
  }

  const baseQuery = { limit: 20, offset: 0 }

  it('không truyền pageId vẫn trả task của mọi series mình sở hữu', async () => {
    const repo = makeDeps()
    await makeSvc(repo).listTasks('mangaka', 'MANGAKA', baseQuery)

    expect(repo.findOwnedPageIds).toHaveBeenCalledWith('mangaka', {})
    expect(repo.listTasks.mock.calls[0][0]).toEqual({ pageId: { in: [P1] } })
  })

  it('lọc theo seriesId', async () => {
    const repo = makeDeps()
    await makeSvc(repo).listTasks('mangaka', 'MANGAKA', { ...baseQuery, seriesId: S1 })

    expect(repo.findOwnedPageIds).toHaveBeenCalledWith('mangaka', { seriesId: S1 })
  })

  it('lọc theo chapterId', async () => {
    const repo = makeDeps()
    await makeSvc(repo).listTasks('mangaka', 'MANGAKA', { ...baseQuery, chapterId: C1 })

    expect(repo.findOwnedPageIds).toHaveBeenCalledWith('mangaka', { chapterId: C1 })
  })

  it('lọc theo assistantId cộng dồn với scope sở hữu', async () => {
    const repo = makeDeps()
    await makeSvc(repo).listTasks('mangaka', 'MANGAKA', { ...baseQuery, assistantId: A1 })

    expect(repo.listTasks.mock.calls[0][0]).toEqual({
      pageId: { in: [P1] },
      assistantId: A1
    })
  })

  it('truyền pageId vẫn giữ đường cũ: kiểm sở hữu đúng 1 trang', async () => {
    const repo = makeDeps()
    await makeSvc(repo).listTasks('mangaka', 'MANGAKA', { ...baseQuery, pageId: P1 })

    expect(repo.findPageWithOwner).toHaveBeenCalledWith(P1)
    expect(repo.listTasks.mock.calls[0][0]).toEqual({ pageId: P1 })
  })

  it('pageId không thuộc mình → rỗng, không truy vấn task', async () => {
    const repo = makeDeps({
      findPageWithOwner: jest.fn().mockResolvedValue({
        id: P1,
        chapterId: C1,
        chapter: { seriesId: S1, hold: null, series: { mangakaId: 'someone-else' } }
      })
    })

    const res = await makeSvc(repo).listTasks('mangaka', 'MANGAKA', { ...baseQuery, pageId: P1 })

    expect(res.items).toEqual([])
    expect(repo.listTasks).not.toHaveBeenCalled()
  })

  it('không sở hữu trang nào → rỗng, không truy vấn task', async () => {
    const repo = makeDeps({ findOwnedPageIds: jest.fn().mockResolvedValue([]) })

    const res = await makeSvc(repo).listTasks('mangaka', 'MANGAKA', baseQuery)

    expect(res.items).toEqual([])
    expect(res.total).toBe(0)
    expect(repo.listTasks).not.toHaveBeenCalled()
  })

  it('seriesId rác → rỗng, không truy vấn', async () => {
    const repo = makeDeps()
    const res = await makeSvc(repo).listTasks('mangaka', 'MANGAKA', { ...baseQuery, seriesId: 'rac' })

    expect(res.items).toEqual([])
    expect(repo.findOwnedPageIds).not.toHaveBeenCalled()
    expect(repo.listTasks).not.toHaveBeenCalled()
  })

  it('assistant vẫn chỉ thấy task của chính mình, kể cả khi lọc theo series', async () => {
    const repo = makeDeps({ findOwnedPageIds: jest.fn().mockResolvedValue([P1]) })
    await makeSvc(repo).listTasks('assistant', 'ASSISTANT', { ...baseQuery, seriesId: S1 })

    const where = repo.listTasks.mock.calls[0][0]
    expect(where.assistantId).toBe('assistant')
    expect(where.pageId).toEqual({ in: [P1] })
    // scope series của assistant KHÔNG lọc theo quyền sở hữu mangaka
    expect(repo.findOwnedPageIds).toHaveBeenCalledWith(undefined, { seriesId: S1 })
  })
})
