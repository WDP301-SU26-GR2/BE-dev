import { Injectable } from '@nestjs/common'
import {
  AssignFullBuyoutBodyDto,
  BoardDecisionTransferBodyDto,
  CreateTransferContractBodyDto,
  CreateTransferRequestBodyDto,
  SignTransferContractBodyDto
} from '../dto/transfer.dto'
import type { ActorContext } from '../transfer.types'
import { TransferContractQueryService } from './transfer-contract-query.service'
import { TransferContractService } from './transfer-contract.service'
import { TransferNegotiationService } from './transfer-negotiation.service'
import { TransferRequestService } from './transfer-request.service'
import { TransferSigningService } from './transfer-signing.service'

@Injectable()
export class TransferService {
  constructor(
    private readonly requestService: TransferRequestService,
    private readonly negotiationService: TransferNegotiationService,
    private readonly contractService: TransferContractService,
    private readonly signingService: TransferSigningService,
    private readonly contractQueryService: TransferContractQueryService
  ) {}

  createTransferRequest(requestingMangakaId: string, dto: CreateTransferRequestBodyDto) {
    return this.requestService.create(requestingMangakaId, dto)
  }

  getTransferRequestsByMangaka(mangakaId: string) {
    return this.requestService.listForMangaka(mangakaId)
  }

  getTransferRequestById(id: string, actor: ActorContext) {
    return this.requestService.findById(id, actor)
  }

  getPendingBoardRequests() {
    return this.requestService.listPendingBoard()
  }

  boardApproveScreening(id: string, actor: ActorContext, dto: BoardDecisionTransferBodyDto) {
    return this.requestService.boardApprove(id, actor, dto)
  }

  boardRejectScreening(id: string, actor: ActorContext, dto: BoardDecisionTransferBodyDto) {
    return this.requestService.boardReject(id, actor, dto)
  }

  boardAssignFullBuyout(id: string, actor: ActorContext, dto: AssignFullBuyoutBodyDto) {
    return this.contractService.assignFullBuyout(id, actor, dto)
  }

  startNegotiation(id: string, actor: ActorContext) {
    return this.negotiationService.start(id, actor)
  }

  mangakaAcceptTransfer(id: string, actor: ActorContext) {
    return this.negotiationService.review(id, actor, true)
  }

  mangakaRejectTransfer(id: string, actor: ActorContext) {
    return this.negotiationService.review(id, actor, false)
  }

  createTransferContract(actor: ActorContext, dto: CreateTransferContractBodyDto) {
    return this.contractService.create(actor, dto)
  }

  signTransferContract(id: string, actor: ActorContext, dto: SignTransferContractBodyDto) {
    return this.signingService.sign(id, actor, dto)
  }

  getSignatures(id: string, actor: ActorContext) {
    return this.contractQueryService.getSignatures(id, actor)
  }

  getTransferContractById(id: string, actor: ActorContext) {
    return this.contractQueryService.getContractById(id, actor)
  }
}
