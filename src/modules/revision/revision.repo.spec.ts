import { RevisionRepository } from './revision.repo'
import { toRevisionRequestRes } from './revision.mapper'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

describe('RevisionRepository response enrichment', () => {
  it('batches requester, recipient and series for list responses', async () => {
    const row = {
      id: 'r1',
      targetType: 'TASK',
      targetId: 't1',
      seriesId: 's1',
      round: 1,
      reason: 'Fix',
      requestedBy: 'u1',
      recipientId: 'u2',
      isResolved: false,
      resolvedAt: null,
      resolvedBy: null,
      createdAt: new Date('2026-07-18T00:00:00.000Z')
    }
    const prisma = {
      revisionRequest: { findMany: jest.fn().mockResolvedValue([row]) },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'u1', name: 'Requester', displayName: null, avatar: null },
          { id: 'u2', name: 'Recipient', displayName: null, avatar: null }
        ])
      },
      series: { findMany: jest.fn().mockResolvedValue([{ id: 's1', title: 'Series' }]) }
    }

    const [result] = await new RevisionRepository(prisma as unknown as PrismaService).findMany(
      {},
      { limit: 20, offset: 0 }
    )
    const response = toRevisionRequestRes(result)

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.series.findMany).toHaveBeenCalledTimes(1)
    expect(response.requester?.displayName).toBe('Requester')
    expect(response.recipient?.displayName).toBe('Recipient')
    expect(response.series?.title).toBe('Series')
  })
})
