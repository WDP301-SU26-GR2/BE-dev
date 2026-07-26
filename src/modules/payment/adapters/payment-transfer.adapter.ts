import { Injectable } from '@nestjs/common'
import { PaymentTransferPort } from 'src/modules/transfer/ports/payment-transfer.port'
import { PaymentConditionStateService } from '../services/payment-condition-state.service'

@Injectable()
export class PaymentTransferAdapter implements PaymentTransferPort {
  constructor(private readonly conditionState: PaymentConditionStateService) {}

  async markPendingConditionsMissed(
    context: Parameters<PaymentTransferPort['markPendingConditionsMissed']>[0],
    contractId: string
  ): Promise<void> {
    await this.conditionState.markPendingMissedInTransaction(context, contractId)
  }
}
