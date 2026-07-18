import { DeadlineRepository } from './deadline.repo'
import { toDeadlineRequestRes } from './deadline.mapper'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

describe('DeadlineRepository response enrichment', () => {
  it('batches chapter/series context and never treats requestedBy PHE as a user id', async () => {
    const row = {
      id: 'd1',
      scheduleId: 'sc1',
      chapterId: 'c1',
      seriesId: 's1',
      requestedBy: 'MANGAKA',
      lastProposedBy: 'EDITOR',
      currentDeadline: null,
      requestedDeadline: new Date('2026-08-01T00:00:00.000Z'),
      reason: 'reason',
      affectsSlot: false,
      status: 'PROPOSED',
      boardReviewedBy: null,
      resolvedAt: null,
      createdAt: new Date('2026-07-18T00:00:00.000Z'),
      statusHistory: []
    }
    const prisma = {
      deadlineRequest: { findMany: jest.fn().mockResolvedValue([row]) },
      chapter: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', chapterNumber: 7, title: 'Chapter' }]) },
      series: { findMany: jest.fn().mockResolvedValue([{ id: 's1', title: 'Series' }]) }
    }

    const [result] = await new DeadlineRepository(prisma as unknown as PrismaService).listByChapter('c1')
    const response = toDeadlineRequestRes(result)

    expect(response.requestedBy).toBe('MANGAKA')
    expect(response.chapter).toEqual({ id: 'c1', chapterNumber: 7, title: 'Chapter' })
    expect(response.series).toEqual({ id: 's1', title: 'Series' })
    expect((prisma as any).user).toBeUndefined()
  })
})
