import { Injectable } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { ContractAmendmentRepo } from '../contract-amendment.repo'
import { ContractRepo } from '../contract.repo'
import { ContractErrors } from '../errors/contract.errors'
import { AuthOtpService } from 'src/modules/auth/services/auth-otp.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { AuditService } from 'src/modules/audit/audit.service'
import { RoleName } from 'src/core/security/constants/role.constant'
import type { CreateAmendmentBodyType, UpdateAmendmentBodyType } from '../schemas/contract-amendment-schema'
import { ContractMessages } from '../contract.messages'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class ContractAmendmentService {
  constructor(
    private readonly amendmentRepo: ContractAmendmentRepo,
    private readonly contractRepo: ContractRepo,
    private readonly authOtpService: AuthOtpService,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService
  ) {}

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

  private hasAnyTerm(a: {
    valuationAmount: unknown
    publisherOwnershipPct: unknown
    mangakaOwnershipPct: unknown
    terminationClause: unknown
    contractStart: unknown
    contractEnd: unknown
  }) {
    return (
      a.valuationAmount != null ||
      a.publisherOwnershipPct != null ||
      a.mangakaOwnershipPct != null ||
      a.terminationClause != null ||
      a.contractStart != null ||
      a.contractEnd != null
    )
  }

  async create(contractId: string, editorId: string, body: CreateAmendmentBodyType) {
    if (!OBJECT_ID_RE.test(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.status !== 'FULLY_EXECUTED') throw ContractErrors.ContractNotAmendable()
    if (contract.editorId !== editorId) throw ContractErrors.UnauthorizedEditor()
    // FULL_BUYOUT không cho đổi ownership sang tỉ lệ share
    if (
      contract.contractType === 'FULL_BUYOUT' &&
      body.mangakaOwnershipPct !== undefined &&
      body.mangakaOwnershipPct !== 0
    ) {
      throw ContractErrors.OwnershipMismatch()
    }
    const open = await this.amendmentRepo.findOpenByContract(contractId)
    if (open) throw ContractErrors.OpenAmendmentExists()

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

  async list(contractId: string, userId: string, roleName: string) {
    if (!OBJECT_ID_RE.test(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    this.assertCanView(contract, userId, roleName)
    return this.amendmentRepo.findManyByContract(contractId)
  }

  async detail(contractId: string, id: string, userId: string, roleName: string) {
    if (!OBJECT_ID_RE.test(contractId) || !OBJECT_ID_RE.test(id)) throw ContractErrors.AmendmentNotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    this.assertCanView(contract, userId, roleName)
    const amendment = await this.amendmentRepo.findById(id)
    if (!amendment || amendment.contractId !== contractId) throw ContractErrors.AmendmentNotFound()
    return amendment
  }

  private assertCanView(contract: { editorId: string | null; mangakaId: string }, userId: string, roleName: string) {
    if (roleName === RoleName.BOARD_MEMBER) return
    if (roleName === RoleName.EDITOR && contract.editorId === userId) return
    if (roleName === RoleName.MANGAKA && contract.mangakaId === userId) return
    throw ContractErrors.UnauthorizedEditor()
  }

  // Load amendment + gate editor + đúng contract. Trả {contract, amendment}.
  private async loadForEditor(contractId: string, id: string, editorId: string) {
    if (!OBJECT_ID_RE.test(contractId) || !OBJECT_ID_RE.test(id)) throw ContractErrors.AmendmentNotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.editorId !== editorId) throw ContractErrors.UnauthorizedEditor()
    const amendment = await this.amendmentRepo.findById(id)
    if (!amendment || amendment.contractId !== contractId) throw ContractErrors.AmendmentNotFound()
    return { contract, amendment }
  }

  async update(contractId: string, id: string, editorId: string, body: UpdateAmendmentBodyType) {
    const { contract, amendment } = await this.loadForEditor(contractId, id, editorId)
    if (amendment.status !== 'DRAFT') throw ContractErrors.AmendmentNotEditable()
    if (
      contract.contractType === 'FULL_BUYOUT' &&
      body.mangakaOwnershipPct !== undefined &&
      body.mangakaOwnershipPct !== 0
    ) {
      throw ContractErrors.OwnershipMismatch()
    }
    const data: Record<string, unknown> = {}
    if (body.changedClauses !== undefined) data.changedClauses = body.changedClauses
    if (body.reason !== undefined) data.reason = body.reason
    for (const [k, v] of Object.entries(this.termFields(body))) data[k] = v
    const updated = await this.amendmentRepo.update(id, data)
    await this.amendmentRepo.clearSignatures(id) // sửa term → mọi bên ký lại
    return updated
  }

  async submit(contractId: string, id: string, editorId: string) {
    const { amendment } = await this.loadForEditor(contractId, id, editorId)
    if (amendment.status !== 'DRAFT') throw ContractErrors.AmendmentNotSubmittable()
    if (!amendment.changedClauses?.length || !this.hasAnyTerm(amendment)) throw ContractErrors.AmendmentNoChanges()
    const updated = await this.amendmentRepo.update(id, { status: 'PENDING_SIGNATURES' })
    // notify bên ký
    const contract = await this.contractRepo.findWithBoardDecision(contractId)
    const recipients = contract?.contractType === 'REVENUE_SHARE' ? [contract.mangakaId] : []
    for (const rid of recipients) {
      await this.notificationService.notifySafe({
        recipientId: rid,
        type: NotificationType.CONTRACT,
        referenceId: id,
        referenceType: 'AMENDMENT_PENDING_SIGNATURES',
        content: ContractMessages.notification.amendmentPendingSignatures
      })
    }
    return updated
  }

  private async loadPending(contractId: string, id: string) {
    if (!OBJECT_ID_RE.test(contractId) || !OBJECT_ID_RE.test(id)) throw ContractErrors.AmendmentNotFound()
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
    const boardComplete = allowedCount > 0 && boardCount >= allowedCount
    const mangakaComplete = contractType === 'FULL_BUYOUT' || mangakaSigned
    if (!(boardComplete && mangakaComplete)) return
    const res = await this.amendmentRepo.executeAndApply(amendmentId, contractId, lastSignerId)
    if (res.applied) {
      await this.auditService.record({
        actorId: lastSignerId,
        entityType: 'CONTRACT',
        entityId: contractId,
        action: 'AMENDMENT_EXECUTED',
        toState: 'FULLY_EXECUTED',
        reason: `amendment ${amendmentId}`
      })
      const ctx = await this.contractRepo.findWithBoardDecision(contractId)
      const recipients = [ctx?.mangakaId, ctx?.editorId].filter((x): x is string => !!x)
      for (const rid of recipients) {
        await this.notificationService.notifySafe({
          recipientId: rid,
          type: NotificationType.CONTRACT,
          referenceId: contractId,
          referenceType: 'CONTRACT_AMENDED',
          content: ContractMessages.notification.contractAmended
        })
      }
    }
  }

  async signMangaka(contractId: string, id: string, userId: string, email: string, otpCode: string) {
    const amendment = await this.loadPending(contractId, id)
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.contractType === 'FULL_BUYOUT') throw ContractErrors.MangakaSignNotRequired()
    if (contract.mangakaId !== userId) throw ContractErrors.UnauthorizedEditor()

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

    const already = await this.amendmentRepo.findSignature(id, userId)
    if (already) throw ContractErrors.BoardMemberAlreadySigned()

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
      !!amendment?.mangakaSignedAt,
      userId
    )
    return amendment
  }

  async reject(contractId: string, id: string, userId: string, reason: string) {
    const amendment = await this.loadPending(contractId, id)
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.contractType === 'FULL_BUYOUT') throw ContractErrors.MangakaSignNotRequired()
    if (contract.mangakaId !== userId) throw ContractErrors.UnauthorizedEditor()
    const updated = await this.amendmentRepo.update(id, { status: 'DRAFT', reason })
    await this.amendmentRepo.clearSignatures(id)
    void amendment
    void updated
    await this.notificationService.notifySafe({
      recipientId: contract.editorId ?? '',
      type: NotificationType.CONTRACT,
      referenceId: id,
      referenceType: 'AMENDMENT_REJECTED',
      content: ContractMessages.notification.amendmentRejected
    })
    return updated
  }

  async void(contractId: string, id: string, editorId: string, voidReason: string) {
    const { amendment } = await this.loadForEditor(contractId, id, editorId)
    if (amendment.status === 'FULLY_EXECUTED' || amendment.status === 'VOIDED')
      throw ContractErrors.AmendmentNotVoidable()
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
}
