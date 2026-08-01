import { ProposalStatus } from '@prisma/client'
import { SeriesProposalRepository } from './series-proposal.repository'

// LƯU Ý: constructor CHỈ nhận `prismaService`. `cas` được new bên trong
// (`series-proposal.repository.ts:11-13`) — KHÔNG inject được, đừng truyền tham số thứ hai.
const makePrisma = () => {
  const seriesState: { value: Record<string, unknown> | null } = { value: null }

  return {
    series: {
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        const proposal = args.data.proposal as Record<string, unknown>
        const created = {
          id: 's1',
          mangakaId: args.data.mangakaId,
          title: args.data.title,
          proposal: proposal
            ? {
                ...proposal,
                status: (proposal.status as ProposalStatus) ?? ProposalStatus.DRAFT,
                createdAt: new Date('2026-01-01')
              }
            : null
        }
        seriesState.value = created
        return Promise.resolve(created)
      }),
      findUnique: jest.fn(() => Promise.resolve(seriesState.value)),
      updateMany: jest.fn((args: { data: Record<string, unknown> }) => {
        const proposalSet = (args.data.proposal as { set?: Record<string, unknown> } | undefined)?.set
        if (seriesState.value && proposalSet) {
          ;(seriesState.value as { proposal: Record<string, unknown> | null }).proposal = proposalSet
        }
        return Promise.resolve({ count: 1 })
      }),
      delete: jest.fn().mockResolvedValue(undefined)
    },
    storyboard: { create: jest.fn(), deleteMany: jest.fn() },
    $transaction: jest.fn()
  }
}

describe('SeriesProposalRepository.createProposalSeries (Spec 28)', () => {
  it('does not create a chapter storyboard row for a composite proposal', async () => {
    const prisma = makePrisma()
    const repo = new SeriesProposalRepository(prisma as never)
    await repo.createProposalSeries('m1', {
      title: 'S',
      genres: [],
      characterDesigns: [],
      storyboardPages: [{ pageNumber: 1, fileUrl: 'k1' }]
    })
    expect(prisma.storyboard.create).not.toHaveBeenCalled()
  })

  it('ghi storyboardPages thẳng vào composite proposal lúc create', async () => {
    const prisma = makePrisma()
    const repo = new SeriesProposalRepository(prisma as never)
    await repo.createProposalSeries('m1', {
      title: 'S',
      genres: [],
      characterDesigns: ['cd1'],
      storyboardPages: [{ pageNumber: 1, fileUrl: 'k1' }]
    })
    const arg = prisma.series.create.mock.calls[0][0] as {
      data: { proposal: { storyboardPages: unknown; characterDesigns: unknown } }
    }
    expect(arg.data.proposal.storyboardPages).toEqual([{ pageNumber: 1, fileUrl: 'k1' }])
    expect(arg.data.proposal.characterDesigns).toEqual(['cd1'])
  })

  it('returns the Series directly instead of a wrapper object', async () => {
    const prisma = makePrisma()
    const repo = new SeriesProposalRepository(prisma as never)
    const res = await repo.createProposalSeries('m1', {
      title: 'S',
      genres: [],
      characterDesigns: [],
      storyboardPages: []
    })
    expect(res).toHaveProperty('id', 's1')
    expect(res).toHaveProperty('proposal')
    expect(res).not.toHaveProperty('series')
  })
})

