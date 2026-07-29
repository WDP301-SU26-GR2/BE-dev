import { Injectable } from '@nestjs/common'
import {
  AuditEntityType,
  NotificationType,
  TransferContractSignature,
  TransferContractStatus,
  TransferRequestStatus
} from '@prisma/client'
import { isUniqueConstrainError } from 'src/infrastructure/database/prisma-error.helper'
import { AuditService } from 'src/modules/audit/audit.service'
import { OtpPurpose } from 'src/modules/auth/auth.constant'
import { NotificationService } from 'src/modules/notification/notification.service'
import { SignTransferContractBodyDto } from '../dto/transfer.dto'
import {
  InvalidTransferStateException,
  TransferAccessDeniedException,
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
    private readonly transactions: TransferTransactionService,
    private readonly notifications: NotificationService
  ) {}

  async sign(id: string, actor: ActorContext, dto: SignTransferContractBodyDto) {
    const contract = await this.resourceLoader.loadContract(id)
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
    // §84: bàn giao lượt ký. Side-effect NGOÀI transaction, SAU commit (AGENTS §8).
    // Vòng ký BOARD là bước cuối (FULLY_EXECUTED) — settlement effects đã notify, không lặp ở đây.
    await this.notifyNextSigner(id, role, contract, request)
    return { message: TransferMessages.response.signatureRecorded }
  }

  private async notifyNextSigner(
    transferContractId: string,
    signedRole: 'MANGAKA_A' | 'MANGAKA_B' | 'BOARD',
    contract: { toMangakaId?: string | null },
    request: { boardDecisionId?: string | null }
  ): Promise<void> {
    const recipients =
      signedRole === 'MANGAKA_A'
        ? [contract.toMangakaId].filter((id): id is string => !!id)
        : signedRole === 'MANGAKA_B'
          ? await this.resourceLoader.boardMemberIds(request.boardDecisionId ?? undefined)
          : []
    for (const recipientId of recipients) {
      await this.notifications.notifySafe({
        recipientId,
        type: NotificationType.CONTRACT,
        referenceId: transferContractId,
        referenceType: 'TRANSFER_CONTRACT_AWAITING_SIGNATURE',
        content: TransferMessages.notification.awaitingYourSignature
      })
    }
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
