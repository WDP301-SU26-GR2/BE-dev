import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { NotificationType } from '@prisma/client'
import { DomainEvent, DomainEventPayload } from 'src/core/events/domain-events'
import { NotificationService } from 'src/modules/notification/notification.service'
import { ContractAmendmentRepo } from '../contract-amendment.repo'
import { ContractMessages } from '../contract.messages'

// Spec 4 / Flow 5: series (BE-A) emit ContractAmendmentRequested khi CHANGE_FORMAT/COMPLETE →
// contract module tạo DRAFT amendment stub cho HĐ FULLY_EXECUTED + nhắc Editor. Best-effort.
@Injectable()
export class ContractAmendmentListener {
  private readonly logger = new Logger(ContractAmendmentListener.name)

  constructor(
    private readonly amendmentRepo: ContractAmendmentRepo,
    private readonly notificationService: NotificationService
  ) {}

  @OnEvent(DomainEvent.ContractAmendmentRequested)
  async onAmendmentRequested(
    payload: DomainEventPayload[typeof DomainEvent.ContractAmendmentRequested]
  ): Promise<void> {
    try {
      const contract = await this.amendmentRepo.findExecutedContractBySeries(payload.seriesId)
      if (!contract) {
        this.logger.warn(`amendment-requested: series ${payload.seriesId} has no FULLY_EXECUTED contract — skip`)
        return
      }
      const open = await this.amendmentRepo.findOpenByContract(contract.id)
      if (open) {
        this.logger.warn(`amendment-requested: contract ${contract.id} already has open amendment — skip`)
        return
      }
      void (await this.amendmentRepo.create({
        contractId: contract.id,
        changedClauses: [payload.summary],
        reason: payload.summary,
        status: 'DRAFT',
        triggerSource: payload.trigger,
        createdBy: contract.editorId ?? null
      }))
      await this.notificationService.notifySafe({
        recipientId: contract.editorId ?? '',
        type: NotificationType.CONTRACT,
        referenceId: payload.seriesId,
        referenceType: 'CONTRACT_AMENDMENT_NEEDED',
        content: ContractMessages.notification.amendmentNeeded
      })
    } catch (err) {
      this.logger.error(`amendment-requested handler failed: ${String(err)}`)
    }
  }
}
