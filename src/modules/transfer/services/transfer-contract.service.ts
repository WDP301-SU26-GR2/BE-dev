import { Injectable } from '@nestjs/common'
import { $Enums, AuditEntityType, NotificationType, TransferRequestStatus } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { AssignFullBuyoutBodyDto, CreateTransferContractBodyDto } from '../dto/transfer.dto'
import {
  InvalidTransferStateException,
  OnlyAppliesToFullBuyoutException,
  OnlyAppliesToRevenueShareException,
  OriginalContractIdNotFoundException,
  TransferAccessDeniedException,
  ValuationRequiredException
} from '../errors/transfer.error'
import { TransferMessages } from '../transfer.messages'
import { TransferRepo } from '../transfer.repo'
import type { ActorContext } from '../transfer.types'
import { TransferAccessPolicy } from './transfer-access.policy'
import { TransferResourceLoader } from './transfer-resource-loader.service'
import { TransferTransactionService } from './transfer-transaction.service'

@Injectable()
export class TransferContractService {
  constructor(
    private readonly repository: TransferRepo,
    private readonly auditService: AuditService,
    private readonly accessPolicy: TransferAccessPolicy,
    private readonly resourceLoader: TransferResourceLoader,
    private readonly transactions: TransferTransactionService,
    private readonly notifications: NotificationService
  ) {}

  async assignFullBuyout(id: string, actor: ActorContext, dto: AssignFullBuyoutBodyDto) {
    const request = await this.resourceLoader.loadRequest(id)
    const decision = await this.resourceLoader.resolveDecision(
      request,
      actor,
      { boardDecisionId: request.boardDecisionId ?? undefined },
      $Enums.BoardDecisionResult.APPROVED
    )
    if (request.originalContractType !== 'FULL_BUYOUT') throw OnlyAppliesToFullBuyoutException
    if (!request.originalContractId) throw OriginalContractIdNotFoundException
    if (!dto.valuationAmount || dto.valuationAmount <= 0) throw ValuationRequiredException

    const dependencies = this.transactions.require()
    const replacement = await dependencies.uow.runInTransaction(async (context) => {
      const created = await dependencies.contracts.createReplacementDraft(context, {
        seriesId: request.seriesId,
        mangakaId: request.requestingMangakaId,
        editorId: request.originalContract?.editorId ?? null,
        editedById: actor.userId,
        boardDecisionId: decision.id,
        originalContractId: request.originalContractId!,
        sourceTransferRequestId: request.id,
        contractType: $Enums.ContractType.FULL_BUYOUT,
        valuationAmount: dto.valuationAmount,
        conditions: dto.conditions
      })
      await dependencies.requestState.transition(
        context,
        id,
        TransferRequestStatus.UNDER_REVIEW,
        TransferRequestStatus.AWAITING_REPLACEMENT_SIGNATURES
      )
      return created
    })
    await this.auditService.record({
      actorId: actor.userId,
      entityType: AuditEntityType.TRANSFER_REQUEST,
      entityId: id,
      action: 'TRANSITION',
      fromState: request.status,
      toState: TransferRequestStatus.AWAITING_REPLACEMENT_SIGNATURES
    })
    // §v2 point 8: createReplacementDraft tạo Contract THẲNG qua port, KHÔNG đi luồng notify hợp đồng thường.
    // Báo cho Mangaka mới (chờ ký), Editor, và Board roster (theo dõi tiến độ ký). SAU commit, best-effort.
    const boardRoster = decision.allowedEditorIds ?? []
    await this.notifyReplacementDrafted(replacement.id, [
      request.requestingMangakaId,
      request.originalContract?.editorId ?? null,
      ...boardRoster
    ])
    // §v2 point 7: trả replacementContractId + requestStatus để FE mở đúng hợp đồng thay thế (message nêu đúng thời điểm).
    return {
      message: TransferMessages.response.replacementContractCreated,
      replacementContractId: replacement.id,
      requestStatus: TransferRequestStatus.AWAITING_REPLACEMENT_SIGNATURES
    }
  }

  private async notifyReplacementDrafted(contractId: string, recipientIds: ReadonlyArray<string | null | undefined>) {
    const recipients = new Set(recipientIds.filter((id): id is string => Boolean(id)))
    for (const recipientId of recipients) {
      await this.notifications.notifySafe({
        recipientId,
        type: NotificationType.CONTRACT,
        referenceId: contractId,
        referenceType: 'TRANSFER_REPLACEMENT_CONTRACT_DRAFTED',
        content: TransferMessages.notification.replacementContractDrafted
      })
    }
  }

  async create(actor: ActorContext, dto: CreateTransferContractBodyDto) {
    const request = await this.resourceLoader.loadRequest(dto.transferRequestId)
    const resource = await this.resourceLoader.requestAccessResource(request)
    if (!this.accessPolicy.canManageNegotiation(actor, resource)) throw TransferAccessDeniedException
    // §v2 point 2: chỉ REVENUE_SHARE mới đi đường 3 bên; và BẮT BUỘC Mangaka gốc đã đồng ý (ACCEPTED).
    // Dù gọi API trực tiếp cũng không thể bỏ qua bước đồng thuận: UNDER_REVIEW không tạo được hợp đồng.
    if (request.originalContractType !== $Enums.ContractType.REVENUE_SHARE) throw OnlyAppliesToRevenueShareException
    if (request.status !== TransferRequestStatus.ACCEPTED) throw InvalidTransferStateException

    const dependencies = this.transactions.require()
    const created = await dependencies.uow.runInTransaction(async (context) => {
      const contract = await this.repository.createTransferContractInTransaction(context, {
        transferRequestId: request.id,
        seriesId: request.seriesId,
        fromMangakaId: request.originalMangakaId,
        toMangakaId: request.requestingMangakaId,
        transferType: dto.transferType,
        transferAmount: dto.transferAmount,
        newOwnershipSplit: dto.newOwnershipSplit,
        coOwnerApprovalRequired: dto.coOwnerApprovalRequired
      })
      await dependencies.requestState.transition(
        context,
        request.id,
        TransferRequestStatus.ACCEPTED,
        TransferRequestStatus.AWAITING_TRANSFER_SIGNATURES
      )
      return {
        ...contract,
        newOwnershipSplit: dto.newOwnershipSplit
      }
    })

    // Side-effect NGOÀI transaction, SAU commit (AGENTS §8). Trước §84 hai bên phải ký mà không hề
    // được báo là đã có bản hợp đồng — A ký trước (DRAFT→A_SIGNED) nên A là người tới lượt ngay.
    await this.notifySigners(created.id, [
      { recipientId: request.originalMangakaId, content: TransferMessages.notification.awaitingYourSignature },
      { recipientId: request.requestingMangakaId, content: TransferMessages.notification.contractDrafted }
    ])
    return created
  }

  private async notifySigners(
    transferContractId: string,
    targets: ReadonlyArray<{ recipientId: string | null | undefined; content: string }>
  ): Promise<void> {
    for (const target of targets) {
      if (!target.recipientId) continue
      await this.notifications.notifySafe({
        recipientId: target.recipientId,
        type: NotificationType.CONTRACT,
        referenceId: transferContractId,
        referenceType: 'TRANSFER_CONTRACT_DRAFTED',
        content: target.content
      })
    }
  }
}
