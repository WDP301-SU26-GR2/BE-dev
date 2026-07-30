import { ContractStatus } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { ContractRepo } from './contract.repo'
import { ContractAmendmentRepo } from './contract-amendment.repo'

const user = (id: string, displayName: string | null = null) => ({
  id,
  name: `name-${id}`,
  displayName,
  avatar: null
})

describe('ContractRepo workflow persistence', () => {
  it.each([
    ['EDITOR', { editorId: 'viewer' }],
    ['MANGAKA', { mangakaId: 'viewer' }],
    ['BOARD_MEMBER', {}]
  ])('scopes list access for %s', async (roleName, where) => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'c1',
        series: { id: 's1', title: 'Series' },
        mangaka: user('m1'),
        editor: null
      }
    ])
    const repo = new ContractRepo({ contract: { findMany } } as never)

    const result = await repo.findManyByViewer('viewer', roleName)

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where }))
    expect(result[0]).toMatchObject({ mangaka: { displayName: 'name-m1' }, editor: null })
  })

  it('returns null for a missing detail and maps a present editor', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'c1',
        series: { id: 's1', title: 'Series' },
        mangaka: user('m1', 'Mangaka'),
        editor: user('e1', 'Editor')
      })
    const repo = new ContractRepo({ contract: { findUnique } } as never)

    await expect(repo.findById('missing')).resolves.toBeNull()
    await expect(repo.findById('c1')).resolves.toMatchObject({
      mangaka: { displayName: 'Mangaka' },
      editor: { displayName: 'Editor' }
    })
  })

  it('loads PDF relations and attaches known and dangling board signers without N+1 queries', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'c1',
      mangaka: user('m1'),
      editor: null,
      contractSignatures: [
        { userId: 'b1', role: 'BOARD_EDITOR', signedAt: new Date() },
        { userId: 'missing', role: 'BOARD_EDITOR', signedAt: new Date() }
      ]
    })
    const userFindMany = jest.fn().mockResolvedValue([user('b1', 'Board One')])
    const repo = new ContractRepo({ contract: { findUnique }, user: { findMany: userFindMany } } as never)

    const result = await repo.findByIdForPdf('c1')

    expect(userFindMany).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      editor: null,
      contractSignatures: [{ user: { displayName: 'Board One' } }, { user: null }]
    })
  })

  it('returns null when the PDF contract does not exist', async () => {
    const repo = new ContractRepo({ contract: { findUnique: jest.fn().mockResolvedValue(null) } } as never)

    await expect(repo.findByIdForPdf('missing')).resolves.toBeNull()
  })

  it('creates a draft and delegates simple version, status, decision, signature and progress queries', async () => {
    const contract = {
      create: jest.fn().mockResolvedValue({
        id: 'c1',
        valuationAmount: 100,
        publisherOwnershipPct: 70,
        mangakaOwnershipPct: 30,
        terminationClause: 'clause'
      }),
      update: jest.fn().mockResolvedValue({ id: 'c1' }),
      findUnique: jest.fn().mockResolvedValue({ id: 'c1' })
    }
    const contractVersion = {
      create: jest.fn().mockResolvedValue({ id: 'v1' }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null)
    }
    const contractSignature = {
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(2)
    }
    const prisma = {
      contract,
      contractVersion,
      contractSignature,
      $transaction: jest.fn((work: (client: unknown) => unknown) =>
        work({ contract, contractVersion, contractSignature })
      )
    }
    const repo = new ContractRepo(prisma as never)
    const dto = { seriesId: 's1', mangakaId: 'm1', boardDecisionId: 'd1' } as never

    await repo.createDraft('e1', dto)
    await repo.findVersionsByContractId('c1')
    await repo.findVersionById('c1', 'v1')
    await repo.findLatestVersion('c1')
    await repo.updateStatus('c1', ContractStatus.NEGOTIATION)
    await repo.updateStatus('c1', ContractStatus.NEGOTIATION, { mangakaSignedAt: null })
    await repo.findWithBoardDecision('c1')
    await repo.findSpecificSignature('c1', 'b1')
    await repo.countBoardSignatures('c1')
    await repo.getContractSignaturesProgress('c1')

    expect(contract.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ editorId: 'e1', status: ContractStatus.DRAFT })
    })
    expect(contractVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contractId: 'c1',
        versionNumber: 1,
        valuationAmount: 100,
        editedById: 'e1'
      })
    })
    expect(contract.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'c1' },
      data: { status: ContractStatus.NEGOTIATION }
    })
    expect(contract.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'c1' },
      data: { status: ContractStatus.NEGOTIATION, mangakaSignedAt: null }
    })
  })

  it('allocates the next version inside the transaction and retries a unique race', async () => {
    const updated = {
      id: 'c1',
      valuationAmount: 100,
      publisherOwnershipPct: 60,
      mangakaOwnershipPct: 40,
      terminationClause: 'clause'
    }
    const tx = {
      contract: { update: jest.fn().mockResolvedValue(updated) },
      contractVersion: {
        findFirst: jest.fn().mockResolvedValue({ versionNumber: 4 }),
        create: jest.fn().mockResolvedValue({})
      }
    }
    let attempts = 0
    const $transaction = jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
      attempts++
      if (attempts === 1) {
        throw new PrismaClientKnownRequestError('version conflict', {
          code: 'P2002',
          clientVersion: '6.19.0'
        })
      }
      return callback(tx)
    })
    const repo = new ContractRepo({ $transaction } as never)

    await expect(repo.updateAndLogVersion('c1', { valuationAmount: 100 }, 'e1', 'revision')).resolves.toEqual(updated)

    expect($transaction).toHaveBeenCalledTimes(2)
    expect(tx.contractVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ contractId: 'c1', versionNumber: 5, editedById: 'e1', note: 'revision' })
    })
  })

  it('starts version numbering at one and does not retry a non-unique database error', async () => {
    const tx = {
      contract: {
        update: jest.fn().mockResolvedValue({
          valuationAmount: null,
          publisherOwnershipPct: null,
          mangakaOwnershipPct: null,
          terminationClause: null
        })
      },
      contractVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({})
      }
    }
    const successRepo = new ContractRepo({
      $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
    } as never)
    await successRepo.updateAndLogVersion('c1', {}, 'e1')
    expect(tx.contractVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ versionNumber: 1, note: undefined })
    })

    const failure = new Error('database unavailable')
    const $transaction = jest.fn().mockRejectedValue(failure)
    const failureRepo = new ContractRepo({ $transaction } as never)
    await expect(failureRepo.updateAndLogVersion('c1', {}, 'e1')).rejects.toBe(failure)
    expect($transaction).toHaveBeenCalledTimes(1)
  })

  it('records a board signature and settles an ordinary fully executed contract', async () => {
    const tx = {
      contractSignature: {
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(2)
      },
      contract: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 }),
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ sourceTransferRequestId: null })
          .mockResolvedValueOnce({ id: 'c1', status: ContractStatus.FULLY_EXECUTED })
      }
    }
    const repo = new ContractRepo({
      $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
    } as never)

    await expect(repo.recordBoardSignatureAndSettle('c1', 'b2', 2)).resolves.toMatchObject({
      signatureCount: 2,
      boardCompletedNow: true,
      executedNow: true
    })
  })

  it('does not mark board completion before the required quorum', async () => {
    const tx = {
      contractSignature: { create: jest.fn(), count: jest.fn().mockResolvedValue(1) },
      contract: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ sourceTransferRequestId: null })
          .mockResolvedValueOnce({ id: 'c1' })
      }
    }
    const repo = new ContractRepo({
      $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
    } as never)

    await expect(repo.recordBoardSignatureAndSettle('c1', 'b1', 2)).resolves.toMatchObject({
      boardCompletedNow: false,
      executedNow: false
    })
    expect(tx.contract.updateMany).toHaveBeenCalledTimes(1)
  })

  it('reports an idempotent losing mangaka signature race', async () => {
    const tx = { contract: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } }
    const repo = new ContractRepo({
      $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
    } as never)

    await expect(repo.recordMangakaSignatureAndSettle('c1')).resolves.toEqual({
      signed: false,
      executedNow: false,
      contract: null
    })
  })

  it('records the winning mangaka signature and settles only once', async () => {
    const tx = {
      contract: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 }),
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ sourceTransferRequestId: null })
          .mockResolvedValueOnce({ id: 'c1' })
      }
    }
    const repo = new ContractRepo({
      $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
    } as never)

    await expect(repo.recordMangakaSignatureAndSettle('c1')).resolves.toMatchObject({
      signed: true,
      executedNow: true,
      contract: { id: 'c1' }
    })
  })

  it('returns a typed settlement failure after an invalid replacement rolls back', async () => {
    const tx = {
      contractSignature: { create: jest.fn(), count: jest.fn().mockResolvedValue(1) },
      contract: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ sourceTransferRequestId: 'tr1' })
      },
      transferRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tr1',
          originalContractId: null,
          seriesId: 's1',
          requestingMangakaId: 'm2'
        })
      }
    }
    const $transaction = jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
    const repo = new ContractRepo({ $transaction } as never)

    await expect(repo.recordBoardSignatureAndSettle('c1', 'b1', 1)).resolves.toEqual({
      settlementFailure: 'TRANSFER_REQUEST_MISSING_ORIGINAL_CONTRACT'
    })
  })
})

