import { createTransactionContext } from 'src/infrastructure/database/transaction-context'
import { SeriesOwnershipAdapter } from './series-ownership.adapter'

describe('SeriesOwnershipAdapter', () => {
  it('changes all ownership fields atomically through the caller transaction', async () => {
    const tx = {
      series: {
        update: jest.fn().mockResolvedValue({ id: 'series-1' })
      }
    }
    const adapter = new SeriesOwnershipAdapter()

    await adapter.transferOwnership(createTransactionContext(tx as never), {
      seriesId: 'series-1',
      mangakaId: 'new-owner',
      coOwnerId: null,
      coOwnerApprovalRequired: false
    })

    expect(tx.series.update).toHaveBeenCalledWith({
      where: { id: 'series-1' },
      data: {
        mangakaId: 'new-owner',
        coOwnerId: null,
        coOwnerApprovalRequired: false
      }
    })
  })

  it('rejects an invalid transaction context instead of mutating ownership out of band', async () => {
    const adapter = new SeriesOwnershipAdapter()

    await expect(
      adapter.transferOwnership({} as never, {
        seriesId: 'series-1',
        mangakaId: 'new-owner',
        coOwnerId: null,
        coOwnerApprovalRequired: false
      })
    ).rejects.toThrow('Transaction context is no longer valid')
  })
})
