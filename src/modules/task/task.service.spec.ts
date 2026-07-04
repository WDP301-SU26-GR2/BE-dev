import { RoleName } from 'src/core/security/constants/role.constant'
import { TaskService } from './task.service'

const makeTask = (over: Record<string, unknown> = {}) => ({
  id: '507f1f77bcf86cd799439011',
  pageId: '507f1f77bcf86cd799439012',
  regionId: '507f1f77bcf86cd799439013',
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
  return new TaskService({} as never, {} as never, {} as never, repo as never)
}

describe('TaskService.listTasks', () => {
  it('applies regionId filter for assistants', async () => {
    const repo = makeRepo()
    const svc = makeService(repo)
    const regionId = '507f1f77bcf86cd799439013'

    await svc.listTasks('assistant-1', RoleName.ASSISTANT, { regionId, limit: 20, offset: 0 })

    expect(repo.listTasks).toHaveBeenCalledWith(expect.objectContaining({ assistantId: 'assistant-1', regionId }), {
      limit: 20,
      offset: 0
    })
    expect(repo.countTasks).toHaveBeenCalledWith(expect.objectContaining({ assistantId: 'assistant-1', regionId }))
  })

  it('applies regionId filter for mangaka-owned page', async () => {
    const repo = makeRepo()
    const svc = makeService(repo)
    const pageId = '507f1f77bcf86cd799439012'
    const regionId = '507f1f77bcf86cd799439013'

    await svc.listTasks('mangaka-1', RoleName.MANGAKA, { pageId, regionId, limit: 20, offset: 0 })

    expect(repo.findPageWithOwner).toHaveBeenCalledWith(pageId)
    expect(repo.listTasks).toHaveBeenCalledWith(expect.objectContaining({ pageId, regionId }), {
      limit: 20,
      offset: 0
    })
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
