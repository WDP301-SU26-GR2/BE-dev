import { ContractRepo } from './contract.repo'
import { ContractAmendmentRepo } from './contract-amendment.repo'
import { ContractResSchema } from './schemas/contract-schema'

describe('contract response enrichment', () => {
  it('loads the minimal creation context and detects a blocking contract by series or decision', async () => {
    const seriesFindUnique = jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'm1', status: 'SERIALIZED' })
    const boardDecisionFindUnique = jest.fn().mockResolvedValue({
      id: 'd1',
      targetSeriesId: 's1',
      decisionType: 'SERIALIZATION',
      result: 'APPROVED'
    })
    const contractFindFirst = jest.fn().mockResolvedValue({ id: 'c1' })
    const repo = new ContractRepo({
      series: { findUnique: seriesFindUnique },
      boardDecision: { findUnique: boardDecisionFindUnique },
      contract: { findFirst: contractFindFirst }
    } as any)

    await expect(repo.findSeriesForContractCreation('s1')).resolves.toEqual({
      id: 's1',
      mangakaId: 'm1',
      status: 'SERIALIZED'
    })
    await expect(repo.findBoardDecisionForContractCreation('d1')).resolves.toMatchObject({
      id: 'd1',
      targetSeriesId: 's1'
    })
    await expect(repo.findBlockingContractForCreation('s1', 'd1', ['DRAFT'] as any)).resolves.toEqual({ id: 'c1' })

    expect(seriesFindUnique).toHaveBeenCalledWith({
      where: { id: 's1' },
      select: { id: true, mangakaId: true, status: true }
    })
    expect(boardDecisionFindUnique).toHaveBeenCalledWith({
      where: { id: 'd1' },
      select: { id: true, targetSeriesId: true, decisionType: true, result: true }
    })
    expect(contractFindFirst).toHaveBeenCalledWith({
      where: {
        status: { in: ['DRAFT'] },
        OR: [{ seriesId: 's1' }, { boardDecisionId: 'd1' }]
      },
      select: { id: true }
    })
  })

  it('maps included relations to the shared mini shapes', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'c1',
      versions: [],
      series: { id: 's1', title: 'Series' },
      boardDecision: {
        id: 'd1',
        decisionType: 'SERIALIZATION',
        result: 'APPROVED',
        decidedAt: new Date('2026-07-20T10:00:00.000Z'),
        boardSession: { id: 'bs1', title: 'July Editorial Meeting', startTime: new Date('2026-07-20T09:00:00.000Z') }
      },
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
        boardDecision: {
          select: {
            id: true,
            decisionType: true,
            result: true,
            decidedAt: true,
            boardSession: { select: { id: true, title: true, startTime: true } }
          }
        },
        mangaka: { select: { id: true, name: true, displayName: true, avatar: true } },
        editor: { select: { id: true, name: true, displayName: true, avatar: true } }
      }
    })
    expect(result).toMatchObject({
      series: { id: 's1', title: 'Series' },
      boardDecision: {
        id: 'd1',
        decisionType: 'SERIALIZATION',
        result: 'APPROVED',
        boardSession: { id: 'bs1', title: 'July Editorial Meeting' }
      },
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

  it('serializes Decision and its Board Session context on GET Contract', () => {
    const result = ContractResSchema.safeParse({
      id: 'c1',
      seriesId: 's1',
      mangakaId: 'm1',
      editorId: 'e1',
      boardDecisionId: 'd1',
      boardDecision: {
        id: 'd1',
        decisionType: 'SERIALIZATION',
        result: 'APPROVED',
        decidedAt: new Date('2026-07-20T10:00:00.000Z'),
        boardSession: {
          id: 'bs1',
          title: 'July Editorial Meeting',
          startTime: new Date('2026-07-20T09:00:00.000Z')
        }
      },
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

describe('ContractRepo signing serialization (S-02)', () => {
  it('writes the shared Contract fence before inserting/counting a Board signature', async () => {
    const contractUpdate = jest.fn().mockResolvedValue({ id: 'c1' })
    const signatureCreate = jest.fn().mockResolvedValue({ id: 'sig1' })
    const signatureCount = jest.fn().mockResolvedValue(3)
    const contractUpdateMany = jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 })
    const contractFindUnique = jest.fn().mockResolvedValue({ id: 'c1', status: 'FULLY_EXECUTED' })
    const tx = {
      contract: { update: contractUpdate, updateMany: contractUpdateMany, findUnique: contractFindUnique },
      contractSignature: { create: signatureCreate, count: signatureCount }
    }
    const transaction = jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    const repo = new ContractRepo({ $transaction: transaction } as any)

    const result = await repo.recordBoardSignatureAndSettle('c1', 'u3', 3)

    expect(contractUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { signingFence: expect.any(String) }
    })
    expect(contractUpdate.mock.invocationCallOrder[0]).toBeLessThan(signatureCreate.mock.invocationCallOrder[0])
    expect(signatureCreate.mock.invocationCallOrder[0]).toBeLessThan(signatureCount.mock.invocationCallOrder[0])
    expect(result).toMatchObject({ signatureCount: 3, boardCompletedNow: true, executedNow: true })
  })

  it('retries the whole signing transaction after a Mongo write conflict', async () => {
    const tx = {
      contract: {
        update: jest.fn().mockResolvedValue({ id: 'c1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue({ id: 'c1' })
      },
      contractSignature: {
        create: jest.fn().mockResolvedValue({ id: 'sig1' }),
        count: jest.fn().mockResolvedValue(1)
      }
    }
    const transaction = jest
      .fn()
      .mockRejectedValueOnce({ code: 'P2034', message: 'WriteConflict' })
      .mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx))
    const repo = new ContractRepo({ $transaction: transaction } as any)

    await expect(repo.recordBoardSignatureAndSettle('c1', 'u1', 3)).resolves.toMatchObject({ signatureCount: 1 })
    expect(transaction).toHaveBeenCalledTimes(2)
  })
})

describe('ContractAmendmentRepo version retry (S-05)', () => {
  it('retries execute-and-apply from a fresh transaction after a version conflict', async () => {
    const tx = {
      contractAmendment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ valuationAmount: 200 })
      },
      contractVersion: {
        findFirst: jest.fn().mockResolvedValue({ versionNumber: 4 }),
        create: jest.fn().mockResolvedValue({ id: 'v5' })
      },
      contract: { update: jest.fn().mockResolvedValue({ valuationAmount: 200 }) }
    }
    const transaction = jest
      .fn()
      .mockRejectedValueOnce({ code: 'P2034', message: 'WriteConflict' })
      .mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx))
    const repo = new ContractAmendmentRepo({ $transaction: transaction } as any)

    await expect(repo.executeAndApply('a1', 'c1', 'u1')).resolves.toEqual({ applied: true })
    expect(transaction).toHaveBeenCalledTimes(2)
    expect(tx.contractVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ contractId: 'c1', versionNumber: 5, editedById: 'u1' })
    })
  })
})
