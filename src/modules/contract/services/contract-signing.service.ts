import { Injectable } from '@nestjs/common'
import { AuditEntityType, ContractStatus, NotificationType } from '@prisma/client'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { DomainEvent } from 'src/core/events/domain-events'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { AuditService } from 'src/modules/audit/audit.service'
import { AuthOtpService } from 'src/modules/auth/services/auth-otp.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { CONTRACT_SIGNABLE_STATUSES } from '../contract.constant'
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

  async signByMangakaWithOtp(contractId: string, loggedInUserId: string, loggedInUserEmail: string, otpCode: string) {
    if (!isObjectId(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.mangakaSignedAt) throw ContractErrors.AlreadySigned()
    if (!CONTRACT_SIGNABLE_STATUSES.includes(contract.status)) throw ContractErrors.NotSignableYet()
    if (contract.mangakaId !== loggedInUserId) throw ContractErrors.NotContractMangaka()

    await this.authOtpService.validateOtpCode({
      email: loggedInUserEmail,
      code: otpCode,
      purpose: 'SIGNING_CONTRACT'
    })
    const settled = await this.contractRepo.recordMangakaSignatureAndSettle(contractId)
    if ('settlementFailure' in settled) throw this.mapSettlementFailure(settled.settlementFailure)
    if (!settled.signed || !settled.contract) throw ContractErrors.AlreadySigned()
    const result = settled.contract
    await this.auditTransition(contractId, contract.status, result.status, loggedInUserId)
    if (settled.executedNow) {
      this.domainEventBus.emit(DomainEvent.ContractExecuted, { contractId: result.id, seriesId: result.seriesId })
    }
    return result
  }

  async signByBoardWithOtp(contractId: string, loggedInUserId: string, loggedInUserEmail: string, otpCode: string) {
    if (!isObjectId(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findWithBoardDecision(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.boardSignedAt) throw ContractErrors.AlreadySigned()
    if (!contract.boardDecision) throw ContractErrors.BoardDecisionNotFound()
    if (!CONTRACT_SIGNABLE_STATUSES.includes(contract.status)) throw ContractErrors.NotSignableYet()

    const allowedEditorIds = contract.boardDecision.boardSession.allowedEditorIds
    if (!allowedEditorIds.includes(loggedInUserId)) throw ContractErrors.NotAuthorizedInBoard()
    if (await this.contractRepo.findSpecificSignature(contractId, loggedInUserId)) {
      throw ContractErrors.BoardMemberAlreadySigned()
    }
    await this.authOtpService.validateOtpCode({
      email: loggedInUserEmail,
      code: otpCode,
      purpose: 'SIGNING_CONTRACT'
    })

    const totalRequiredSigns = allowedEditorIds.length || 0
    const settled = await this.contractRepo.recordBoardSignatureAndSettle(
      contractId,
      loggedInUserId,
      totalRequiredSigns
    )
    if ('settlementFailure' in settled) throw this.mapSettlementFailure(settled.settlementFailure)
    const result = settled.contract
    if (settled.boardCompletedNow) {
      await this.auditTransition(contractId, contract.status, result?.status ?? contract.status, loggedInUserId)
      if (result?.status === ContractStatus.ACTIVATION_PENDING) {
        return {
          status: 'ACTIVATION_PENDING',
          message: ContractMessages.response.replacementAwaitingActivation,
          contract: result
        }
      }
      if (settled.executedNow && result) {
        this.domainEventBus.emit(DomainEvent.ContractExecuted, { contractId: result.id, seriesId: result.seriesId })
      }
      if (result) {
        await Promise.all([
          this.notificationService.notifySafe({
            recipientId: contract.mangakaId,
            type: NotificationType.CONTRACT,
            referenceId: result.id,
            referenceType: 'CONTRACT_FULLY_EXECUTED',
            content: ContractMessages.notification.contractFullyExecutedMangaka
          }),
          this.notificationService.notifySafe({
            recipientId: contract.editorId ?? '',
            type: NotificationType.CONTRACT,
            referenceId: result.id,
            referenceType: 'CONTRACT_FULLY_EXECUTED',
            content: ContractMessages.notification.contractFullyExecutedEditor
          })
        ])
      }
      return {
        status: 'COMPLETED',
        message: ContractMessages.response.boardSignaturesCompleted,
        contract: result
      }
    }
    return {
      status: 'PENDING_MORE_SIGNATURES',
      message: ContractMessages.response.boardSignatureRecorded(settled.signatureCount, totalRequiredSigns),
      contract: result
    }
  }

  private mapSettlementFailure(
    failure: 'TRANSFER_REQUEST_MISSING_ORIGINAL_CONTRACT' | 'TRANSFER_REPLACEMENT_OUTBOX_UNAVAILABLE'
  ) {
    return failure === 'TRANSFER_REQUEST_MISSING_ORIGINAL_CONTRACT'
      ? ContractErrors.ReplacementActivationInvalid()
      : ContractErrors.ReplacementActivationUnavailable()
  }

  async checkContractStatus(contractId: string, currentUserId: string, currentUserRole: string) {
    if (!isObjectId(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.getContractSignaturesProgress(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (currentUserRole === 'MANGAKA' && contract.mangakaId !== currentUserId) {
      throw ContractErrors.NotContractMangaka()
    }
    if (!contract.boardDecision?.boardSession) throw ContractErrors.BoardDecisionNotFound()

    const allowedEditorIds = contract.boardDecision.boardSession.allowedEditorIds || []
    if (currentUserRole === 'BOARD_EDITOR' && !allowedEditorIds.includes(currentUserId)) {
      throw ContractErrors.NotAuthorizedInBoard()
    }
    const signedSignatures = contract.contractSignatures || []
    const signedEditors: Array<{ id: string; actionAt: Date }> = []
    const pendingEditors: Array<{ id: string; actionAt: null }> = []
    for (const managerId of allowedEditorIds) {
      const signature = signedSignatures.find((entry) => entry.userId === managerId)
      if (signature) signedEditors.push({ id: managerId, actionAt: signature.signedAt })
      else pendingEditors.push({ id: managerId, actionAt: null })
    }
    return {
      id: contract.id,
      status: contract.status,
      mangaka: {
        id: contract.mangakaId,
        isSigned: !!contract.mangakaSignedAt,
        signedAt: contract.mangakaSignedAt
      },
      boardProgress: {
        totalRequired: allowedEditorIds.length,
        totalSigned: signedEditors.length,
        signedEditors,
        pendingEditors
      }
    }
  }

  private async auditTransition(contractId: string, from: ContractStatus, to: ContractStatus, actorId: string | null) {
    try {
      await this.auditService.record({
        actorId,
        entityType: AuditEntityType.CONTRACT,
        entityId: contractId,
        action: 'TRANSITION',
        fromState: from,
        toState: to
      })
    } catch {
      // Audit is best-effort and must not roll back an already committed signature.
    }
  }
}
