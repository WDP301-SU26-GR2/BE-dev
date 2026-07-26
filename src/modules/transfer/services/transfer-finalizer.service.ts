import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { DatabaseUnitOfWork } from 'src/infrastructure/database/database-unit-of-work.service'
import { ContractTransferPort } from '../ports/contract-transfer.port'
import { PaymentTransferPort } from '../ports/payment-transfer.port'
import { SeriesOwnershipPort } from '../ports/series-ownership.port'
import { TransferRequestStateService } from './transfer-request-state.service'
import { TransferSettlementEffectsService } from './transfer-settlement-effects.service'

export type TransferReplacementPayload = {
  transferRequestId: string
  originalContractId: string
  replacementContractId: string
  seriesId: string
  toMangakaId: string
}

@Injectable()
export class TransferFinalizerService {
  constructor(
    private readonly uow: DatabaseUnitOfWork,
    private readonly requestState: TransferRequestStateService,
    private readonly contracts: ContractTransferPort,
    private readonly payments: PaymentTransferPort,
    private readonly series: SeriesOwnershipPort,
    private readonly effects: TransferSettlementEffectsService
  ) {}

  async finalize(event: { id: string; payload: Prisma.JsonValue }): Promise<void> {
    const payload = event.payload as TransferReplacementPayload
    const settled = await this.uow.runInTransaction(async (context) => {
      const won = await this.requestState.completeReplacement(context, payload.transferRequestId)
      if (!won) return false
      await this.contracts.activateReplacementAndTerminateOriginal(context, {
        originalContractId: payload.originalContractId,
        replacementContractId: payload.replacementContractId
      })
      await this.payments.markPendingConditionsMissed(context, payload.originalContractId)
      await this.series.transferOwnership(context, {
        seriesId: payload.seriesId,
        mangakaId: payload.toMangakaId,
        coOwnerId: null,
        coOwnerApprovalRequired: false
      })
      return true
    })
    if (settled) await this.effects.publish(payload)
    await this.effects.acknowledge(event.id)
  }
}
