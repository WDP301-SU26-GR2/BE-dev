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
})
