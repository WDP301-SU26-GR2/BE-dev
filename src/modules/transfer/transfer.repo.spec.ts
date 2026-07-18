import { TransferRepo } from './transfer.repo'

describe('TransferRepo response enrichment', () => {
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
    } as any)

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
    } as any)

    await expect(repo.findTransferContractById('tc1')).resolves.toMatchObject({
      series: null,
      fromMangaka: null,
      toMangaka: null
    })
  })
})
