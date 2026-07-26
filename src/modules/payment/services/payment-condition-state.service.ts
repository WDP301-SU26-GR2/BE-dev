import { Injectable } from '@nestjs/common'
import { AuditEntityType, PaymentCondition, PaymentConditionStatus } from '@prisma/client'
import type { TransactionContext } from 'src/infrastructure/database/transaction-context'
import { AuditService } from 'src/modules/audit/audit.service'
import { PaymentConditionNotEditableException } from '../errors/payment.error'
import { PaymentConditionRepo } from '../payment-condition.repo'

@Injectable()
export class PaymentConditionStateService {
  constructor(
    private readonly repository: PaymentConditionRepo,
    private readonly auditService: AuditService
  ) {}

  async disable(
    condition: Pick<PaymentCondition, 'id' | 'contractId' | 'status'>,
    actorId: string
  ): Promise<PaymentCondition> {
    if (condition.status === PaymentConditionStatus.DISABLED) {
      return condition as PaymentCondition
    }
    if (condition.status !== PaymentConditionStatus.PENDING) {
      throw new PaymentConditionNotEditableException()
    }

    const updated = await this.repository.compareAndSetStatus(
      condition.id,
      PaymentConditionStatus.PENDING,
      PaymentConditionStatus.DISABLED
    )
    if (!updated) throw new PaymentConditionNotEditableException()

    await this.auditService.record({
      actorId,
      entityType: AuditEntityType.CONTRACT,
      entityId: condition.contractId,
      action: 'PAYMENT_CONDITION_TRANSITION',
      fromState: PaymentConditionStatus.PENDING,
      toState: PaymentConditionStatus.DISABLED,
      reason: `paymentConditionId=${condition.id}`
    })
    return updated
  }

  markPendingMissedInTransaction(context: TransactionContext, contractId: string): Promise<void> {
    return this.repository.markPendingMissedInTransaction(context, contractId).then(() => undefined)
  }
}
