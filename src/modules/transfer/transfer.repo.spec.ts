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
      transferContract: { findMany: jest.fn().mockResolvedValue([]) },
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
      transferContract: { findMany: jest.fn().mockResolvedValue([]) },
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

  // Spec 27 — TransferContract KHÔNG có relation Prisma ngược từ TransferRequest
  // (`TransferContract.transferRequestId` là field thường, không phải `@relation`),
  // nên enrichment phải là truy vấn riêng. Test ở tầng repo vì service chỉ pass-through:
  // mock repo trả sẵn field sẽ pass giả, không chứng minh được gì (mock-blindspot).
  it('gắn transferContractId vào request detail bằng đúng 1 truy vấn transferContract', async () => {
    const transferContractFindMany = jest.fn().mockResolvedValue([{ id: 'tc1', transferRequestId: 'tr1' }])
    const repo = new TransferRepo({
      transferRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tr1',
          seriesId: 's1',
          requestingMangakaId: 'u1',
          originalMangakaId: 'u2',
          boardDecision: null,
          originalContract: null
        })
      },
      transferContract: { findMany: transferContractFindMany },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      series: { findMany: jest.fn().mockResolvedValue([]) }
    } as unknown as ConstructorParameters<typeof TransferRepo>[0])

    await expect(repo.findTransferRequestById('tr1')).resolves.toMatchObject({ transferContractId: 'tc1' })
    expect(transferContractFindMany).toHaveBeenCalledTimes(1)
    expect(transferContractFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { transferRequestId: { in: ['tr1'] } } })
    )
  })

  it('trả transferContractId null khi request chưa có hợp đồng chuyển nhượng', async () => {
    const repo = new TransferRepo({
      transferRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tr1',
          seriesId: 's1',
          requestingMangakaId: 'u1',
          originalMangakaId: 'u2',
          boardDecision: null,
          originalContract: null
        })
      },
      transferContract: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      series: { findMany: jest.fn().mockResolvedValue([]) }
    } as unknown as ConstructorParameters<typeof TransferRepo>[0])

    await expect(repo.findTransferRequestById('tr1')).resolves.toMatchObject({ transferContractId: null })
  })

  it('gắn transferContractId cho list Mangaka theo đúng từng request (không lẫn hàng)', async () => {
    const repo = new TransferRepo({
      transferRequest: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'r1', seriesId: 'series', originalMangakaId: 'from', requestingMangakaId: 'to' },
          { id: 'r2', seriesId: 'series', originalMangakaId: 'from', requestingMangakaId: 'to' }
        ])
      },
      transferContract: { findMany: jest.fn().mockResolvedValue([{ id: 'tc-for-r2', transferRequestId: 'r2' }]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      series: { findMany: jest.fn().mockResolvedValue([]) }
    } as unknown as ConstructorParameters<typeof TransferRepo>[0])

    const rows = await repo.findTransferRequestsByMangaka('to')

    expect(rows[0]).toMatchObject({ id: 'r1', transferContractId: null })
    expect(rows[1]).toMatchObject({ id: 'r2', transferContractId: 'tc-for-r2' })
  })

  it('gắn transferContractId cho list pending-board', async () => {
    const repo = new TransferRepo({
      transferRequest: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'r1', seriesId: 's', originalMangakaId: 'a', requestingMangakaId: 'b' }])
      },
      transferContract: { findMany: jest.fn().mockResolvedValue([{ id: 'tc1', transferRequestId: 'r1' }]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      series: { findMany: jest.fn().mockResolvedValue([]) }
    } as unknown as ConstructorParameters<typeof TransferRepo>[0])

    const rows = await repo.findPendingBoardRequests()

    expect(rows[0]).toMatchObject({ transferContractId: 'tc1' })
  })

  it('bỏ qua truy vấn transferContract khi danh sách request rỗng', async () => {
    const transferContractFindMany = jest.fn()
    const repo = new TransferRepo({
      transferRequest: { findMany: jest.fn().mockResolvedValue([]) },
      transferContract: { findMany: transferContractFindMany },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      series: { findMany: jest.fn().mockResolvedValue([]) }
    } as unknown as ConstructorParameters<typeof TransferRepo>[0])

    await expect(repo.findPendingBoardRequests()).resolves.toEqual([])
    expect(transferContractFindMany).not.toHaveBeenCalled()
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
