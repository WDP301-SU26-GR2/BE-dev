import { StudioRepository } from './studio.repo'
import { toInviteRes } from './studio.mapper'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

describe('StudioRepository response enrichment', () => {
  it('returns both participant names for scoped invite list rows with batched lookups', async () => {
    const row = {
      id: 'i1',
      mangakaId: 'm1',
      assistantId: 'a1',
      seriesId: 's1',
      hireStart: new Date('2026-07-18T00:00:00.000Z'),
      hireEnd: new Date('2026-08-18T00:00:00.000Z'),
      taskTypes: ['CLEANER'],
      status: 'PENDING',
      createdAt: new Date('2026-07-18T00:00:00.000Z')
    }
    const prisma = {
      collaborationInvite: { findMany: jest.fn().mockResolvedValue([row]) },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'm1', name: 'Mangaka', displayName: null, avatar: null },
          { id: 'a1', name: 'Assistant', displayName: 'Assistant display', avatar: null }
        ])
      },
      series: { findMany: jest.fn().mockResolvedValue([{ id: 's1', title: 'Series' }]) }
    }

    const [result] = await new StudioRepository(prisma as unknown as PrismaService).listInvites(
      {},
      { limit: 20, offset: 0 }
    )
    const response = toInviteRes(result)

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.series.findMany).toHaveBeenCalledTimes(1)
    expect(response.mangaka?.displayName).toBe('Mangaka')
    expect(response.assistant?.displayName).toBe('Assistant display')
    expect(response.series?.title).toBe('Series')
  })
})
