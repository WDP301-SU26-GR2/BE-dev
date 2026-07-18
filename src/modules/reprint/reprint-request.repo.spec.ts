import { ReprintRequestRepo } from './reprint-request.repo'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

describe('ReprintRequestRepo response enrichment', () => {
  it('batches people/series and maps a dangling requester to null', async () => {
    const rows = [
      { id: 'r1', seriesId: 's1', requestedBy: 'u1' },
      { id: 'r2', seriesId: 's1', requestedBy: 'missing' }
    ]
    const prisma = {
      reprintRequest: { findMany: jest.fn().mockResolvedValue(rows) },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'u1', name: 'Fallback', displayName: 'Requester', avatar: null }])
      },
      series: { findMany: jest.fn().mockResolvedValue([{ id: 's1', title: 'Series' }]) }
    }

    const result = await new ReprintRequestRepo(prisma as unknown as PrismaService).findManyScoped({
      userId: 'board',
      roleName: 'BOARD_MEMBER'
    })

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.series.findMany).toHaveBeenCalledTimes(1)
    expect(result[0]).toMatchObject({ requester: { displayName: 'Requester' }, series: { title: 'Series' } })
    expect(result[1].requester).toBeNull()
  })
})
