import { TransferRepo } from './transfer.repo'
import { createTransactionContext } from 'src/infrastructure/database/transaction-context'

describe('TransferRepo response enrichment', () => {
  it('returns null when the requested transfer request does not exist', async () => {
    const repo = new TransferRepo({
      transferRequest: { findUnique: jest.fn().mockResolvedValue(null) }
    } as unknown as ConstructorParameters<typeof TransferRepo>[0])

    await expect(repo.findTransferRequestById('missing')).resolves.toBeNull()
  })

  it('attaches request context and maps a dangling user id to null', async () => {
    const transferRequestFindUnique = jest.fn().mockResolvedValue({
      id: 'tr1',
      seriesId: 's1',
      requestingMangakaId: 'u1',
      originalMangakaId: 'missing',
      boardDecision: null,
      originalContract: null
    })
    const userFindMany = jest.fn().mockResolvedValue([{ id: 'u1', name: 'Requester', displayName: null, avatar: null }])
    const seriesFindMany = jest.fn().mockResolvedValue([{ id: 's1', title: 'Series' }])
    const repo = new TransferRepo({
      transferRequest: { findUnique: transferRequestFindUnique },
      user: { findMany: userFindMany },
      series: { findMany: seriesFindMany }
    } as unknown as ConstructorParameters<typeof TransferRepo>[0])

    const result = await repo.findTransferRequestById('tr1')

    expect(result).toMatchObject({
      series: { id: 's1', title: 'Series' },
      requestingMangaka: { id: 'u1', displayName: 'Requester', avatar: null },
      originalMangaka: null
    })
  })

  it('returns null mini fields for dangling transfer-contract ids without throwing', async () => {
    const repo = new TransferRepo({
      transferContract: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tc1',
          seriesId: 'missing-series',
          fromMangakaId: 'missing-from',
          toMangakaId: 'missing-to',
          signatures: []
        })
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      series: { findMany: jest.fn().mockResolvedValue([]) }
    } as unknown as ConstructorParameters<typeof TransferRepo>[0])

    await expect(repo.findTransferContractById('tc1')).resolves.toMatchObject({
      series: null,
      fromMangaka: null,
      toMangaka: null
    })
  })

  it('returns null when the requested transfer contract does not exist', async () => {
    const repo = new TransferRepo({
      transferContract: { findUnique: jest.fn().mockResolvedValue(null) }
    } as unknown as ConstructorParameters<typeof TransferRepo>[0])

    await expect(repo.findTransferContractById('missing')).resolves.toBeNull()
  })

  it('enriches optional request relations without querying raw identity data', async () => {
    const userFindMany = jest.fn().mockResolvedValue([
      { id: 'from', name: 'From', displayName: 'Original', avatar: null },
      { id: 'to', name: 'To', displayName: 'Requester', avatar: null }
    ])
    const seriesFindMany = jest.fn().mockResolvedValue([{ id: 'series', title: 'Series' }])
    const repo = new TransferRepo({
      transferRequest: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'r1', seriesId: 'series', originalMangakaId: 'from', requestingMangakaId: 'to' },
          { id: 'r2', seriesId: null, originalMangakaId: null, requestingMangakaId: null }
        ])
      },
      user: { findMany: userFindMany },
      series: { findMany: seriesFindMany }
    } as unknown as ConstructorParameters<typeof TransferRepo>[0])

    const rows = await repo.findTransferRequestsByMangaka('to')

    expect(rows[0]).toMatchObject({
      series: { id: 'series', title: 'Series' },
      originalMangaka: { id: 'from', displayName: 'Original' },
      requestingMangaka: { id: 'to', displayName: 'Requester' }
    })
    expect(rows[1]).toMatchObject({ series: null, originalMangaka: null, requestingMangaka: null })
  })

  it.each([
    [1, true],
    [0, false]
  ])('maps request CAS count %i to %s', async (count, expected) => {
    const updateMany = jest.fn().mockResolvedValue({ count })
    const context = createTransactionContext({
      transferRequest: { updateMany }
    } as never)
    const repo = new TransferRepo({} as never)

    await expect(repo.compareAndSetRequestStatus(context, 'request-1', 'SUBMITTED', 'UNDER_REVIEW')).resolves.toBe(
      expected
    )
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'request-1', status: 'SUBMITTED' },
      data: { status: 'UNDER_REVIEW' }
    })
  })

  it('writes the Board decision in the same request CAS mutation', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 })
    const context = createTransactionContext({ transferRequest: { updateMany } } as never)
    const repo = new TransferRepo({} as never)

    await repo.compareAndSetRequestStatus(context, 'request-1', 'SUBMITTED', 'UNDER_REVIEW', {
      boardDecisionId: 'decision-1'
    })

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'request-1', status: 'SUBMITTED' },
      data: { status: 'UNDER_REVIEW', boardDecisionId: 'decision-1' }
    })
  })

  it('returns null for a missing request status inside a transaction', async () => {
    const context = createTransactionContext({
      transferRequest: { findUnique: jest.fn().mockResolvedValue(null) }
    } as never)
    const repo = new TransferRepo({} as never)

    await expect(repo.findRequestStatus(context, 'request-1')).resolves.toBeNull()
  })

  it.each([
    [1, true],
    [0, false]
  ])('maps contract CAS count %i to %s', async (count, expected) => {
    const context = createTransactionContext({
      transferContract: { updateMany: jest.fn().mockResolvedValue({ count }) }
    } as never)
    const repo = new TransferRepo({} as never)

    await expect(repo.compareAndSetContractStatus(context, 'contract-1', 'DRAFT', 'A_SIGNED')).resolves.toBe(expected)
  })
})
