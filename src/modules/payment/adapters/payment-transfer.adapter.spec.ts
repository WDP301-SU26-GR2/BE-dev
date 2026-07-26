import { createTransactionContext } from 'src/infrastructure/database/transaction-context'
import { PaymentTransferAdapter } from './payment-transfer.adapter'

describe('PaymentTransferAdapter', () => {
  it('marks only pending conditions missed inside the caller transaction', async () => {
    const state = { markPendingMissedInTransaction: jest.fn().mockResolvedValue(undefined) }
    const adapter = new PaymentTransferAdapter(state as never)
    const context = createTransactionContext({} as never)

    await adapter.markPendingConditionsMissed(context, 'contract-1')

    expect(state.markPendingMissedInTransaction).toHaveBeenCalledWith(context, 'contract-1')
  })

  it('rejects an invalid transaction context instead of writing outside the transfer saga', async () => {
    const state = {
      markPendingMissedInTransaction: jest.fn().mockRejectedValue(new Error('Transaction context is no longer valid'))
    }
    const adapter = new PaymentTransferAdapter(state as never)

    await expect(adapter.markPendingConditionsMissed({} as never, 'contract-1')).rejects.toThrow(
      'Transaction context is no longer valid'
    )
  })
})
