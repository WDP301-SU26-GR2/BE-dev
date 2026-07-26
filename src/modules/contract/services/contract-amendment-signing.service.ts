import { Injectable } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { AuditService } from 'src/modules/audit/audit.service'
import { AuthOtpService } from 'src/modules/auth/services/auth-otp.service'
import { NotificationService } from 'src/modules/notification/notification.service'
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
    private readonly auditService: AuditService
  ) {}

  async signMangaka(contractId: string, id: string, userId: string, email: string, otpCode: string) {
    const amendment = await this.loadPending(contractId, id)
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.contractType === 'FULL_BUYOUT') throw ContractErrors.MangakaSignNotRequired()
    if (contract.mangakaId !== userId) throw ContractErrors.NotContractMangaka()
    await this.authOtpService.validateOtpCode({ email, code: otpCode, purpose: 'SIGNING_CONTRACT' })
    await this.amendmentRepo.update(id, { mangakaSignedAt: new Date() })
    const boardCount = await this.amendmentRepo.countBoardSignatures(id)
    const ctx = await this.contractRepo.findWithBoardDecision(contractId)
    const allowed = ctx?.boardDecision?.boardSession?.allowedEditorIds?.length ?? 0
    await this.maybeExecute(id, contractId, contract.contractType, allowed, boardCount, true, userId)
    return amendment
  }

  async signBoard(contractId: string, id: string, userId: string, email: string, otpCode: string) {
    const amendment = await this.loadPending(contractId, id)
    const ctx = await this.contractRepo.findWithBoardDecision(contractId)
    if (!ctx) throw ContractErrors.NotFound()
    if (!ctx.boardDecision) throw ContractErrors.BoardDecisionNotFound()
    const allowedIds = ctx.boardDecision.boardSession.allowedEditorIds
    if (!allowedIds.includes(userId)) throw ContractErrors.NotAuthorizedInBoard()
    if (await this.amendmentRepo.findSignature(id, userId)) throw ContractErrors.BoardMemberAlreadySigned()
    await this.authOtpService.validateOtpCode({ email, code: otpCode, purpose: 'SIGNING_CONTRACT' })
    await this.amendmentRepo.addBoardSignature(id, userId)
    const boardCount = await this.amendmentRepo.countBoardSignatures(id)
    if (boardCount >= allowedIds.length) await this.amendmentRepo.update(id, { boardSignedAt: new Date() })
    await this.maybeExecute(
      id,
      contractId,
      ctx.contractType,
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
