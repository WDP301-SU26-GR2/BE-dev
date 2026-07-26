import { Injectable } from '@nestjs/common'
import { TransferContractStatus } from '@prisma/client'
import type { TransactionContext } from 'src/infrastructure/database/transaction-context'
import { InvalidTransferStateException } from '../errors/transfer.error'
import { TRANSFER_CONTRACT_TRANSITIONS } from '../transfer.constant'
import { TransferRepo } from '../transfer.repo'

@Injectable()
export class TransferContractStateService {
  constructor(private readonly repo: TransferRepo) {}

  async transition(
    context: TransactionContext,
    id: string,
    expected: TransferContractStatus,
    target: TransferContractStatus
  ): Promise<void> {
    const allowed = TRANSFER_CONTRACT_TRANSITIONS[expected] as readonly TransferContractStatus[]
    if (!allowed?.includes(target)) throw InvalidTransferStateException
    if (!(await this.repo.compareAndSetContractStatus(context, id, expected, target))) {
      throw InvalidTransferStateException
    }
  }
}
