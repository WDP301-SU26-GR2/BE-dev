import { Injectable } from '@nestjs/common'
import { AuditEntityType, ContractStatus, NotificationType } from '@prisma/client'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { DomainEvent } from 'src/core/events/domain-events'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { AuditService } from 'src/modules/audit/audit.service'
import { AuthOtpService } from 'src/modules/auth/services/auth-otp.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { ContractMessages } from '../contract.messages'
import { ContractRepo } from '../contract.repo'
import { ContractErrors } from '../errors/contract.errors'

@Injectable()
export class ContractSigningService {
  constructor(
    private readonly contractRepo: ContractRepo,
    private readonly authOtpService: AuthOtpService,
    private readonly notificationService: NotificationService,
    private readonly domainEventBus: DomainEventBus,
    private readonly auditService: AuditService
  ) {}

  async signByRepresentativeWithOtp(
    contractId: string,
    loggedInUserId: string,
    loggedInUserEmail: string,
    otpCode: string
  ) {
    if (!isObjectId(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.status !== ContractStatus.BOARD_REVIEW) throw ContractErrors.ContractNotInBoardReview()
    if (!contract.representativeId) throw ContractErrors.ContractNoRepresentative()
    if (contract.representativeId !== loggedInUserId) throw ContractErrors.NotContractRepresentative()

    await this.authOtpService.validateOtpCode({
      email: loggedInUserEmail,
      code: otpCode,
      purpose: 'SIGNING_CONTRACT'
    })
    const settled = await this.contractRepo.recordRepresentativeSignatureAndSettle(contractId, loggedInUserId)
    if (!settled.signed || !settled.contract) throw ContractErrors.ContractNotInBoardReview()
    await this.auditTransition(contractId, ContractStatus.BOARD_REVIEW, ContractStatus.AWAITING_MANGAKA, loggedInUserId)
    // Notify Mangaka with series title
    await this.notificationService.notifySafe({
      recipientId: contract.mangakaId,
      type: NotificationType.CONTRACT,
      referenceId: contractId,
      referenceType: 'CONTRACT_AWAITING_MANGAKA',
      content: ContractMessages.response.representativeSigned(contract.series?.title ?? '')
    })
    // Notify Editor
    if (contract.editorId) {
      await this.notificationService.notifySafe({
        recipientId: contract.editorId,
        type: NotificationType.CONTRACT,
        referenceId: contractId,
        referenceType: 'CONTRACT_REPRESENTATIVE_SIGNED',
        content: ContractMessages.notification.representativeSignedEditor
      })
    }
    return settled.contract
  }

  async signByMangakaWithOtp(contractId: string, loggedInUserId: string, loggedInUserEmail: string, otpCode: string) {
    if (!isObjectId(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.status !== ContractStatus.AWAITING_MANGAKA) throw ContractErrors.ContractNotAwaitingMangaka()
    if (contract.mangakaId !== loggedInUserId) throw ContractErrors.NotContractMangaka()

    await this.authOtpService.validateOtpCode({
      email: loggedInUserEmail,
      code: otpCode,
      purpose: 'SIGNING_CONTRACT'
    })
    const target = contract.sourceTransferRequestId ? ContractStatus.ACTIVATION_PENDING : ContractStatus.FULLY_EXECUTED
    const settled = await this.contractRepo.recordMangakaAcceptAndSettle(contractId, target)
    if ('settlementFailure' in settled) throw this.mapSettlementFailure(settled.settlementFailure)
    if (!settled.signed || !settled.contract) throw ContractErrors.ContractNotAwaitingMangaka()
    await this.auditTransition(contractId, ContractStatus.AWAITING_MANGAKA, target, loggedInUserId)
    if (target === ContractStatus.FULLY_EXECUTED) {
      this.domainEventBus.emit(DomainEvent.ContractExecuted, {
        contractId: settled.contract.id,
        seriesId: settled.contract.seriesId
      })
      await this.notifyExecuted(settled.contract)
    }
    return settled.contract
  }

  async rejectByMangaka(contractId: string, userId: string, reason: string) {
    if (!isObjectId(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.status !== ContractStatus.AWAITING_MANGAKA) throw ContractErrors.ContractNotAwaitingMangaka()
    if (contract.mangakaId !== userId) throw ContractErrors.NotContractMangaka()

    const updated = await this.contractRepo.updateStatus(contractId, ContractStatus.REJECTED_BY_MANGAKA, {
      rejectionReason: reason,
      mangakaRejectedAt: new Date()
    })
    await this.auditTransition(
      contractId,
      ContractStatus.AWAITING_MANGAKA,
      ContractStatus.REJECTED_BY_MANGAKA,
      userId,
      reason
    )
    if (contract.editorId) {
      await this.notificationService.notifySafe({
        recipientId: contract.editorId,
        type: NotificationType.CONTRACT,
        referenceId: contractId,
        referenceType: 'CONTRACT_REJECTED_BY_MANGAKA',
        content: ContractMessages.notification.mangakaRejected(reason)
      })
    }
    return updated
  }

  async checkContractStatus(contractId: string, currentUserId: string, currentUserRole: string) {
    if (!isObjectId(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (currentUserRole === 'MANGAKA' && contract.mangakaId !== currentUserId) {
      throw ContractErrors.NotContractMangaka()
    }
    return {
      id: contract.id,
      status: contract.status,
      mangaka: {
        id: contract.mangakaId,
        isSigned: !!contract.mangakaSignedAt,
        signedAt: contract.mangakaSignedAt
      },
      representative: {
        id: contract.representativeId ?? null,
        claimed: !!contract.representativeId,
        signed: !!contract.representativeSignedAt,
        signedAt: contract.representativeSignedAt ?? null
      }
    }
  }

  private mapSettlementFailure(
    failure: 'TRANSFER_REQUEST_MISSING_ORIGINAL_CONTRACT' | 'TRANSFER_REPLACEMENT_OUTBOX_UNAVAILABLE'
  ) {
    return failure === 'TRANSFER_REQUEST_MISSING_ORIGINAL_CONTRACT'
      ? ContractErrors.ReplacementActivationInvalid()
      : ContractErrors.ReplacementActivationUnavailable()
  }

  private async notifyExecuted(contract: { id: string; mangakaId: string; editorId: string | null }) {
    await Promise.all([
      this.notificationService.notifySafe({
        recipientId: contract.mangakaId,
        type: NotificationType.CONTRACT,
        referenceId: contract.id,
        referenceType: 'CONTRACT_FULLY_EXECUTED',
        content: ContractMessages.notification.contractFullyExecutedMangaka
      }),
      contract.editorId
        ? this.notificationService.notifySafe({
            recipientId: contract.editorId,
            type: NotificationType.CONTRACT,
            referenceId: contract.id,
            referenceType: 'CONTRACT_FULLY_EXECUTED',
            content: ContractMessages.notification.contractFullyExecutedEditor
          })
        : Promise.resolve()
    ])
  }

  private async auditTransition(
    contractId: string,
    from: ContractStatus,
    to: ContractStatus,
    actorId: string | null,
    reason?: string
  ) {
    try {
      await this.auditService.record({
        actorId,
        entityType: AuditEntityType.CONTRACT,
        entityId: contractId,
        action: 'TRANSITION',
        fromState: from,
        toState: to,
        reason
      })
    } catch {
      // Audit is best-effort and must not roll back an already committed signature.
    }
  }
}
