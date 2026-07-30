import { Injectable } from '@nestjs/common'
import { AuditEntityType, ContractStatus, NotificationType, type BoardDecisionResult } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { AuditService } from 'src/modules/audit/audit.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { BoardService } from 'src/modules/board/services/board.service'
import { canTransitionContract } from '../contract.constant'
import { ContractMessages } from '../contract.messages'
import { ContractRepo } from '../contract.repo'
import { ContractErrors } from '../errors/contract.errors'
import type { TransactionContext } from 'src/infrastructure/database/transaction-context'

@Injectable()
export class ContractWorkflowService {
  constructor(
    private readonly contractRepo: ContractRepo,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly boardService: BoardService
  ) {}

  updateStatusByWorkflow(contractId: string, userId: string, status: ContractStatus) {
    if (status === ContractStatus.MANGAKA_REVIEW) return this.sendToMangaka(contractId, userId)
    if (status === ContractStatus.MANGAKA_APPROVED) return this.mangakaApprove(contractId, userId)
    throw ContractErrors.InvalidStatus()
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

  async sendToMangaka(contractId: string, editorId: string) {
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.editorId !== editorId) throw ContractErrors.UnauthorizedEditor()
    this.assertTransition(contract.status, ContractStatus.MANGAKA_REVIEW)
    const updated = await this.contractRepo.updateStatus(contractId, ContractStatus.MANGAKA_REVIEW)
    await this.notificationService.notifySafe({
      recipientId: contract.mangakaId,
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'CONTRACT_SENT_TO_MANGAKA',
      content: ContractMessages.notification.contractSentToMangaka
    })
    await this.auditTransition(updated.id, contract.status, ContractStatus.MANGAKA_REVIEW, editorId)
    return updated
  }

  async mangakaApprove(contractId: string, userId: string) {
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.mangakaId !== userId) throw ContractErrors.NotContractMangaka()
    this.assertTransition(contract.status, ContractStatus.MANGAKA_APPROVED)
    const updated = await this.contractRepo.updateStatus(contractId, ContractStatus.MANGAKA_APPROVED)
    await this.auditTransition(contractId, contract.status, ContractStatus.MANGAKA_APPROVED, userId)
    await this.notificationService.notifySafe({
      recipientId: contract.editorId ?? '',
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'CONTRACT_MANGAKA_APPROVED',
      content: ContractMessages.notification.contractMangakaApproved
    })
    return updated
  }

  async mangakaRequestChanges(contractId: string, userId: string, reason: string) {
    if (!isObjectId(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.mangakaId !== userId) throw ContractErrors.NotContractMangaka()
    this.assertTransition(contract.status, ContractStatus.NEGOTIATION)
    const updated = await this.contractRepo.updateStatus(contractId, ContractStatus.NEGOTIATION)
    await this.auditTransition(contractId, contract.status, ContractStatus.NEGOTIATION, userId, reason)
    await this.notificationService.notifySafe({
      recipientId: contract.editorId ?? '',
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'CONTRACT_MANGAKA_REQUESTED_CHANGES',
      content: ContractMessages.notification.mangakaRequestedChanges(reason)
    })
    return updated
  }

  async boardApprove(contractId: string, userId: string, boardDecisionId: string) {
    const contract = await this.loadContractForBoardReview(contractId, userId, boardDecisionId, 'APPROVED')
    this.assertTransition(contract.status, ContractStatus.BOARD_APPROVED)
    const updated = await this.contractRepo.updateStatus(contractId, ContractStatus.BOARD_APPROVED)
    await this.auditTransition(contractId, contract.status, ContractStatus.BOARD_APPROVED, userId)
    await Promise.all([
      this.notificationService.notifySafe({
        recipientId: contract.mangakaId,
        type: NotificationType.CONTRACT,
        referenceId: updated.id,
        referenceType: 'CONTRACT_BOARD_APPROVED',
        content: ContractMessages.notification.boardApproved
      }),
      this.notificationService.notifySafe({
        recipientId: contract.editorId ?? '',
        type: NotificationType.CONTRACT,
        referenceId: updated.id,
        referenceType: 'CONTRACT_BOARD_APPROVED',
        content: ContractMessages.notification.boardApproved
      })
    ])
    return updated
  }

  async boardRequestChanges(contractId: string, userId: string, boardDecisionId: string, reason: string) {
    const contract = await this.loadContractForBoardReview(contractId, userId, boardDecisionId, 'REJECTED')
    this.assertTransition(contract.status, ContractStatus.NEGOTIATION)
    const updated = await this.contractRepo.updateStatus(contractId, ContractStatus.NEGOTIATION, {
      mangakaSignedAt: null,
      boardSignedAt: null
    })
    await this.auditTransition(contractId, contract.status, ContractStatus.NEGOTIATION, userId, reason)
    await this.notificationService.notifySafe({
      recipientId: contract.editorId ?? '',
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'CONTRACT_BOARD_REQUESTED_CHANGES',
      content: ContractMessages.notification.boardRequestedChanges(reason)
    })
    return updated
  }

  private assertTransition(from: ContractStatus, to: ContractStatus) {
    if (!canTransitionContract(from, to)) throw ContractErrors.InvalidContractTransition()
  }

  private async loadContractForBoardReview(
    contractId: string,
    userId: string,
    boardDecisionId: string,
    expectedResult: BoardDecisionResult
  ) {
    if (!isObjectId(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    const [decision, currentVersion] = await Promise.all([
      this.boardService.getContractDecisionContext(boardDecisionId),
      this.contractRepo.findLatestVersion(contractId)
    ])
    if (!decision) throw ContractErrors.ContractDecisionNotFound()
    if (!currentVersion) throw ContractErrors.InvalidContractDecision()
    const expectedResourceType = contract.sourceTransferRequestId ? 'REPLACEMENT_CONTRACT' : 'PUBLICATION_CONTRACT'
    const valid =
      decision.decisionType === 'CONTRACT' &&
      decision.result === expectedResult &&
      decision.targetSeriesId === contract.seriesId &&
      decision.details?.resourceId === contract.id &&
      decision.details?.resourceType === expectedResourceType &&
      decision.details?.versionId === currentVersion.id
    if (!valid) throw ContractErrors.InvalidContractDecision()
    if (!decision.allowedEditorIds.includes(userId)) throw ContractErrors.NotAuthorizedInBoard()
    return contract
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
