import { Injectable } from '@nestjs/common'
import {
  AuditEntityType,
  TransferContractSignature,
  TransferContractStatus,
  TransferRequestStatus
} from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { isUniqueConstrainError } from 'src/infrastructure/database/prisma-error.helper'
import { AuditService } from 'src/modules/audit/audit.service'
import { OtpPurpose } from 'src/modules/auth/auth.constant'
import { SignTransferContractBodyDto } from '../dto/transfer.dto'
import {
  InvalidTransferStateException,
  TransferAccessDeniedException,
  TransferContractNotFoundException,
  UserHasAlreadySignedContractException,
  UserOrEmailNotFoundException
} from '../errors/transfer.error'
import { TransferMessages } from '../transfer.messages'
import { TransferRepo } from '../transfer.repo'
import type { ActorContext } from '../transfer.types'
import { TransferAccessPolicy } from './transfer-access.policy'
import { TransferResourceLoader } from './transfer-resource-loader.service'
import { TransferTransactionService } from './transfer-transaction.service'

@Injectable()
export class TransferSigningService {
  constructor(
    private readonly repository: TransferRepo,
    private readonly auditService: AuditService,
    private readonly accessPolicy: TransferAccessPolicy,
    private readonly resourceLoader: TransferResourceLoader,
    private readonly transactions: TransferTransactionService
  ) {}

  async sign(id: string, actor: ActorContext, dto: SignTransferContractBodyDto) {
    const contract = await this.loadContract(id)
    if (!contract.transferRequestId || !contract.seriesId) throw TransferAccessDeniedException
    const transferRequestId = contract.transferRequestId
    const seriesId = contract.seriesId
    const request = await this.resourceLoader.loadRequest(transferRequestId)
    const role = this.accessPolicy.deriveSignerRole(actor, {
      fromMangakaId: contract.fromMangakaId ?? null,
      toMangakaId: contract.toMangakaId ?? null,
      boardMemberIds: await this.resourceLoader.boardMemberIds(request.boardDecisionId)
    })
    if (!role) throw TransferAccessDeniedException
    if (
      (contract.signatures ?? []).some(
        (signature: TransferContractSignature) => signature.userId === actor.userId && signature.role === role
      )
    ) {
      throw UserHasAlreadySignedContractException
    }

    const user = await this.repository.findUserById(actor.userId)
    if (!user?.email) throw UserOrEmailNotFoundException
    const expectedStatus = {
      MANGAKA_A: TransferContractStatus.DRAFT,
      MANGAKA_B: TransferContractStatus.A_SIGNED,
      BOARD: TransferContractStatus.B_SIGNED
    } as const
    if (contract.status !== expectedStatus[role]) throw InvalidTransferStateException

    const dependencies = this.transactions.require()
    try {
      await dependencies.uow.runInTransaction(async (context) => {
        await dependencies.otp.consumeSigningOtp(context, {
          email: user.email,
          code: dto.otpCode,
          purpose: OtpPurpose.SIGNING_CONTRACT
        })
        await this.repository.addSignatureInTransaction(context, id, actor.userId, role)
        if (role === 'MANGAKA_A') {
          await dependencies.contractState.transition(
            context,
            id,
            TransferContractStatus.DRAFT,
            TransferContractStatus.A_SIGNED
          )
        } else if (role === 'MANGAKA_B') {
          await dependencies.contractState.transition(
            context,
            id,
            TransferContractStatus.A_SIGNED,
            TransferContractStatus.B_SIGNED
          )
        } else {
          await this.finalizeBoardSignature(context, id, { ...contract, transferRequestId, seriesId }, dependencies)
        }
      })
    } catch (error) {
      if (isUniqueConstrainError(error)) throw UserHasAlreadySignedContractException
      throw error
    }
    await this.auditService.record({
      actorId: actor.userId,
      entityType: AuditEntityType.TRANSFER_REQUEST,
      entityId: transferRequestId,
      action: 'CONTRACT_SIGNED',
      reason: role
    })
    return { message: TransferMessages.response.signatureRecorded }
  }

  async getSignatures(id: string, actor: ActorContext) {
    const contract = await this.loadContract(id)
    if (!contract.transferRequestId || !contract.seriesId) throw TransferAccessDeniedException
    const request = await this.resourceLoader.loadRequest(contract.transferRequestId)
    const series = await this.repository.findSeriesAccessScope(contract.seriesId)
    if (
      !this.accessPolicy.canViewContract(actor, {
        fromMangakaId: contract.fromMangakaId ?? null,
        toMangakaId: contract.toMangakaId ?? null,
        editorId: series?.editorId ?? null,
        boardMemberIds: await this.resourceLoader.boardMemberIds(request.boardDecisionId)
      })
    ) {
      throw TransferAccessDeniedException
    }
    return {
      signatures: (contract.signatures ?? []).map((signature) => ({
        id: signature.id,
        transferContractId: signature.transferContractId,
        userId: signature.userId,
        role: signature.role,
        signedAt: signature.signedAt
      }))
    }
  }

  private async loadContract(id: string) {
    if (!isObjectId(id)) throw TransferContractNotFoundException
    const contract = await this.repository.findTransferContractById(id)
    if (!contract) throw TransferContractNotFoundException
    return contract
  }

  private async finalizeBoardSignature(
    context: Parameters<ReturnType<TransferTransactionService['require']>['contractState']['transition']>[0],
    id: string,
    contract: Awaited<ReturnType<TransferRepo['findTransferContractById']>> & {
      transferRequestId: string
      seriesId: string
    },
    dependencies: ReturnType<TransferTransactionService['require']>
  ) {
    await dependencies.contractState.transition(
      context,
      id,
      TransferContractStatus.B_SIGNED,
      TransferContractStatus.BOARD_SIGNED
    )
    await dependencies.contractState.transition(
      context,
      id,
      TransferContractStatus.BOARD_SIGNED,
      TransferContractStatus.FULLY_EXECUTED
    )
    await dependencies.series.transferOwnership(context, {
      seriesId: contract.seriesId,
      mangakaId: contract.toMangakaId!,
      coOwnerId: contract.transferType === 'PARTIAL_TRANSFER' ? contract.fromMangakaId! : null,
      coOwnerApprovalRequired: contract.transferType === 'PARTIAL_TRANSFER'
    })
    await dependencies.requestState.transition(
      context,
      contract.transferRequestId,
      TransferRequestStatus.AWAITING_TRANSFER_SIGNATURES,
      TransferRequestStatus.COMPLETED
    )
  }
}
