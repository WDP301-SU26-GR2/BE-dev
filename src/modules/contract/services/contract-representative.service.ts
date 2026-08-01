import { Injectable } from '@nestjs/common'
import { AuditEntityType, ContractStatus, NotificationType } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { RoleName } from 'src/core/security/constants/role.constant'
import { AuditService } from 'src/modules/audit/audit.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { ContractMessages } from '../contract.messages'
import { ContractRepo } from '../contract.repo'
import { ContractErrors } from '../errors/contract.errors'

@Injectable()
export class ContractRepresentativeService {
  constructor(
    private readonly contractRepo: ContractRepo,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService
  ) {}

  async claim(contractId: string, userId: string) {
    const contract = await this.loadBoardReviewContract(contractId)
    const roster = await this.loadRoster(contractId)
    if (!roster.includes(userId)) throw ContractErrors.NotInContractBoardRoster()

    const claimed = await this.contractRepo.claimRepresentative(contract.id, userId)
    if (!claimed) throw ContractErrors.ContractRepresentativeAlreadyClaimed()
    await this.auditSafe(contractId, userId, 'REPRESENTATIVE_CLAIMED')
    return claimed
  }

  async release(contractId: string, userId: string) {
    const contract = await this.loadBoardReviewContract(contractId)
    if (contract.representativeId !== userId) throw ContractErrors.NotContractRepresentative()
    const released = await this.contractRepo.releaseRepresentative(contractId, userId)
    if (!released) throw ContractErrors.ContractRepresentativeAlreadyClaimed()
    await this.auditSafe(contractId, userId, 'REPRESENTATIVE_RELEASED')
    return { message: ContractMessages.response.representativeReleased }
  }

  async assign(contractId: string, adminId: string, representativeId: string) {
    await this.loadBoardReviewContract(contractId)
    const roster = await this.loadRoster(contractId)
    if (!roster.includes(representativeId)) throw ContractErrors.NotInContractBoardRosterForAssignment()
    const updated = await this.contractRepo.assignRepresentative(contractId, representativeId)
    await this.notificationService.notifySafe({
      recipientId: representativeId,
      type: NotificationType.CONTRACT,
      referenceId: contractId,
      referenceType: 'CONTRACT_REPRESENTATIVE_ASSIGNED',
      content: ContractMessages.notification.representativeAssigned
    })
    await this.auditSafe(contractId, adminId, 'REPRESENTATIVE_ASSIGNED')
    return updated
  }

  async addComment(contractId: string, authorId: string, content: string) {
    await this.loadBoardReviewContract(contractId)
    const roster = await this.loadRoster(contractId)
    if (!roster.includes(authorId)) throw ContractErrors.NotInContractBoardRoster()
    return this.contractRepo.createComment(contractId, authorId, content)
  }

  async listComments(contractId: string, userId: string, roleName: string) {
    if (!isObjectId(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    const roster = await this.loadRoster(contractId)
    const allowed = roleName === RoleName.SUPER_ADMIN || contract.editorId === userId || roster.includes(userId)
    if (!allowed) throw ContractErrors.ContractAccessDenied()
    return { data: await this.contractRepo.findCommentsByContract(contractId) }
  }

  private async loadBoardReviewContract(contractId: string) {
    if (!isObjectId(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.status !== ContractStatus.BOARD_REVIEW) throw ContractErrors.ContractNotInBoardReview()
    return contract
  }

  private async loadRoster(contractId: string) {
    const roster = await this.contractRepo.findRosterForContract(contractId)
    if (!roster) throw ContractErrors.NotFound()
    return roster
  }

  private async auditSafe(contractId: string, actorId: string, action: string) {
    try {
      await this.auditService.record({
        actorId,
        entityType: AuditEntityType.CONTRACT,
        entityId: contractId,
        action
      })
    } catch {
      // Audit is best-effort and must not roll back the representative action.
    }
  }
}
