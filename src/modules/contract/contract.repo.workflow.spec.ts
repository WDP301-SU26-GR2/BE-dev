import { ContractStatus, ContractType, PaymentConditionStatus } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { ContractRepo } from './contract.repo'

const user = (id: string, displayName: string | null = null) => ({
  id,
  name: `name-${id}`,
  displayName,
  avatar: null
})

describe('ContractRepo two-phase workflow persistence', () => {
  it.each([
    ['EDITOR', { editorId: 'viewer' }],
    ['MANGAKA', { mangakaId: 'viewer' }],
    ['BOARD_MEMBER', {}]
  ])('scopes list access for %s', async (roleName, where) => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'c1',
        representativeId: null,
        series: { id: 's1', title: 'Series' },
        mangaka: user('m1'),
        editor: null
      }
    ])
    const repo = new ContractRepo({ contract: { findMany } } as never)

    const result = await repo.findManyByViewer('viewer', roleName)

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where }))
    expect(result[0]).toMatchObject({ mangaka: { displayName: 'name-m1' }, editor: null, representative: null })
  })

  it('loads PDF relations and attaches the representative mini shape', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'c1',
      representativeId: 'b1',
      mangaka: user('m1'),
      editor: null
    })
    const userFindMany = jest.fn().mockResolvedValue([user('b1', 'Board One')])
    const repo = new ContractRepo({ contract: { findUnique }, user: { findMany: userFindMany } } as never)

    const result = await repo.findByIdForPdf('c1')

    expect(userFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['b1'] } },
      select: { id: true, name: true, displayName: true, avatar: true }
    })
    expect(result).toMatchObject({
      editor: null,
      representative: { id: 'b1', displayName: 'Board One' }
    })
  })

  it('creates a draft and version one in a single transaction', async () => {
    const contract = {
      create: jest.fn().mockResolvedValue({
        id: 'c1',
        valuationAmount: 100,
        publisherOwnershipPct: 70,
        mangakaOwnershipPct: 30,
        terminationClause: 'clause'
      })
    }
    const contractVersion = { create: jest.fn().mockResolvedValue({ id: 'v1' }) }
    const prisma = {
      $transaction: jest.fn((work: (client: unknown) => unknown) => work({ contract, contractVersion }))
    }
    const repo = new ContractRepo(prisma as never)

    await repo.createDraft('e1', { seriesId: 's1', mangakaId: 'm1', boardDecisionId: 'd1' } as never)

    expect(contract.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ editorId: 'e1', status: ContractStatus.DRAFT })
    })
    expect(contractVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ contractId: 'c1', versionNumber: 1, valuationAmount: 100, editedById: 'e1' })
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

  it('claims, releases, assigns, comments, and voids with the new representative fields', async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 3 })
    const contract = {
      updateMany,
      update: jest.fn().mockResolvedValue({ id: 'c1', representativeId: 'b2' }),
      findUnique: jest.fn().mockResolvedValue(null)
    }
    const contractComment = {
      create: jest.fn().mockResolvedValue({ id: 'comment-1' }),
      findMany: jest.fn().mockResolvedValue([])
    }
    const repo = new ContractRepo({ contract, contractComment } as never)

    await repo.claimRepresentative('c1', 'b1')
    await expect(repo.releaseRepresentative('c1', 'b1')).resolves.toBe(true)
    await repo.assignRepresentative('c1', 'b2')
    await repo.createComment('c1', 'b1', 'LGTM')
    await repo.findCommentsByContract('c1')
    await repo.voidNonExecutedContractsBySeries('s1')

    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'c1', status: ContractStatus.BOARD_REVIEW, representativeId: { isSet: false } },
      data: { representativeId: 'b1' }
    })
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'c1',
        representativeId: 'b1',
        OR: [{ representativeSignedAt: null }, { representativeSignedAt: { isSet: false } }]
      },
      data: { representativeId: { unset: true } }
    })
    expect(contract.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { representativeId: 'b2' } })
    expect(contractComment.create).toHaveBeenCalledWith({ data: { contractId: 'c1', authorId: 'b1', content: 'LGTM' } })
    expect(updateMany).toHaveBeenNthCalledWith(3, {
      where: {
        seriesId: 's1',
        status: { in: [ContractStatus.DRAFT, ContractStatus.BOARD_REVIEW, ContractStatus.AWAITING_MANGAKA] }
      },
      data: { status: ContractStatus.VOIDED }
    })
  })

  it('records a representative signature with CAS and moves to AWAITING_MANGAKA', async () => {
    const contract = {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue(null)
    }
    const repo = new ContractRepo({ contract } as never)

    await expect(repo.recordRepresentativeSignatureAndSettle('c1', 'b1')).resolves.toEqual({
      signed: true,
      contract: null
    })
    expect(contract.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'c1',
        status: ContractStatus.BOARD_REVIEW,
        representativeId: 'b1',
        OR: [{ representativeSignedAt: null }, { representativeSignedAt: { isSet: false } }]
      },
      data: { status: ContractStatus.AWAITING_MANGAKA, representativeSignedAt: expect.any(Date) }
    })
  })

  it('records Mangaka accept, executing ordinary contracts and queuing transfer replacements', async () => {
    const ordinaryTx = {
      contract: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: 'c1', seriesId: 's1' })
      }
    }
    const ordinaryRepo = new ContractRepo({
      $transaction: (callback: (client: typeof ordinaryTx) => Promise<unknown>) => callback(ordinaryTx)
    } as never)

    await expect(ordinaryRepo.recordMangakaAcceptAndSettle('c1', ContractStatus.FULLY_EXECUTED)).resolves.toMatchObject(
      {
        signed: true,
        executedNow: true,
        contract: { id: 'c1' }
      }
    )

    const replacementTx = {
      contract: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ sourceTransferRequestId: 'tr1' })
          .mockResolvedValueOnce({ id: 'c2', seriesId: 's1' })
      },
      transferRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tr1',
          originalContractId: 'old',
          seriesId: 's1',
          requestingMangakaId: 'm2'
        })
      }
    }
    const outbox = { enqueueWithClient: jest.fn().mockResolvedValue(undefined) }
    const replacementRepo = new ContractRepo(
      {
        $transaction: (callback: (client: typeof replacementTx) => Promise<unknown>) => callback(replacementTx)
      } as never,
      outbox as never
    )

    await expect(
      replacementRepo.recordMangakaAcceptAndSettle('c2', ContractStatus.ACTIVATION_PENDING)
    ).resolves.toMatchObject({
      signed: true,
      executedNow: false,
      contract: { id: 'c2' }
    })
    expect(outbox.enqueueWithClient).toHaveBeenCalledWith(
      replacementTx,
      expect.objectContaining({
        aggregateId: 'tr1',
        payload: expect.objectContaining({ replacementContractId: 'c2', originalContractId: 'old' })
      })
    )
  })

  it('clones a rejected contract into a redraft with active payment conditions only', async () => {
    const source = {
      id: 'old',
      seriesId: 's1',
      mangakaId: 'm1',
      editorId: 'e1',
      boardDecisionId: 'd1',
      sourceTransferRequestId: 'tr1',
      contractType: ContractType.FULL_BUYOUT,
      valuationAmount: 100,
      publisherOwnershipPct: 100,
      mangakaOwnershipPct: 0,
      terminationClause: 'clause',
      contractStart: null,
      contractEnd: null,
      conditions: [
        {
          conditionType: 'CHAPTER_MILESTONE',
          thresholdConfig: { chapter: 1 },
          payoutAmount: 50,
          payoutPct: null,
          isRecurring: false,
          status: PaymentConditionStatus.PENDING
        },
        {
          conditionType: 'TIME_BOUND',
          thresholdConfig: { deadline: '2026-12-31' },
          payoutAmount: 10,
          payoutPct: null,
          isRecurring: false,
          status: PaymentConditionStatus.DISABLED
        }
      ]
    }
    const created = { ...source, id: 'new' }
    const tx = {
      contract: {
        findUnique: jest.fn().mockResolvedValue(source),
        create: jest.fn().mockResolvedValue(created)
      },
      contractVersion: { create: jest.fn().mockResolvedValue({ id: 'v1' }) }
    }
    const repo = new ContractRepo({
      $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
    } as never)

    await expect(repo.redraftClone('old', 'e1')).resolves.toEqual(created)
    expect(tx.contract.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        supersedesContractId: 'old',
        sourceTransferRequestId: 'tr1',
        status: ContractStatus.DRAFT,
        conditions: {
          create: [
            expect.objectContaining({
              conditionType: 'CHAPTER_MILESTONE',
              status: PaymentConditionStatus.PENDING
            })
          ]
        }
      })
    })
  })
})
