import { Injectable } from '@nestjs/common'
import { TransferRequestStatus } from '@prisma/client'
import type { TransactionContext } from 'src/infrastructure/database/transaction-context'
import { InvalidTransferStateException } from '../errors/transfer.error'
import { TRANSFER_REQUEST_TRANSITIONS } from '../transfer.constant'
import { TransferRepo } from '../transfer.repo'

@Injectable()
export class TransferRequestStateService {
  constructor(private readonly repo: TransferRepo) {}

  async transition(
    context: TransactionContext,
    id: string,
    expected: TransferRequestStatus,
    target: TransferRequestStatus,
    patch?: { boardDecisionId?: string }
  ) {
    const allowed = TRANSFER_REQUEST_TRANSITIONS[expected] as readonly TransferRequestStatus[]
    if (!allowed?.includes(target)) throw InvalidTransferStateException
    const transitioned = patch
      ? await this.repo.compareAndSetRequestStatus(context, id, expected, target, patch)
      : await this.repo.compareAndSetRequestStatus(context, id, expected, target)
    if (!transitioned) {
      throw InvalidTransferStateException
    }
    const updated = await this.repo.findRequestInTransaction(context, id)
    if (!updated) throw InvalidTransferStateException
    return updated
  }

  async completeReplacement(context: TransactionContext, id: string): Promise<boolean> {
    if (
      await this.repo.compareAndSetRequestStatus(
        context,
        id,
        TransferRequestStatus.AWAITING_REPLACEMENT_SIGNATURES,
        TransferRequestStatus.COMPLETED
      )
    ) {
      return true
    }
    const current = await this.repo.findRequestStatus(context, id)
    if (current === TransferRequestStatus.COMPLETED) return false
    throw InvalidTransferStateException
  }
}
