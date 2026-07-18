import { ContractRepo } from './contract.repo'
import { ContractAmendmentRepo } from './contract-amendment.repo'
import { ContractResSchema } from './schemas/contract-schema'

describe('contract response enrichment', () => {
  it('maps included relations to the shared mini shapes', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'c1',
      versions: [],
      series: { id: 's1', title: 'Series' },
      mangaka: { id: 'm1', name: 'Fallback', displayName: null, avatar: null },
      editor: { id: 'e1', name: 'Editor', displayName: 'Editor Display', avatar: 'editor.png' }
    })
    const repo = new ContractRepo({ contract: { findUnique } } as any)

    const result = await repo.findById('c1')

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'c1' },
      include: {
        versions: true,
        series: { select: { id: true, title: true } },
        mangaka: { select: { id: true, name: true, displayName: true, avatar: true } },
        editor: { select: { id: true, name: true, displayName: true, avatar: true } }
      }
    })
    expect(result).toMatchObject({
      series: { id: 's1', title: 'Series' },
      mangaka: { id: 'm1', displayName: 'Fallback', avatar: null },
      editor: { id: 'e1', displayName: 'Editor Display', avatar: 'editor.png' }
    })
    expect(result).not.toHaveProperty('mangaka.name')
  })

  it('keeps enrichment optional so a mutation response still serializes without it', () => {
    const result = ContractResSchema.safeParse({
      id: 'c1',
      seriesId: 's1',
      mangakaId: 'm1',
      editorId: null,
      boardDecisionId: null,
      contractType: 'FULL_BUYOUT',
      valuationAmount: null,
      publisherOwnershipPct: null,
      mangakaOwnershipPct: null,
      terminationClause: null,
      contractStart: null,
      contractEnd: null,
      status: 'DRAFT',
      mangakaSignedAt: null,
      boardSignedAt: null,
      createdAt: new Date()
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).not.toHaveProperty('series')
      expect(result.data).not.toHaveProperty('mangaka')
      expect(result.data).not.toHaveProperty('editor')
    }
  })

  it('batch-attaches amendment creators and returns null for a dangling user id', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'a1', createdBy: 'u1' },
      { id: 'a2', createdBy: 'missing' }
    ])
    const userFindMany = jest.fn().mockResolvedValue([{ id: 'u1', name: 'Creator', displayName: null, avatar: null }])
    const repo = new ContractAmendmentRepo({
      contractAmendment: { findMany },
      user: { findMany: userFindMany },
      series: { findMany: jest.fn() }
    } as any)

    const results = await repo.findManyByContract('c1')

    expect(userFindMany).toHaveBeenCalledTimes(1)
    expect(userFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['u1', 'missing'] } },
      select: { id: true, name: true, displayName: true, avatar: true }
    })
    expect(results[0].creator).toEqual({ id: 'u1', displayName: 'Creator', avatar: null })
    expect(results[1].creator).toBeNull()
  })
})
