import { PublicRepository } from './public.repo'

describe('PublicRepository', () => {
  it('escapes regex metacharacters so public search remains a literal Mongo substring search', async () => {
    const prisma = {
      series: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0)
      }
    }
    const repo = new PublicRepository(prisma as never)

    await repo.findPublicSeries({ q: '[a-b].*', limit: 20, offset: 0 })

    const expectedWhere = {
      status: { in: expect.any(Array) },
      title: { contains: '\\[a-b\\]\\.\\*', mode: 'insensitive' }
    }
    expect(prisma.series.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }))
    expect(prisma.series.count).toHaveBeenCalledWith({ where: expectedWhere })
  })

  it('narrows to a single status when provided (tab "đang phát hành" vs "đã hoàn thành")', async () => {
    const prisma = {
      series: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0)
      }
    }
    const repo = new PublicRepository(prisma as never)

    await repo.findPublicSeries({ status: 'SERIALIZED', limit: 20, offset: 0 } as never)

    expect(prisma.series.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'SERIALIZED' }) })
    )
  })

  it('falls back to the whole public set when no status is provided', async () => {
    const prisma = {
      series: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0)
      }
    }
    const repo = new PublicRepository(prisma as never)

    await repo.findPublicSeries({ limit: 20, offset: 0 })

    expect(prisma.series.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { in: expect.any(Array) } }) })
    )
  })

  it('batch-loads only active authors and exposes their display names without private user fields', async () => {
    const series = { id: 's1', mangakaId: 'm1' }
    const prisma = {
      series: {
        findMany: jest.fn().mockResolvedValue([series]),
        count: jest.fn().mockResolvedValue(1)
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'm1', displayName: 'Akira Test' }])
      }
    }
    const repo = new PublicRepository(prisma as never)

    await expect(repo.findPublicSeries({ limit: 20, offset: 0 })).resolves.toEqual({
      items: [{ ...series, author: { displayName: 'Akira Test' } }],
      total: 1
    })
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['m1'] }, status: 'ACTIVE', deletedAt: { isSet: false } },
      select: { id: true, displayName: true }
    })
  })
})
