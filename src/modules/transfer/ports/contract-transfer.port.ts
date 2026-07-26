import type { Contract, ContractType } from '@prisma/client'
import type { TransactionContext } from 'src/infrastructure/database/transaction-context'

export abstract class ContractTransferPort {
  abstract createReplacementDraft(
    context: TransactionContext,
    command: {
      seriesId: string
      mangakaId: string
      editorId?: string | null
      boardDecisionId: string
      originalContractId: string
      sourceTransferRequestId: string
      contractType: ContractType
      valuationAmount: number
      conditions: { description: string; type: string; value: number }[]
    }
  ): Promise<Contract>

  abstract activateReplacementAndTerminateOriginal(
    context: TransactionContext,
    command: { originalContractId: string; replacementContractId: string }
  ): Promise<void>
}
