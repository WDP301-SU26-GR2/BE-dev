import { Injectable } from '@nestjs/common'
import { $Enums, AuditEntityType, UserStatus } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import { BoardDecisionTransferBodyDto, CreateTransferRequestBodyDto } from '../dto/transfer.dto'
import {
  InvalidStatusForScreeningException,
  InvalidTransferProposalException,
  NoActiveContractFoundException,
  RequesterAlreadyOwnsSeriesException,
  RequestingMangakaInactiveException,
  TransferAccessDeniedException
} from '../errors/transfer.error'
import { TRANSFER_REQUEST_STATUS } from '../transfer.constant'
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
    private readonly transactions: TransferTransactionService
  ) {}

  async create(requestingMangakaId: string, dto: CreateTransferRequestBodyDto) {
    const [requestingMangaka, activeContract] = await Promise.all([
      this.repository.findUserById(requestingMangakaId),
      this.repository.findActiveContractBySeriesId(dto.seriesId)
    ])
    if (requestingMangaka?.status !== UserStatus.ACTIVE) throw RequestingMangakaInactiveException
    if (!activeContract) throw NoActiveContractFoundException
    if (activeContract.mangakaId === requestingMangakaId) throw RequesterAlreadyOwnsSeriesException
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
    return updated
  }
}
