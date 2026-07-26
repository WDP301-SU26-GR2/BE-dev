import type { TransactionContext } from 'src/infrastructure/database/transaction-context'

export abstract class SeriesOwnershipPort {
  abstract transferOwnership(
    context: TransactionContext,
    command: {
      seriesId: string
      mangakaId: string
      coOwnerId: string | null
      coOwnerApprovalRequired: boolean
    }
  ): Promise<void>
}
