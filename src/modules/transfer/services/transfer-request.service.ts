import { Injectable } from '@nestjs/common'
import { $Enums, AuditEntityType, NotificationType, UserStatus } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { BoardDecisionTransferBodyDto, CreateTransferRequestBodyDto } from '../dto/transfer.dto'
import {
  ActiveTransferRequestAlreadyExistsException,
  InvalidStatusForScreeningException,
  InvalidTransferProposalException,
  NoActiveContractFoundException,
  RequesterAlreadyOwnsSeriesException,
  RequestingMangakaInactiveException,
  TransferAccessDeniedException
} from '../errors/transfer.error'
import { TRANSFER_REQUEST_STATUS } from '../transfer.constant'
import { TransferMessages } from '../transfer.messages'
import { TransferRepo } from '../transfer.repo'
import type { ActorContext } from '../transfer.types'
import { TransferAccessPolicy } from './transfer-access.policy'
import { TransferResourceLoader } from './transfer-resource-loader.service'
import { TransferTransactionService } from './transfer-transaction.service'

@Injectable()
export class TransferRequestService {
  constructor(
    private readonly repository: TransferRepo,
    private readonly auditService: AuditService,
    private readonly accessPolicy: TransferAccessPolicy,
    private readonly resourceLoader: TransferResourceLoader,
    private readonly transactions: TransferTransactionService,
    private readonly notifications: NotificationService
  ) {}

  async create(requestingMangakaId: string, dto: CreateTransferRequestBodyDto) {
    const [requestingMangaka, activeContract, activeRequest] = await Promise.all([
      this.repository.findUserById(requestingMangakaId),
      this.repository.findActiveContractBySeriesId(dto.seriesId),
      this.repository.findActiveTransferRequestBySeriesId(dto.seriesId)
    ])
    if (requestingMangaka?.status !== UserStatus.ACTIVE) throw RequestingMangakaInactiveException
    if (!activeContract) throw NoActiveContractFoundException
    if (activeContract.mangakaId === requestingMangakaId) throw RequesterAlreadyOwnsSeriesException
    // §v2 point 6: một series chỉ có tối đa 1 yêu cầu chuyển nhượng đang hoạt động.
    if (activeRequest) throw ActiveTransferRequestAlreadyExistsException
    this.assertValidProposal(activeContract.contractType, dto)
    return this.repository.createTransferRequest({
      seriesId: dto.seriesId,
      requestingMangakaId,
      originalMangakaId: activeContract.mangakaId,
      originalContractType: activeContract.contractType,
      proposedType: dto.proposedType,
      proposedPercentage: dto.proposedPercentage,
      planDescription: dto.planDescription,
      originalContractId: activeContract.id
    })
  }

  private assertValidProposal(contractType: $Enums.ContractType, dto: CreateTransferRequestBodyDto) {
    const percentage = dto.proposedPercentage
    const isPartial = dto.proposedType === $Enums.TransferType.PARTIAL_TRANSFER
    if (
      (contractType === $Enums.ContractType.FULL_BUYOUT && isPartial) ||
      (isPartial && (percentage == null || percentage <= 0 || percentage >= 100)) ||
      (!isPartial && percentage != null)
    ) {
      throw InvalidTransferProposalException
    }
  }

  async listForMangaka(mangakaId: string) {
    return { data: await this.repository.findTransferRequestsByMangaka(mangakaId) }
  }

  // §v2 point 3: Editor xem toàn bộ vòng đời request của series mình phụ trách (kèm lọc status tuỳ chọn).
  async listForEditor(editorId: string, status?: $Enums.TransferRequestStatus) {
    return { data: await this.repository.findTransferRequestsByEditor(editorId, status) }
  }

  async findById(id: string, actor: ActorContext) {
    const request = await this.resourceLoader.loadRequest(id)
    const resource = await this.resourceLoader.requestAccessResource(request)
    if (!this.accessPolicy.canViewRequest(actor, resource)) throw TransferAccessDeniedException
    return request
  }

  async listPendingBoard() {
    return { data: await this.repository.findPendingBoardRequests() }
  }

  boardApprove(id: string, actor: ActorContext, dto: BoardDecisionTransferBodyDto) {
    return this.screen(id, actor, dto, $Enums.BoardDecisionResult.APPROVED)
  }

  boardReject(id: string, actor: ActorContext, dto: BoardDecisionTransferBodyDto) {
    return this.screen(id, actor, dto, $Enums.BoardDecisionResult.REJECTED)
  }

  private async screen(
    id: string,
    actor: ActorContext,
    dto: BoardDecisionTransferBodyDto,
    result: $Enums.BoardDecisionResult
  ) {
    const request = await this.resourceLoader.loadRequest(id)
    const decision = await this.resourceLoader.resolveDecision(request, actor, dto, result)
    if (request.status !== TRANSFER_REQUEST_STATUS.SUBMITTED) throw InvalidStatusForScreeningException
    const target =
      result === $Enums.BoardDecisionResult.APPROVED
        ? TRANSFER_REQUEST_STATUS.UNDER_REVIEW
        : TRANSFER_REQUEST_STATUS.REJECTED_BY_BOARD
    const dependencies = this.transactions.require()
    const updated = await dependencies.uow.runInTransaction((context) =>
      dependencies.requestState.transition(context, id, request.status, target, { boardDecisionId: decision.id })
    )
    await this.auditService.record({
      actorId: actor.userId,
      entityType: AuditEntityType.TRANSFER_REQUEST,
      entityId: id,
      action: 'TRANSITION',
      fromState: request.status,
      toState: target
    })
    // §v2 point 4: báo kết quả sàng lọc cho các bên (SAU commit, best-effort). referenceId = request.id.
    await this.notifyScreeningOutcome(request, result === $Enums.BoardDecisionResult.APPROVED)
    return updated
  }

  private async notifyScreeningOutcome(
    request: { id: string; seriesId: string; requestingMangakaId: string; originalMangakaId: string },
    approved: boolean
  ) {
    const resource = await this.resourceLoader.requestAccessResource(request)
    const recipients = new Set<string>()
    if (resource.editorId) recipients.add(resource.editorId)
    recipients.add(request.requestingMangakaId)
    // Chỉ APPROVE mới báo Mangaka gốc — vì lúc này giai đoạn thương lượng (Revenue Share) mới bắt đầu.
    if (approved) recipients.add(request.originalMangakaId)
    for (const recipientId of recipients) {
      await this.notifications.notifySafe({
        recipientId,
        type: NotificationType.BOARD,
        referenceId: request.id,
        referenceType: approved ? 'TRANSFER_REQUEST_APPROVED' : 'TRANSFER_REQUEST_REJECTED',
        content: approved ? TransferMessages.notification.boardApproved : TransferMessages.notification.boardRejected
      })
    }
  }
}
