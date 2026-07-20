import { ChapterRepository } from './chapter.repo'

describe('ChapterRepository.deletePagesCascade', () => {
  it('deletes polymorphic dependants and AI jobs in the same transaction before Page', async () => {
    const tx = {
      task: {
        findMany: jest.fn().mockResolvedValue([{ id: 't1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      region: {
        findMany: jest.fn().mockResolvedValue([{ id: 'r1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      annotation: { deleteMany: jest.fn().mockResolvedValue({ count: 4 }) },
      revisionRequest: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      aiJob: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      page: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) }
    }
    const transaction = jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    const repo = new ChapterRepository({ $transaction: transaction } as any)

    await expect(repo.deletePagesCascade(['p1'])).resolves.toEqual({ deletedTasks: 1, deletedRegions: 1 })

    expect(tx.annotation.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { taskId: { in: ['t1'] } },
          { targetType: 'PAGE', targetId: { in: ['p1'] } },
          { targetType: 'REGION', targetId: { in: ['r1'] } },
          { targetType: 'TASK', targetId: { in: ['t1'] } }
        ]
      }
    })
    expect(tx.revisionRequest.deleteMany).toHaveBeenCalledWith({
      where: { targetType: 'TASK', targetId: { in: ['t1'] } }
    })
    expect(tx.aiJob.deleteMany).toHaveBeenCalledWith({ where: { pageId: { in: ['p1'] } } })
    expect(tx.task.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(tx.page.deleteMany.mock.invocationCallOrder[0])
  })
})
