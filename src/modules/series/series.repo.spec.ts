import { SeriesStatus } from '@prisma/client'
import { SERIES_METADATA_TERMINAL_STATUSES, SERIES_PROPOSAL_CAS_MAX_ATTEMPTS } from './series.constant'
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

describe('SeriesRepository.createProposalSeries', () => {
  it('links the initial proposal Name without comparing hydrated null to Mongo missing', async () => {
    const createdSeries = {
      id: 's-new',
      mangakaId: 'm1',
      title: 'New series',
      proposal: {
        nameId: null,
        synopsis: 'Synopsis',
        characterDesigns: [],
        estimatedLength: null,
        status: 'DRAFT',
        createdAt: new Date('2026-07-15T00:00:00Z')
      }
    }
    const createdName = { id: 'n-new' }
    const linkedSeries = {
      ...createdSeries,
      proposal: { ...createdSeries.proposal, nameId: createdName.id }
    }
    const prismaService = {
      series: {
        create: jest.fn().mockResolvedValue(createdSeries),
        findUnique: jest.fn().mockResolvedValueOnce(createdSeries).mockResolvedValueOnce(linkedSeries),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      name: { create: jest.fn().mockResolvedValue(createdName) }
    }
    const repo = new SeriesRepository(prismaService as never)

    const result = await repo.createProposalSeries('m1', {
      title: 'New series',
      genres: [],
      synopsis: 'Synopsis',
      characterDesigns: [],
      namePages: []
    })

    expect(result).toEqual({ series: linkedSeries, name: createdName })
    expect(prismaService.series.updateMany).toHaveBeenCalledWith({
      where: { id: 's-new' },
      data: {
        proposal: {
          set: { ...createdSeries.proposal, nameId: 'n-new' }
        }
      }
    })
  })
})

describe('SeriesRepository.updateSeriesMetadata (composite-safe read-modify-write)', () => {
  const current = {
    id: 's1',
    mangakaId: 'm1',
    editorId: 'e1',
    status: SeriesStatus.SERIALIZED,
    title: 'old title',
    coverImage: null,
    genres: [],
    demographic: null,
    publicationType: null,
    proposal: {
      nameId: 'n1',
      synopsis: 'old',
      characterDesigns: ['k1'],
      estimatedLength: 20,
      status: 'PROPOSAL_APPROVED',
      createdAt: new Date('2026-01-01T00:00:00Z')
    }
  }
  const metadataGuard = {
    authorization: { kind: 'OWNER' as const, userId: 'm1' },
    blockedStatuses: SERIES_METADATA_TERMINAL_STATUSES
  }

  function makeMetadataRepo(series: any = current) {
    const prismaService = {
      series: {
        findUnique: jest.fn().mockResolvedValue(series),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      }
    }
    return { repo: new SeriesRepository(prismaService as never), prismaService }
  }

  it('preserves every proposal field when only synopsis changes', async () => {
    const { repo, prismaService } = makeMetadataRepo()

    await repo.updateSeriesMetadata('s1', { synopsis: 'new' }, metadataGuard)

    expect(prismaService.series.updateMany).toHaveBeenCalledWith({
      where: {
        id: 's1',
        mangakaId: 'm1',
        status: { notIn: expect.any(Array) },
        proposal: { equals: current.proposal }
      },
      data: {
        proposal: {
          set: {
            nameId: 'n1',
            synopsis: 'new',
            characterDesigns: ['k1'],
            estimatedLength: 20,
            status: 'PROPOSAL_APPROVED',
            createdAt: current.proposal.createdAt
          }
        }
      }
    })
  })

  it('allows an empty array to clear character designs while preserving the rest of proposal', async () => {
    const { repo, prismaService } = makeMetadataRepo()

    await repo.updateSeriesMetadata('s1', { characterDesigns: [] }, metadataGuard)

    expect(prismaService.series.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          proposal: { set: { ...current.proposal, characterDesigns: [] } }
        }
      })
    )
  })

  it('does not touch proposal when only scalar fields change', async () => {
    const { repo, prismaService } = makeMetadataRepo()

    await repo.updateSeriesMetadata('s1', { title: 'T', coverImage: '' }, metadataGuard)

    expect(prismaService.series.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', mangakaId: 'm1', status: { notIn: expect.any(Array) } },
      data: { title: 'T', coverImage: '' }
    })
  })

  it('ignores composite-only changes when a legacy series has no proposal', async () => {
    const withoutProposal = { ...current, proposal: null }
    const { repo, prismaService } = makeMetadataRepo(withoutProposal)

    await repo.updateSeriesMetadata('s1', { title: 'T', synopsis: 'new' }, metadataGuard)

    expect(prismaService.series.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', mangakaId: 'm1', status: { notIn: expect.any(Array) } },
      data: { title: 'T' }
    })
  })

  it('refetches and merges the latest proposal after a stale CAS loses instead of overwriting concurrent fields', async () => {
    const concurrent = {
      ...current,
      proposal: {
        ...current.proposal,
        characterDesigns: ['concurrent-design'],
        status: 'PROPOSAL_REVISION'
      }
    }
    const prismaService = {
      series: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValueOnce(concurrent)
          .mockResolvedValueOnce(concurrent),
        updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })
      }
    }
    const repo = new SeriesRepository(prismaService as never)

    await repo.updateSeriesMetadata('s1', { synopsis: 'my change' }, metadataGuard)

    expect(prismaService.series.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 's1',
        mangakaId: 'm1',
        status: { notIn: expect.any(Array) },
        proposal: { equals: concurrent.proposal }
      },
      data: {
        proposal: {
          set: {
            ...concurrent.proposal,
            synopsis: 'my change'
          }
        }
      }
    })
  })

  it('does not write after a concurrent terminal transition wins the status guard', async () => {
    const terminal = { ...current, status: SeriesStatus.CANCELLED }
    const prismaService = {
      series: {
        findUnique: jest.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(terminal),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      }
    }
    const repo = new SeriesRepository(prismaService as never)

    const result = await repo.updateSeriesMetadata('s1', { synopsis: 'too late' }, metadataGuard)

    expect(result).toEqual({ outcome: 'GUARD_MISMATCH', series: terminal })
    expect(prismaService.series.updateMany).toHaveBeenCalledTimes(1)
  })

  it('preserves a metadata write when updateProposalStatus loses the inverse interleaving', async () => {
    let stored: any = current
    let firstAttempt = true
    const prismaService = {
      series: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(stored)),
        updateMany: jest.fn().mockImplementation(({ data }) => {
          if (firstAttempt) {
            firstAttempt = false
            stored = { ...stored, proposal: { ...stored.proposal, synopsis: 'concurrent metadata' } }
            return Promise.resolve({ count: 0 })
          }
          stored = { ...stored, proposal: data.proposal.set }
          return Promise.resolve({ count: 1 })
        })
      }
    }
    const repo = new SeriesRepository(prismaService as never)

    const updated = await repo.updateProposalStatus('s1', 'PROPOSAL_REVISION')

    expect(updated.proposal).toMatchObject({ synopsis: 'concurrent metadata', status: 'PROPOSAL_REVISION' })
    expect(prismaService.series.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          proposal: { equals: expect.objectContaining({ synopsis: 'concurrent metadata' }) }
        }),
        data: {
          proposal: { set: expect.objectContaining({ synopsis: 'concurrent metadata', status: 'PROPOSAL_REVISION' }) }
        }
      })
    )
  })

  it('preserves a concurrent status when updateProposalContent retries its full proposal write', async () => {
    const statusChanged = {
      ...current,
      proposal: { ...current.proposal, status: 'PROPOSAL_REVISION' }
    }
    const prismaService = {
      series: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValueOnce(statusChanged)
          .mockResolvedValueOnce({
            ...statusChanged,
            proposal: { ...statusChanged.proposal, synopsis: 'content retry' }
          }),
        updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })
      }
    }
    const repo = new SeriesRepository(prismaService as never)

    const updated = await repo.updateProposalContent('s1', { synopsis: 'content retry' })

    expect(updated.proposal).toMatchObject({ synopsis: 'content retry', status: 'PROPOSAL_REVISION' })
    expect(prismaService.series.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: {
          proposal: { set: expect.objectContaining({ synopsis: 'content retry', status: 'PROPOSAL_REVISION' }) }
        }
      })
    )
  })

  it('returns a typed outcome after bounded CAS retry exhaustion', async () => {
    const prismaService = {
      series: {
        findUnique: jest.fn().mockResolvedValue(current),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      }
    }
    const repo = new SeriesRepository(prismaService as never)

    const result = await repo.updateSeriesMetadata('s1', { synopsis: 'never lands' }, metadataGuard)

    expect(result).toEqual({ outcome: 'RETRY_EXHAUSTED', series: current })
    expect(prismaService.series.updateMany).toHaveBeenCalledTimes(SERIES_PROPOSAL_CAS_MAX_ATTEMPTS)
  })

  it('stops with a guard mismatch when the assigned editor is replaced during CAS', async () => {
    const assigned = { ...current, editorId: 'e1' }
    const reassigned = { ...current, editorId: 'e2' }
    const prismaService = {
      series: {
        findUnique: jest.fn().mockResolvedValueOnce(assigned).mockResolvedValueOnce(reassigned),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      }
    }
    const repo = new SeriesRepository(prismaService as never)

    const result = await repo.updateSeriesMetadata(
      's1',
      { synopsis: 'stale editor edit' },
      {
        authorization: { kind: 'EDITOR', userId: 'e1' },
        blockedStatuses: SERIES_METADATA_TERMINAL_STATUSES
      }
    )

    expect(result).toEqual({ outcome: 'GUARD_MISMATCH', series: reassigned })
    expect(prismaService.series.updateMany).toHaveBeenCalledTimes(1)
    expect(prismaService.series.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ editorId: 'e1' }) })
    )
  })

  it('returns unchanged after a stale refetch already contains the requested value', async () => {
    const concurrent = { ...current, proposal: { ...current.proposal, synopsis: 'desired' } }
    const prismaService = {
      series: {
        findUnique: jest.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(concurrent),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      }
    }
    const repo = new SeriesRepository(prismaService as never)

    const result = await repo.updateSeriesMetadata('s1', { synopsis: 'desired' }, metadataGuard)

    expect(result).toEqual({ outcome: 'UNCHANGED', series: concurrent })
    expect(prismaService.series.updateMany).toHaveBeenCalledTimes(1)
  })
})
