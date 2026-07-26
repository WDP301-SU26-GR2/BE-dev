import { Injectable } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { AuditService } from 'src/modules/audit/audit.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { ContractAmendmentRepo } from '../contract-amendment.repo'
import { ContractMessages } from '../contract.messages'
import { ContractRepo } from '../contract.repo'
import { ContractErrors } from '../errors/contract.errors'
import { CreateAmendmentBodyType, UpdateAmendmentBodyType } from '../schemas/contract-amendment-schema'

@Injectable()
export class ContractAmendmentDraftService {
  constructor(
    private readonly amendmentRepo: ContractAmendmentRepo,
    private readonly contractRepo: ContractRepo,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService
  ) {}

  async create(contractId: string, editorId: string, body: CreateAmendmentBodyType) {
    if (!isObjectId(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.status !== 'FULLY_EXECUTED') throw ContractErrors.ContractNotAmendable()
    if (contract.editorId !== editorId) throw ContractErrors.UnauthorizedEditor()
    this.assertOwnership(contract.contractType, body.mangakaOwnershipPct)
    if (await this.amendmentRepo.findOpenByContract(contractId)) throw ContractErrors.OpenAmendmentExists()
    const amendment = await this.amendmentRepo.create({
      contractId,
      changedClauses: body.changedClauses,
      reason: body.reason ?? null,
      status: 'DRAFT',
      triggerSource: 'MANUAL',
      createdBy: editorId,
      ...this.termFields(body)
    })
    if (contract.contractType === 'REVENUE_SHARE') {
      await this.notificationService.notifySafe({
        recipientId: contract.mangakaId,
        type: NotificationType.CONTRACT,
        referenceId: amendment.id,
        referenceType: 'AMENDMENT_CREATED',
        content: ContractMessages.notification.amendmentCreated
      })
    }
    return amendment
  }

  async update(contractId: string, id: string, editorId: string, body: UpdateAmendmentBodyType) {
    const { contract, amendment } = await this.loadForEditor(contractId, id, editorId)
    if (amendment.status !== 'DRAFT') throw ContractErrors.AmendmentNotEditable()
    this.assertOwnership(contract.contractType, body.mangakaOwnershipPct)
    const data: Record<string, unknown> = {}
    if (body.changedClauses !== undefined) data.changedClauses = body.changedClauses
    if (body.reason !== undefined) data.reason = body.reason
    for (const [key, value] of Object.entries(this.termFields(body))) data[key] = value
    const updated = await this.amendmentRepo.update(id, data)
    await this.amendmentRepo.clearSignatures(id)
    return updated
  }

  async submit(contractId: string, id: string, editorId: string) {
    const { amendment } = await this.loadForEditor(contractId, id, editorId)
    if (amendment.status !== 'DRAFT') throw ContractErrors.AmendmentNotSubmittable()
    if (!amendment.changedClauses?.length || !this.hasAnyTerm(amendment)) throw ContractErrors.AmendmentNoChanges()
    const updated = await this.amendmentRepo.update(id, { status: 'PENDING_SIGNATURES' })
    const contract = await this.contractRepo.findWithBoardDecision(contractId)
    if (contract?.contractType === 'REVENUE_SHARE') {
      await this.notificationService.notifySafe({
        recipientId: contract.mangakaId,
        type: NotificationType.CONTRACT,
        referenceId: id,
        referenceType: 'AMENDMENT_PENDING_SIGNATURES',
        content: ContractMessages.notification.amendmentPendingSignatures
      })
    }
    return updated
  }

  async void(contractId: string, id: string, editorId: string, voidReason: string) {
    const { amendment } = await this.loadForEditor(contractId, id, editorId)
    if (amendment.status === 'FULLY_EXECUTED' || amendment.status === 'VOIDED') {
      throw ContractErrors.AmendmentNotVoidable()
    }
    const updated = await this.amendmentRepo.update(id, { status: 'VOIDED', voidReason })
    await this.auditService.record({
      actorId: editorId,
      entityType: 'CONTRACT',
      entityId: contractId,
      action: 'AMENDMENT_VOIDED',
      toState: 'VOIDED',
      reason: voidReason
    })
    return updated
  }

  private async loadForEditor(contractId: string, id: string, editorId: string) {
    if (!isObjectId(contractId) || !isObjectId(id)) throw ContractErrors.AmendmentNotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.editorId !== editorId) throw ContractErrors.UnauthorizedEditor()
    const amendment = await this.amendmentRepo.findById(id)
    if (!amendment || amendment.contractId !== contractId) throw ContractErrors.AmendmentNotFound()
    return { contract, amendment }
  }

  private assertOwnership(contractType: string, mangakaOwnershipPct?: number) {
    if (contractType === 'FULL_BUYOUT' && mangakaOwnershipPct !== undefined && mangakaOwnershipPct !== 0) {
      throw ContractErrors.OwnershipMismatch()
    }
  }

  private termFields(body: Partial<CreateAmendmentBodyType>) {
    return {
      valuationAmount: body.valuationAmount ?? null,
      publisherOwnershipPct: body.publisherOwnershipPct ?? null,
      mangakaOwnershipPct: body.mangakaOwnershipPct ?? null,
      terminationClause: body.terminationClause ?? null,
      contractStart: body.contractStart ?? null,
      contractEnd: body.contractEnd ?? null
    }
  }

  private hasAnyTerm(amendment: {
    valuationAmount: unknown
    publisherOwnershipPct: unknown
    mangakaOwnershipPct: unknown
    terminationClause: unknown
    contractStart: unknown
    contractEnd: unknown
  }) {
    return [
      amendment.valuationAmount,
      amendment.publisherOwnershipPct,
      amendment.mangakaOwnershipPct,
      amendment.terminationClause,
      amendment.contractStart,
      amendment.contractEnd
    ].some((value) => value != null)
  }
}
