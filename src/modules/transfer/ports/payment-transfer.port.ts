import type { TransactionContext } from 'src/infrastructure/database/transaction-context'

export abstract class PaymentTransferPort {
  abstract markPendingConditionsMissed(context: TransactionContext, contractId: string): Promise<void>
}
