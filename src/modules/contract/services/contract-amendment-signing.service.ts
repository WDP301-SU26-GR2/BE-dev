import { Injectable } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { AuditService } from 'src/modules/audit/audit.service'
import { AuthOtpService } from 'src/modules/auth/services/auth-otp.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { BoardService, ContractDecisionContext } from 'src/modules/board/services/board.service'
import { ContractAmendmentRepo } from '../contract-amendment.repo'
import { ContractMessages } from '../contract.messages'
import { ContractRepo } from '../contract.repo'
import { ContractErrors } from '../errors/contract.errors'

@Injectable()
export class ContractAmendmentSigningService {
  constructor(
    private readonly amendmentRepo: ContractAmendmentRepo,
    private readonly contractRepo: ContractRepo,
    private readonly authOtpService: AuthOtpService,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly boardService: BoardService
  ) {}

  async signMangaka(contractId: string, id: string, userId: string, email: string, otpCode: string) {
    const amendment = await this.loadPending(contractId, id)
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.contractType === 'FULL_BUYOUT') throw ContractErrors.MangakaSignNotRequired()
    if (contract.mangakaId !== userId) throw ContractErrors.NotContractMangaka()
    const decision = await this.requireApprovalDecision(contract.seriesId, amendment.id)
    await this.authOtpService.validateOtpCode({ email, code: otpCode, purpose: 'SIGNING_CONTRACT' })
    await this.amendmentRepo.update(id, { mangakaSignedAt: new Date() })
    const boardCount = await this.amendmentRepo.countBoardSignatures(id)
    const allowed = decision.allowedEditorIds.length
    await this.maybeExecute(id, contractId, contract.contractType, allowed, boardCount, true, userId)
    return amendment
  }

  async signBoard(contractId: string, id: string, userId: string, email: string, otpCode: string) {
    const amendment = await this.loadPending(contractId, id)
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    const decision = await this.requireApprovalDecision(contract.seriesId, amendment.id)
    const allowedIds = decision.allowedEditorIds
    if (!allowedIds.includes(userId)) throw ContractErrors.NotAuthorizedInBoard()
    if (await this.amendmentRepo.findSignature(id, userId)) throw ContractErrors.BoardMemberAlreadySigned()
    await this.authOtpService.validateOtpCode({ email, code: otpCode, purpose: 'SIGNING_CONTRACT' })
    await this.amendmentRepo.addBoardSignature(id, userId)
    const boardCount = await this.amendmentRepo.countBoardSignatures(id)
    if (boardCount >= allowedIds.length) await this.amendmentRepo.update(id, { boardSignedAt: new Date() })
    await this.maybeExecute(
      id,
      contractId,
      contract.contractType,
      allowedIds.length,
      boardCount,
      !!amendment.mangakaSignedAt,
      userId
    )
    return amendment
  }

  async reject(contractId: string, id: string, userId: string, reason: string) {
    await this.loadPending(contractId, id)
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.contractType === 'FULL_BUYOUT') throw ContractErrors.MangakaSignNotRequired()
    if (contract.mangakaId !== userId) throw ContractErrors.NotContractMangaka()
    const updated = await this.amendmentRepo.update(id, { status: 'DRAFT', reason })
    await this.amendmentRepo.clearSignatures(id)
    await this.notificationService.notifySafe({
      recipientId: contract.editorId ?? '',
      type: NotificationType.CONTRACT,
      referenceId: id,
      referenceType: 'AMENDMENT_REJECTED',
      content: ContractMessages.notification.amendmentRejected
    })
    return updated
  }

  private async loadPending(contractId: string, id: string) {
    if (!isObjectId(contractId) || !isObjectId(id)) throw ContractErrors.AmendmentNotFound()
    const amendment = await this.amendmentRepo.findById(id)
    if (!amendment || amendment.contractId !== contractId) throw ContractErrors.AmendmentNotFound()
    if (amendment.status !== 'PENDING_SIGNATURES') throw ContractErrors.AmendmentNotPendingSignatures()
    return amendment
  }

  private async requireApprovalDecision(targetSeriesId: string, amendmentId: string): Promise<ContractDecisionContext> {
    const decision = await this.boardService.findApprovedContractDecisionContext({
      targetSeriesId,
      resourceType: 'CONTRACT_AMENDMENT',
      resourceId: amendmentId
    })
    if (!decision) throw ContractErrors.ContractApprovalDecisionRequired()
    return decision
  }

  private async maybeExecute(
    amendmentId: string,
    contractId: string,
    contractType: string,
    allowedCount: number,
    boardCount: number,
    mangakaSigned: boolean,
    lastSignerId: string
  ) {
    if (!(allowedCount > 0 && boardCount >= allowedCount && (contractType === 'FULL_BUYOUT' || mangakaSigned))) return
    const result = await this.amendmentRepo.executeAndApply(amendmentId, contractId, lastSignerId)
    if (!result.applied) return
    await this.auditService.record({
      actorId: lastSignerId,
      entityType: 'CONTRACT',
      entityId: contractId,
      action: 'AMENDMENT_EXECUTED',
      toState: 'FULLY_EXECUTED',
      reason: `amendment ${amendmentId}`
    })
    const contract = await this.contractRepo.findWithBoardDecision(contractId)
    const recipients = [contract?.mangakaId, contract?.editorId].filter((id): id is string => !!id)
    for (const recipientId of recipients) {
      await this.notificationService.notifySafe({
        recipientId,
        type: NotificationType.CONTRACT,
        referenceId: contractId,
        referenceType: 'CONTRACT_AMENDED',
        content: ContractMessages.notification.contractAmended
      })
    }
  }
}
