import { Injectable } from '@nestjs/common'
import { AuditEntityType, ContractStatus, NotificationType } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { AuditService } from 'src/modules/audit/audit.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import type { TransactionContext } from 'src/infrastructure/database/transaction-context'
import { canTransitionContract } from '../contract.constant'
import { ContractMessages } from '../contract.messages'
import { ContractRepo } from '../contract.repo'
import { AssignRepresentativeBodyDto, CreateContractCommentBodyDto, VoidContractBodyDto } from '../dto/contract.dto'
import { ContractErrors } from '../errors/contract.errors'
import { ContractRepresentativeService } from './contract-representative.service'

@Injectable()
export class ContractWorkflowService {
  constructor(
    private readonly contractRepo: ContractRepo,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly representativeService?: ContractRepresentativeService
  ) {}

  // Spec 2026-08-06 — Group F: Void contract draft
  async void(contractId: string, editorId: string, dto: VoidContractBodyDto) {
    if (!isObjectId(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.editorId !== editorId) throw ContractErrors.UnauthorizedEditor()
    this.assertTransition(contract.status, ContractStatus.VOIDED)

    const previousStatus = contract.status
    const voided = await this.contractRepo.updateStatus(contractId, ContractStatus.VOIDED)
    await this.auditTransition(contractId, previousStatus, ContractStatus.VOIDED, editorId, dto.reason)

    // Notify Mangaka only if contract was in BOARD_REVIEW (Mangaka knows about it)
    if (previousStatus === ContractStatus.BOARD_REVIEW && contract.mangakaId) {
      await this.notificationService.notifySafe({
        recipientId: contract.mangakaId,
        type: NotificationType.CONTRACT,
        referenceId: contractId,
        referenceType: 'CONTRACT_VOIDED',
        content: ContractMessages.notification.contractVoided
      })
    }

    // Notify roster if contract was in BOARD_REVIEW
    if (previousStatus === ContractStatus.BOARD_REVIEW) {
      const roster = await this.contractRepo.findRosterForContract(contractId)
      for (const recipientId of roster ?? []) {
        await this.notificationService.notifySafe({
          recipientId,
          type: NotificationType.CONTRACT,
          referenceId: contractId,
          referenceType: 'CONTRACT_VOIDED',
          content: ContractMessages.notification.contractVoided
        })
      }
    }

    return voided
  }

  async submitForReview(contractId: string, editorId: string) {
    if (!isObjectId(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.editorId !== editorId) throw ContractErrors.UnauthorizedEditor()
    this.assertTransition(contract.status, ContractStatus.BOARD_REVIEW)

    await this.contractRepo.updateStatus(contractId, ContractStatus.BOARD_REVIEW)
    const updated = await this.contractRepo.setBoardReviewStarted(contractId)
    const roster = await this.contractRepo.findRosterForContract(contractId)
    for (const recipientId of roster ?? []) {
      await this.notificationService.notifySafe({
        recipientId,
        type: NotificationType.CONTRACT,
        referenceId: contractId,
        referenceType: 'CONTRACT_REPRESENTATIVE_NEEDED',
        content: ContractMessages.notification.representativeNeeded
      })
    }
    await this.auditTransition(contractId, contract.status, ContractStatus.BOARD_REVIEW, editorId)
    return updated
  }

  async activateReplacementAndTerminateOriginal(
    context: TransactionContext,
    command: { originalContractId: string; replacementContractId: string }
  ): Promise<void> {
    this.assertTransition(ContractStatus.FULLY_EXECUTED, ContractStatus.TERMINATED)
    this.assertTransition(ContractStatus.ACTIVATION_PENDING, ContractStatus.FULLY_EXECUTED)

    const originalTransitioned = await this.contractRepo.compareAndSetStatusInTransaction(
      context,
      command.originalContractId,
      ContractStatus.FULLY_EXECUTED,
      ContractStatus.TERMINATED
    )
    if (!originalTransitioned) throw ContractErrors.InvalidContractTransition()

    const replacementTransitioned = await this.contractRepo.compareAndSetStatusInTransaction(
      context,
      command.replacementContractId,
      ContractStatus.ACTIVATION_PENDING,
      ContractStatus.FULLY_EXECUTED
    )
    if (!replacementTransitioned) throw ContractErrors.InvalidContractTransition()
  }

  claimRepresentative(contractId: string, userId: string) {
    return this.representatives.claim(contractId, userId)
  }

  releaseRepresentative(contractId: string, userId: string) {
    return this.representatives.release(contractId, userId)
  }

  assignRepresentative(contractId: string, adminId: string, dto: AssignRepresentativeBodyDto) {
    return this.representatives.assign(contractId, adminId, dto.representativeId)
  }

  addComment(contractId: string, userId: string, dto: CreateContractCommentBodyDto) {
    return this.representatives.addComment(contractId, userId, dto.content)
  }

  listComments(contractId: string, userId: string, roleName: string) {
    return this.representatives.listComments(contractId, userId, roleName)
  }

  private get representatives() {
    if (!this.representativeService) throw new Error('ContractRepresentativeService is not configured')
    return this.representativeService
  }

  private assertTransition(from: ContractStatus, to: ContractStatus) {
    if (!canTransitionContract(from, to)) throw ContractErrors.InvalidContractTransition()
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
      // Audit is best-effort and must not roll back an already committed transition.
    }
  }
}