describe('SeriesProposalRepository.deleteProposalSeries (Spec 28)', () => {
  it('deletes only the DRAFT series row without a chapter-storyboard cascade transaction', async () => {
    const prisma = makePrisma()
    const repo = new SeriesProposalRepository(prisma as never)

    await repo.deleteProposalSeries('s1')

    expect(prisma.series.delete).toHaveBeenCalledWith({ where: { id: 's1' } })
    expect(prisma.storyboard.deleteMany).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('SeriesProposalRepository.updateProposalContent — composite read-modify-write (Spec 28)', () => {
  const currentProposal = {
    synopsis: 'nội dung cũ',
    characterDesigns: ['cd1', 'cd2'],
    storyboardPages: [{ pageNumber: 1, fileUrl: 'old.png' }],
    estimatedLength: 12,
    status: 'PROPOSAL_REVISION',
    createdAt: new Date('2026-01-01')
  }

  type RunUpdateResult =
    | { outcome: 'NO_WRITE' }
    | {
        outcome: 'WRITE'
        proposalSet: {
          storyboardPages: { pageNumber: number; fileUrl: string }[]
          synopsis: string | null
          characterDesigns: string[]
          estimatedLength: number | null
          status: string
        }
      }

  type RunUpdate = (
    currentProposalInput: Record<string, unknown>,
    body: Record<string, unknown>
  ) => Promise<RunUpdateResult>

  const makeRunUpdate = (): RunUpdate => {
    const state: { value: Record<string, unknown> | null } = { value: null }
    const prisma = {
      series: {
        findUnique: jest.fn(() => Promise.resolve(state.value)),
        updateMany: jest.fn((args: { data: Record<string, unknown> }) => {
          const proposalSet = (args.data.proposal as { set?: Record<string, unknown> } | undefined)?.set
          if (state.value && proposalSet) {
            ;(state.value as { proposal: Record<string, unknown> }).proposal = proposalSet
          }
          return { count: 1 }
        })
      }
    }
    const repo = new SeriesProposalRepository(prisma as never)

    return async (currentProposalInput, body) => {
      prisma.series.updateMany.mockClear()
      state.value = {
        id: 's1',
        title: 'T',
        genres: [],
        proposal: currentProposalInput
      }
      await repo.updateProposalContent('s1', body)
      if (!prisma.series.updateMany.mock.calls.length) return { outcome: 'NO_WRITE' }
      const written = prisma.series.updateMany.mock.calls[prisma.series.updateMany.mock.calls.length - 1][0]
      const proposalSet = (written.data.proposal as { set: Record<string, unknown> }).set
      return {
        outcome: 'WRITE',
        proposalSet: {
          storyboardPages: (proposalSet.storyboardPages as { pageNumber: number; fileUrl: string }[]) ?? [],
          synopsis: (proposalSet.synopsis as string | null) ?? null,
          characterDesigns: (proposalSet.characterDesigns as string[]) ?? [],
          estimatedLength: (proposalSet.estimatedLength as number | null) ?? null,
          status: (proposalSet.status as string) ?? ''
        }
      }
    }
  }

  it('silent no-op khi storyboardPages giống hệt dữ liệu hiện tại', async () => {
    const prisma = makePrisma()
    const repo = new SeriesProposalRepository(prisma as never)
    const storyboardPages = [{ pageNumber: 1, fileUrl: 'old.png' }]
    await repo.createProposalSeries('m1', {
      title: 'T',
      genres: [],
      characterDesigns: ['cd1', 'cd2'],
      storyboardPages
    })
    prisma.series.updateMany.mockClear()

    await repo.updateProposalContent('s1', { storyboardPages })

    expect(prisma.series.updateMany).not.toHaveBeenCalled()
  })

  it.each([undefined, null])('legacy storyboardPages=%p được normalize thành [] khi incoming []', async (persisted) => {
    const run = makeRunUpdate()
    const written = await run({ ...currentProposal, storyboardPages: persisted }, { storyboardPages: [] })

    expect(written).toEqual({ outcome: 'NO_WRITE' })
  })

  it.each([undefined, null])('legacy storyboardPages=%p vẫn ghi khi incoming có trang', async (persisted) => {
    const run = makeRunUpdate()
    const written = await run(
      { ...currentProposal, storyboardPages: persisted },
      { storyboardPages: [{ pageNumber: 1, fileUrl: 'new.png' }] }
    )

    expect(written).toMatchObject({
      outcome: 'WRITE',
      proposalSet: { storyboardPages: [{ pageNumber: 1, fileUrl: 'new.png' }] }
    })
  })

  it('coi thứ tự storyboardPages là có ý nghĩa', async () => {
    const run = makeRunUpdate()
    const first = { pageNumber: 1, fileUrl: 'first.png' }
    const second = { pageNumber: 2, fileUrl: 'second.png' }

    const written = await run(
      { ...currentProposal, storyboardPages: [first, second] },
      { storyboardPages: [second, first] }
    )

    expect(written).toMatchObject({ outcome: 'WRITE', proposalSet: { storyboardPages: [second, first] } })
  })

  it('giữ nguyên duplicate multiplicity khi so sánh storyboardPages', async () => {
    const run = makeRunUpdate()
    const duplicate = { pageNumber: 1, fileUrl: 'same.png' }
    const different = { pageNumber: 2, fileUrl: 'different.png' }

    const changed = await run(
      { ...currentProposal, storyboardPages: [duplicate, duplicate] },
      { storyboardPages: [duplicate, different] }
    )
    expect(changed).toMatchObject({
      outcome: 'WRITE',
      proposalSet: { storyboardPages: [duplicate, different] }
    })

    const unchanged = await run(
      { ...currentProposal, storyboardPages: [duplicate, duplicate] },
      { storyboardPages: [duplicate, duplicate] }
    )
    expect(unchanged).toEqual({ outcome: 'NO_WRITE' })
  })

  it('ghi chính xác full proposal.set khi chỉ storyboardPages thay đổi', async () => {
    const prisma = makePrisma()
    const repo = new SeriesProposalRepository(prisma as never)
    await repo.createProposalSeries('m1', {
      title: 'T',
      genres: [],
      synopsis: 'nội dung cũ',
      characterDesigns: ['cd1', 'cd2'],
      estimatedLength: 12,
      storyboardPages: [{ pageNumber: 1, fileUrl: 'old.png' }]
    })
    prisma.series.updateMany.mockClear()

    await repo.updateProposalContent('s1', {
      storyboardPages: [{ pageNumber: 2, fileUrl: 'new.png' }]
    })

    const data = prisma.series.updateMany.mock.calls[0][0].data as {
      proposal: { set: Record<string, unknown> }
    }
    expect(data.proposal.set).toEqual({
      synopsis: 'nội dung cũ',
      characterDesigns: ['cd1', 'cd2'],
      storyboardPages: [{ pageNumber: 2, fileUrl: 'new.png' }],
      estimatedLength: 12,
      status: ProposalStatus.DRAFT,
      createdAt: new Date('2026-01-01')
    })
  })

  it('refetch và retry storyboardPages khi CAS conflict', async () => {
    const initial = {
      id: 's1',
      title: 'T',
      genres: [],
      proposal: currentProposal
    }
    const concurrent = {
      ...initial,
      proposal: {
        ...currentProposal,
        synopsis: 'concurrent synopsis',
        storyboardPages: [{ pageNumber: 2, fileUrl: 'concurrent.png' }]
      }
    }
    const requestedPages = [{ pageNumber: 3, fileUrl: 'requested.png' }]
    const final = {
      ...concurrent,
      proposal: { ...concurrent.proposal, storyboardPages: requestedPages }
    }
    const prisma = {
      series: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(initial)
          .mockResolvedValueOnce(concurrent)
          .mockResolvedValueOnce(final),
        updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })
      }
    }
    const repo = new SeriesProposalRepository(prisma as never)

    const result = await repo.updateProposalContent('s1', { storyboardPages: requestedPages })

    expect(prisma.series.updateMany).toHaveBeenCalledTimes(2)
    expect(prisma.series.updateMany.mock.calls[1][0]).toMatchObject({
      where: { proposal: { equals: concurrent.proposal } },
      data: {
        proposal: {
          set: {
            synopsis: 'concurrent synopsis',
            storyboardPages: requestedPages
          }
        }
      }
    })
    expect(result).toBe(final)
  })

  it('ghi storyboardPages KHÔNG được xoá synopsis / characterDesigns / estimatedLength', async () => {
    const run = makeRunUpdate()
    const written = await run(currentProposal, { storyboardPages: [{ pageNumber: 1, fileUrl: 'new.png' }] })
    expect(written).toEqual({
      outcome: 'WRITE',
      proposalSet: {
        storyboardPages: [{ pageNumber: 1, fileUrl: 'new.png' }],
        synopsis: 'nội dung cũ',
        characterDesigns: ['cd1', 'cd2'],
        estimatedLength: 12,
        status: 'PROPOSAL_REVISION'
      }
    })
  })

  it('omit storyboardPages = giữ nguyên trang cũ', async () => {
    const run = makeRunUpdate()
    const written = await run(currentProposal, { synopsis: 'mới' })
    expect(written).toMatchObject({
      outcome: 'WRITE',
      proposalSet: { storyboardPages: [{ pageNumber: 1, fileUrl: 'old.png' }], synopsis: 'mới' }
    })
  })

  it('null storyboardPages = KHÔNG ghi (UNCHANGED) và giữ nguyên dữ liệu (nullish semantics)', async () => {
    const run = makeRunUpdate()
    const stateBefore = JSON.parse(JSON.stringify(currentProposal))
    const written = await run(currentProposal, { storyboardPages: null })
    expect(written).toEqual({ outcome: 'NO_WRITE' })
    // đọc state sau = không đổi
    expect(JSON.parse(JSON.stringify(currentProposal))).toEqual(stateBefore)
  })

  it('[] storyboardPages = clear', async () => {
    const run = makeRunUpdate()
    const written = await run(currentProposal, { storyboardPages: [] })
    expect(written).toMatchObject({ outcome: 'WRITE', proposalSet: { storyboardPages: [] } })
  })

  it('gửi CHỈ storyboardPages vẫn phải ghi (không được trả UNCHANGED)', async () => {
    const run = makeRunUpdate()
    const written = await run(currentProposal, { storyboardPages: [{ pageNumber: 9, fileUrl: 'x.png' }] })
    expect(written).toMatchObject({
      outcome: 'WRITE',
      proposalSet: { storyboardPages: [{ pageNumber: 9, fileUrl: 'x.png' }] }
    })
  })
})
