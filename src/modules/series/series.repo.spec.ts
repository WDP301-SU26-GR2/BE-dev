import { SeriesStatus } from '@prisma/client'
import { SeriesRepository } from './series.repo'

function makeRepo() {
  const prismaService = {
    series: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0)
    }
  }
  const repo = new SeriesRepository(prismaService as never)
  return { repo, prismaService }
}

describe('SeriesRepository list visibility', () => {
  it('excludes draft and withdrawn series for all scope', async () => {
    const { repo, prismaService } = makeRepo()

    await repo.findSeriesForList({ scope: { kind: 'all' }, status: undefined }, { limit: 20, offset: 0 })

    expect(prismaService.series.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { notIn: [SeriesStatus.DRAFT, SeriesStatus.WITHDRAWN] } }
      })
    )
  })

  it('preserves explicit status filter for all scope by merging with AND', async () => {
    const { repo, prismaService } = makeRepo()

    await repo.findSeriesForList({ scope: { kind: 'all' }, status: SeriesStatus.IN_REVIEW }, { limit: 20, offset: 0 })

    expect(prismaService.series.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [{ status: SeriesStatus.IN_REVIEW }, { status: { notIn: [SeriesStatus.DRAFT, SeriesStatus.WITHDRAWN] } }]
        }
      })
    )
  })
})
