import { Injectable } from '@nestjs/common'
import { AuditEntityType, TransferRequestStatus } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import {
  OnlyAppliesToRevenueShareException,
  RequestNotInNegotiatingStageException,
  TransferAccessDeniedException
} from '../errors/transfer.error'
import { TRANSFER_REQUEST_STATUS } from '../transfer.constant'
import { TransferRepo } from '../transfer.repo'
import type { ActorContext } from '../transfer.types'
import { TransferAccessPolicy } from './transfer-access.policy'
import { TransferResourceLoader } from './transfer-resource-loader.service'
import { TransferTransactionService } from './transfer-transaction.service'

@Injectable()
export class TransferNegotiationService {
  constructor(
    private readonly repository: TransferRepo,
    private readonly auditService: AuditService,
    private readonly accessPolicy: TransferAccessPolicy,
    private readonly resourceLoader: TransferResourceLoader,
    private readonly transactions: TransferTransactionService
  ) {}

  async start(id: string, actor: ActorContext) {
    const request = await this.resourceLoader.loadRequest(id)
    const resource = await this.resourceLoader.requestAccessResource(request)
    if (!this.accessPolicy.canManageNegotiation(actor, resource)) throw TransferAccessDeniedException
    if (request.originalContractType !== 'REVENUE_SHARE') throw OnlyAppliesToRevenueShareException
    return this.transition(id, request.status, TRANSFER_REQUEST_STATUS.NEGOTIATING, actor.userId)
  }

  review(id: string, actor: ActorContext, accept: boolean) {
    return this.reviewByOriginalMangaka(id, actor, accept)
  }

  private async reviewByOriginalMangaka(id: string, actor: ActorContext, accept: boolean) {
    const request = await this.resourceLoader.loadRequest(id)
    const resource = await this.resourceLoader.requestAccessResource(request)
    if (!this.accessPolicy.canOriginalMangakaReview(actor, resource)) throw TransferAccessDeniedException
    if (request.status !== TRANSFER_REQUEST_STATUS.NEGOTIATING) throw RequestNotInNegotiatingStageException
    return this.transition(
      id,
      request.status,
      accept ? TRANSFER_REQUEST_STATUS.UNDER_REVIEW : TRANSFER_REQUEST_STATUS.REJECTED_BY_ORIGINAL_MANGAKA,
      actor.userId
    )
  }

  private async transition(id: string, from: TransferRequestStatus, to: TransferRequestStatus, actorId: string) {
    const dependencies = this.transactions.require()
    const updated = await dependencies.uow.runInTransaction((context) =>
      dependencies.requestState.transition(context, id, from, to)
    )
    await this.auditService.record({
      actorId,
      entityType: AuditEntityType.TRANSFER_REQUEST,
      entityId: id,
      action: 'TRANSITION',
      fromState: from,
      toState: to
    })
    return updated
  }
}