describe('ContractAmendmentRepo atomic application', () => {
  it('returns null for a missing amendment and maps absent creators to null', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'a1', createdBy: null, signatures: [] })
    const repo = new ContractAmendmentRepo({ contractAmendment: { findUnique } } as never)

    await expect(repo.findById('missing')).resolves.toBeNull()
    await expect(repo.findById('a1')).resolves.toMatchObject({ creator: null })
  })

  it('delegates amendment persistence and signature operations', async () => {
    const contractAmendment = {
      create: jest.fn().mockResolvedValue({ id: 'a1' }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: 'a1' })
    }
    const amendmentSignature = {
      deleteMany: jest.fn().mockReturnValue('delete'),
      count: jest.fn().mockResolvedValue(1),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({})
    }
    const contract = { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) }
    const $transaction = jest.fn().mockResolvedValue([])
    const repo = new ContractAmendmentRepo({
      contractAmendment,
      amendmentSignature,
      contract,
      $transaction
    } as never)

    await repo.create({ contractId: 'c1' })
    await repo.findOpenByContract('c1')
    await repo.findExecutedContractBySeries('s1')
    await repo.update('a1', { status: 'DRAFT' })
    await repo.clearSignatures('a1')
    await repo.countBoardSignatures('a1')
    await repo.findSignature('a1', 'b1')
    await repo.addBoardSignature('a1', 'b1')

    expect($transaction).toHaveBeenCalledWith(['delete', expect.any(Promise)])
    expect(amendmentSignature.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amendmentId: 'a1', userId: 'b1', role: 'BOARD_MEMBER' })
    })
  })

  it('loses the execute guard without applying terms', async () => {
    const tx = { contractAmendment: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } }
    const repo = new ContractAmendmentRepo({
      $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
    } as never)

    await expect(repo.executeAndApply('a1', 'c1', 'b1')).resolves.toEqual({ applied: false })
  })

  it('atomically applies every non-null amended term and increments the latest version', async () => {
    const start = new Date('2026-01-01T00:00:00.000Z')
    const end = new Date('2027-01-01T00:00:00.000Z')
    const tx = {
      contractAmendment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          valuationAmount: 2_000,
          publisherOwnershipPct: 55,
          mangakaOwnershipPct: 45,
          terminationClause: 'new clause',
          contractStart: start,
          contractEnd: end
        })
      },
      contractVersion: {
        findFirst: jest.fn().mockResolvedValue({ versionNumber: 7 }),
        create: jest.fn()
      },
      contract: {
        update: jest.fn().mockResolvedValue({
          valuationAmount: 2_000,
          publisherOwnershipPct: 55,
          mangakaOwnershipPct: 45,
          terminationClause: 'new clause'
        })
      }
    }
    const repo = new ContractAmendmentRepo({
      $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
    } as never)

    await expect(repo.executeAndApply('a1', 'c1', 'b1')).resolves.toEqual({ applied: true })
    expect(tx.contract.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: {
        valuationAmount: 2_000,
        publisherOwnershipPct: 55,
        mangakaOwnershipPct: 45,
        terminationClause: 'new clause',
        contractStart: start,
        contractEnd: end
      }
    })
    expect(tx.contractVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ versionNumber: 8, editedById: 'b1', note: 'Amendment a1' })
    })
  })

  it('keeps untouched terms out of the update and starts version numbering at one', async () => {
    const tx = {
      contractAmendment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          valuationAmount: null,
          publisherOwnershipPct: null,
          mangakaOwnershipPct: null,
          terminationClause: null,
          contractStart: null,
          contractEnd: null
        })
      },
      contractVersion: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      contract: {
        update: jest.fn().mockResolvedValue({
          valuationAmount: null,
          publisherOwnershipPct: null,
          mangakaOwnershipPct: null,
          terminationClause: null
        })
      }
    }
    const repo = new ContractAmendmentRepo({
      $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
    } as never)

    await repo.executeAndApply('a1', 'c1', 'b1')

    expect(tx.contract.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: {} })
    expect(tx.contractVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ versionNumber: 1 })
    })
  })
})
