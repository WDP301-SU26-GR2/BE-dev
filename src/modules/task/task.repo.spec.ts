import { TaskRepository } from './task.repo'
import { toTaskRes } from './task.mapper'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

describe('TaskRepository response enrichment', () => {
  it('uses one user lookup for a page and enriches embedded TaskVersion submitters', async () => {
    const createdAt = new Date('2026-07-18T00:00:00.000Z')
    const tasks = Array.from({ length: 20 }, (_, index) => ({
      id: `t${index}`,
      pageId: 'p1',
      regionId: null,
      assistantId: 'assistant',
      taskType: 'CLEANER',
      status: 'ASSIGNED',
      statusReason: null,
      priority: 0,
      deadline: null,
      assetIds: [],
      versions: [
        {
          submittedBy: 'submitter',
          versionNumber: 1,
          file: 'file',
          reviewStatus: 'PENDING',
          reviewerNote: null,
          submittedAt: createdAt
        }
      ],
      createdAt
    }))
    const prisma = {
      task: { findMany: jest.fn().mockResolvedValue(tasks) },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'assistant', name: 'Assistant', displayName: null, avatar: null },
          { id: 'submitter', name: 'Submitter', displayName: 'Version owner', avatar: null }
        ])
      },
      series: { findMany: jest.fn() }
    }

    const result = await new TaskRepository(prisma as unknown as PrismaService).listTasks({}, { limit: 20, offset: 0 })
    const response = toTaskRes(result[0])

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.user.findMany.mock.calls[0][0].where.id.in).toEqual(['assistant', 'submitter'])
    expect(response.assistant?.displayName).toBe('Assistant')
    expect(response.versions[0].submitter?.displayName).toBe('Version owner')
  })
})
