import { Injectable } from '@nestjs/common'
import { AuditEntityType, NotificationType } from '@prisma/client'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { DomainEvent } from 'src/core/events/domain-events'
import { OutboxRepo } from 'src/infrastructure/database/outbox.repo'
import { AuditService } from 'src/modules/audit/audit.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { TransferMessages } from '../transfer.messages'
import type { TransferReplacementPayload } from './transfer-finalizer.service'

@Injectable()
export class TransferSettlementEffectsService {
  constructor(
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly events: DomainEventBus,
    private readonly outbox: OutboxRepo
  ) {}

  async publish(payload: TransferReplacementPayload): Promise<void> {
    await this.audit.record({
      actorId: null,
      entityType: AuditEntityType.TRANSFER_REQUEST,
      entityId: payload.transferRequestId,
      action: 'SETTLEMENT_COMPLETED',
      toState: 'COMPLETED'
    })
    await this.notifications.notifySafe({
      recipientId: payload.toMangakaId,
      type: NotificationType.CONTRACT,
      referenceId: payload.transferRequestId,
      referenceType: 'TRANSFER_SETTLEMENT_COMPLETED',
      content: TransferMessages.notification.settlementCompleted
    })
    this.events.emit(DomainEvent.ContractExecuted, {
      contractId: payload.replacementContractId,
      seriesId: payload.seriesId
    })
  }

  async acknowledge(eventId: string): Promise<void> {
    await this.outbox.markProcessed(eventId)
  }
}
