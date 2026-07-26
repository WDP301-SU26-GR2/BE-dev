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

  const makePrisma = () => ({
    reprintRequest: {
      create: jest.fn().mockResolvedValue({ id: 'request-1' }),
      update: jest.fn().mockResolvedValue({ id: 'request-1' }),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([])
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null)
    },
    series: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([])
    },
    contract: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([])
    },
    chapter: { findMany: jest.fn().mockResolvedValue([]) }
  })

  it('delegates create and update with an exact persistence payload', async () => {
    const prisma = makePrisma()
    const repo = new ReprintRequestRepo(prisma as unknown as PrismaService)
    const createData = {
      seriesId: 's1',
      requestedBy: 'u1',
      revisionMode: 'AS_IS',
      reason: 'r',
      chapterRangeStart: 1,
      chapterRangeEnd: 2
    }
    const updateData = { status: 'BOARD_APPROVED' }

    await repo.create(createData as never)
    await repo.update('request-1', updateData as never)

    expect(prisma.reprintRequest.create).toHaveBeenCalledWith({ data: createData })
    expect(prisma.reprintRequest.update).toHaveBeenCalledWith({ where: { id: 'request-1' }, data: updateData })
  })

  it('returns null without enrichment when findById misses', async () => {
    const prisma = makePrisma()
    const repo = new ReprintRequestRepo(prisma as unknown as PrismaService)

    await expect(repo.findById('missing')).resolves.toBeNull()
    expect(prisma.user.findMany).not.toHaveBeenCalled()
    expect(prisma.series.findMany).not.toHaveBeenCalled()
  })

  it('enriches findById and handles nullable foreign keys', async () => {
    const prisma = makePrisma()
    prisma.reprintRequest.findUnique.mockResolvedValue({ id: 'r1', seriesId: null, requestedBy: null })
    const repo = new ReprintRequestRepo(prisma as unknown as PrismaService)

    await expect(repo.findById('r1')).resolves.toMatchObject({ id: 'r1', series: null, requester: null })
  })

  it('combines unique series and contract Mangaka owners with the assigned editor', async () => {
    const prisma = makePrisma()
    prisma.series.findUnique.mockResolvedValue({ editorId: 'editor-1', mangakaId: 'owner-1' })
    prisma.contract.findFirst.mockResolvedValue({ mangakaId: 'owner-1' })
    const repo = new ReprintRequestRepo(prisma as unknown as PrismaService)

    await expect(repo.findAccessContext('s1')).resolves.toEqual({
      editorId: 'editor-1',
      ownerMangakaIds: ['owner-1']
    })
  })

  it('falls back to null editor and contract owner when the series is absent', async () => {
    const prisma = makePrisma()
    prisma.contract.findFirst.mockResolvedValue({ mangakaId: 'contract-owner' })
    const repo = new ReprintRequestRepo(prisma as unknown as PrismaService)

    await expect(repo.findAccessContext('s1')).resolves.toEqual({
      editorId: null,
      ownerMangakaIds: ['contract-owner']
    })
  })

  it('returns an empty editor scope without querying reprint requests', async () => {
    const prisma = makePrisma()
    const repo = new ReprintRequestRepo(prisma as unknown as PrismaService)

    await expect(repo.findManyScoped({ userId: 'editor-1', roleName: 'EDITOR' })).resolves.toEqual([])
    expect(prisma.reprintRequest.findMany).not.toHaveBeenCalled()
  })

  it('scopes an editor to their assigned series and keeps requested status', async () => {
    const prisma = makePrisma()
    prisma.series.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }])
    const repo = new ReprintRequestRepo(prisma as unknown as PrismaService)

    await repo.findManyScoped({ userId: 'editor-1', roleName: 'EDITOR', status: 'PENDING' })

    expect(prisma.reprintRequest.findMany).toHaveBeenCalledWith({
      where: { status: 'PENDING', seriesId: { in: ['s1', 's2'] } },
      orderBy: { createdAt: 'desc' }
    })
  })

  it.each([
    ['owned series filter', 's1', 's1'],
    ['unowned series filter', 'outside', { in: ['s1'] }]
  ])('handles editor %s defensively', async (_label, seriesId, expectedSeriesScope) => {
    const prisma = makePrisma()
    prisma.series.findMany.mockResolvedValue([{ id: 's1' }])
    const repo = new ReprintRequestRepo(prisma as unknown as PrismaService)

    await repo.findManyScoped({ userId: 'editor-1', roleName: 'EDITOR', seriesId })

    expect(prisma.reprintRequest.findMany).toHaveBeenCalledWith({
      where: { seriesId: expectedSeriesScope },
      orderBy: { createdAt: 'desc' }
    })
  })

  it('lets a Mangaka see owned-series requests plus chapters assigned for revision', async () => {
    const prisma = makePrisma()
    prisma.series.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }])
    const repo = new ReprintRequestRepo(prisma as unknown as PrismaService)

    await repo.findManyScoped({ userId: 'm1', roleName: 'MANGAKA' })

    expect(prisma.reprintRequest.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ seriesId: { in: ['s1', 's2'] } }, { chapters: { some: { reviserId: 'm1' } } }]
      },
      orderBy: { createdAt: 'desc' }
    })
  })

  it.each([
    ['owned explicit series', [{ id: 's1' }], 's1', [{ seriesId: 's1' }]],
    ['unowned explicit series', [{ id: 's1' }], 'outside', []],
    ['no owned series', [], undefined, []]
  ])('builds Mangaka scope for %s', async (_label, owned, seriesId, ownershipTerms) => {
    const prisma = makePrisma()
    prisma.series.findMany.mockResolvedValue(owned)
    const repo = new ReprintRequestRepo(prisma as unknown as PrismaService)

    await repo.findManyScoped({ userId: 'm1', roleName: 'MANGAKA', seriesId })

    expect(prisma.reprintRequest.findMany).toHaveBeenCalledWith({
      where: {
        ...(seriesId ? { seriesId } : {}),
        OR: [...ownershipTerms, { chapters: { some: { reviserId: 'm1' } } }]
      },
      orderBy: { createdAt: 'desc' }
    })
  })

  it('queries the active contract, published chapter range, and user role with exact constraints', async () => {
    const prisma = makePrisma()
    const repo = new ReprintRequestRepo(prisma as unknown as PrismaService)

    await repo.findActiveContractBySeriesId('s1')
    await repo.findOriginalChaptersByRange('s1', 2, 5)
    await repo.findUserRole('u1')

    expect(prisma.contract.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { seriesId: 's1', status: 'FULLY_EXECUTED' } })
    )
    expect(prisma.chapter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { seriesId: 's1', chapterNumber: { gte: 2, lte: 5 }, status: 'PUBLISHED' }
      })
    )
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' }, include: { role: true } })
  })
})
