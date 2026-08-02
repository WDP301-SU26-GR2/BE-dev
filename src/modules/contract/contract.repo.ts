import { Injectable } from '@nestjs/common'
import {
  Contract,
  ContractStatus,
  ContractVersion,
  OutboxEventType,
  PaymentConditionStatus,
  Prisma,
  UserStatus
} from '@prisma/client'
import { USER_MINI_FIELDS, fetchUserMiniMap, toUserMini, type UserMiniType } from 'src/core/models/user-mini.model'
import { RoleName } from 'src/core/security/constants/role.constant'
import { OutboxRepo } from 'src/infrastructure/database/outbox.repo'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { isUniqueConstrainError } from 'src/infrastructure/database/prisma-error.helper'
import type { TransactionContext } from 'src/infrastructure/database/transaction-context'
import { transactionClient } from 'src/infrastructure/database/transaction-context'
import { CreateContractBodyType } from './schemas/contract-schema'

export type ContractSettlementFailure =
  | 'TRANSFER_REQUEST_MISSING_ORIGINAL_CONTRACT'
  | 'TRANSFER_REPLACEMENT_OUTBOX_UNAVAILABLE'

class ContractSettlementInvariantError extends Error {
  constructor(readonly reason: ContractSettlementFailure) {
    super(reason)
  }
}

@Injectable()
export class ContractRepo {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox?: OutboxRepo
  ) {}

  findSeriesForContractCreation(seriesId: string) {
    return this.prisma.series.findUnique({
      where: { id: seriesId },
      select: { id: true, mangakaId: true, status: true }
    })
  }

  findBoardDecisionForContractCreation(boardDecisionId: string) {
    return this.prisma.boardDecision.findUnique({
      where: { id: boardDecisionId },
      select: { id: true, targetSeriesId: true, decisionType: true, result: true }
    })
  }

  findBlockingContractForCreation(seriesId: string, boardDecisionId: string, statuses: ContractStatus[]) {
    return this.prisma.contract.findFirst({
      where: {
        status: { in: statuses },
        OR: [{ seriesId }, { boardDecisionId }]
      },
      select: { id: true }
    })
  }

  createDraft(editorId: string, dto: CreateContractBodyType): Promise<Contract> {
    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.create({
        data: {
          ...dto,
          editorId,
          status: ContractStatus.DRAFT
        }
      })
      await tx.contractVersion.create({
        data: {
          contractId: contract.id,
          versionNumber: 1,
          valuationAmount: contract.valuationAmount,
          publisherOwnershipPct: contract.publisherOwnershipPct,
          mangakaOwnershipPct: contract.mangakaOwnershipPct,
          terminationClause: contract.terminationClause,
          editedById: editorId,
          createdAt: new Date()
        }
      })
      return contract
    })
  }

  async findById(id: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        versions: true,
        series: { select: { id: true, title: true } },
        boardDecision: {
          select: {
            id: true,
            decisionType: true,
            result: true,
            decidedAt: true,
            boardSession: { select: { id: true, title: true, startTime: true, allowedEditorIds: true } }
          }
        },
        mangaka: { select: USER_MINI_FIELDS },
        editor: { select: USER_MINI_FIELDS }
      }
    })
    if (!contract) return null
    const representative = await this.fetchRepresentative(contract.representativeId)
    return {
      ...contract,
      series: { id: contract.series.id, title: contract.series.title },
      mangaka: toUserMini(contract.mangaka),
      editor: contract.editor ? toUserMini(contract.editor) : null,
      representative
    }
  }

  async findManyByViewer(userId: string, roleName: string) {
    const where =
      roleName === RoleName.EDITOR ? { editorId: userId } : roleName === RoleName.MANGAKA ? { mangakaId: userId } : {}

    const rows = await this.prisma.contract.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        series: { select: { id: true, title: true } },
        boardDecision: {
          select: {
            id: true,
            decisionType: true,
            result: true,
            decidedAt: true,
            boardSession: { select: { id: true, title: true, startTime: true, allowedEditorIds: true } }
          }
        },
        mangaka: { select: USER_MINI_FIELDS },
        editor: { select: USER_MINI_FIELDS }
      }
    })
    const representatives = await fetchUserMiniMap(
      this.prisma,
      rows.map((contract) => contract.representativeId)
    )
    return rows.map((contract) => ({
      ...contract,
      series: { id: contract.series.id, title: contract.series.title },
      mangaka: toUserMini(contract.mangaka),
      editor: contract.editor ? toUserMini(contract.editor) : null,
      representative: contract.representativeId ? (representatives.get(contract.representativeId) ?? null) : null
    }))
  }

  async findByIdForPdf(id: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        series: { select: { id: true, title: true, magazine: true } },
        mangaka: { select: USER_MINI_FIELDS },
        editor: { select: USER_MINI_FIELDS },
        boardDecision: {
          select: {
            id: true,
            decisionType: true,
            result: true,
            decidedAt: true,
            boardSession: { select: { title: true, startTime: true } }
          }
        },
        conditions: true,
        versions: { orderBy: { versionNumber: 'desc' } },
        amendments: { select: { status: true, fullyExecutedAt: true } }
      }
    })
    if (!contract) return null
    return {
      ...contract,
      mangaka: toUserMini(contract.mangaka),
      editor: contract.editor ? toUserMini(contract.editor) : null,
      representative: await this.fetchRepresentative(contract.representativeId)
    }
  }

  findWithBoardDecision(contractId: string) {
    return this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        boardDecision: {
          include: {
            boardSession: {
              select: { allowedEditorIds: true }
            }
          }
        }
      }
    })
  }

  findVersionsByContractId(contractId: string): Promise<ContractVersion[]> {
    return this.prisma.contractVersion.findMany({
      where: { contractId },
      orderBy: { versionNumber: 'asc' }
    })
  }

  findVersionById(contractId: string, versionId: string): Promise<ContractVersion | null> {
    return this.prisma.contractVersion.findFirst({
      where: { id: versionId, contractId }
    })
  }

  findLatestVersion(contractId: string): Promise<ContractVersion | null> {
    return this.prisma.contractVersion.findFirst({
      where: { contractId },
      orderBy: { versionNumber: 'desc' }
    })
  }

  private async nextVersionNumber(tx: Prisma.TransactionClient, contractId: string): Promise<number> {
    const latest = await tx.contractVersion.findFirst({
      where: { contractId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true }
    })
    return (latest?.versionNumber ?? 0) + 1
  }

  private async withVersionRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn()
      } catch (error) {
        if (!isUniqueConstrainError(error)) throw error
        lastError = error
      }
    }
    throw lastError
  }

  async updateAndLogVersion(
    contractId: string,
    data: Prisma.ContractUpdateInput,
    editedById: string,
    note?: string
  ): Promise<Contract> {
    return this.withVersionRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const updatedContract = await tx.contract.update({
          where: { id: contractId },
          data
        })

        await tx.contractVersion.create({
          data: {
            contractId,
            versionNumber: await this.nextVersionNumber(tx, contractId),
            valuationAmount: updatedContract.valuationAmount,
            publisherOwnershipPct: updatedContract.publisherOwnershipPct,
            mangakaOwnershipPct: updatedContract.mangakaOwnershipPct,
            terminationClause: updatedContract.terminationClause,
            editedById,
            note,
            createdAt: new Date()
          }
        })

        return updatedContract
      })
    )
  }

  updateStatus(id: string, status: ContractStatus, additionalData: Prisma.ContractUpdateInput = {}): Promise<Contract> {
    return this.prisma.contract.update({
      where: { id },
      data: { status, ...additionalData }
    })
  }

  async compareAndSetStatusInTransaction(
    context: TransactionContext,
    id: string,
    expected: ContractStatus,
    target: ContractStatus
  ): Promise<boolean> {
    const result = await transactionClient(context).contract.updateMany({
      where: { id, status: expected },
      data: { status: target }
    })
    return result.count === 1
  }

  async findRosterForContract(contractId: string): Promise<string[] | null> {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        boardDecision: {
          select: {
            boardSession: {
              select: { allowedEditorIds: true }
            }
          }
        }
      }
    })
    return contract?.boardDecision?.boardSession?.allowedEditorIds ?? null
  }

  async claimRepresentative(contractId: string, userId: string) {
    const result = await this.prisma.contract.updateMany({
      where: { id: contractId, status: ContractStatus.BOARD_REVIEW, representativeId: { isSet: false } },
      data: { representativeId: userId }
    })
    if (result.count !== 1) return null
    return this.findById(contractId)
  }

  async releaseRepresentative(contractId: string, userId: string): Promise<boolean> {
    const result = await this.prisma.contract.updateMany({
      where: {
        id: contractId,
        representativeId: userId,
        OR: [{ representativeSignedAt: null }, { representativeSignedAt: { isSet: false } }]
      },
      data: { representativeId: { unset: true } }
    })
    return result.count === 1
  }

  assignRepresentative(contractId: string, userId: string) {
    return this.prisma.contract.update({
      where: { id: contractId },
      data: { representativeId: userId }
    })
  }

  setBoardReviewStarted(contractId: string) {
    return this.prisma.contract.update({
      where: { id: contractId },
      data: { boardReviewStartedAt: new Date() }
    })
  }

  async recordRepresentativeSignatureAndSettle(contractId: string, userId: string) {
    const result = await this.prisma.contract.updateMany({
      where: {
        id: contractId,
        status: ContractStatus.BOARD_REVIEW,
        representativeId: userId,
        OR: [{ representativeSignedAt: null }, { representativeSignedAt: { isSet: false } }]
      },
      data: { status: ContractStatus.AWAITING_MANGAKA, representativeSignedAt: new Date() }
    })
    if (result.count !== 1) return { signed: false as const, contract: null }
    return { signed: true as const, contract: await this.findById(contractId) }
  }

  async recordMangakaAcceptAndSettle(contractId: string, target: ContractStatus) {
    return this.withSettlementFailure(() =>
      this.prisma.$transaction(async (tx) => {
        const result = await tx.contract.updateMany({
          where: {
            id: contractId,
            status: ContractStatus.AWAITING_MANGAKA,
            OR: [{ mangakaSignedAt: null }, { mangakaSignedAt: { isSet: false } }]
          },
          data: { status: target, mangakaSignedAt: new Date() }
        })
        if (result.count !== 1) return { signed: false as const, executedNow: false, contract: null }

        if (target === ContractStatus.ACTIVATION_PENDING) {
          await this.enqueueReplacementReady(tx, contractId)
        }

        const contract = await tx.contract.findUnique({ where: { id: contractId } })
        return { signed: true as const, executedNow: target === ContractStatus.FULLY_EXECUTED, contract }
      })
    )
  }

  async redraftClone(sourceContractId: string, editorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.contract.findUnique({
        where: { id: sourceContractId },
        include: { conditions: true }
      })
      if (!source) return null
      const created = await tx.contract.create({
        data: {
          seriesId: source.seriesId,
          mangakaId: source.mangakaId,
          editorId: source.editorId,
          boardDecisionId: source.boardDecisionId,
          sourceTransferRequestId: source.sourceTransferRequestId,
          supersedesContractId: source.id,
          contractType: source.contractType,
          valuationAmount: source.valuationAmount,
          publisherOwnershipPct: source.publisherOwnershipPct,
          mangakaOwnershipPct: source.mangakaOwnershipPct,
          terminationClause: source.terminationClause,
          contractStart: source.contractStart,
          contractEnd: source.contractEnd,
          status: ContractStatus.DRAFT,
          conditions: {
            create: source.conditions
              .filter((condition) => condition.status !== PaymentConditionStatus.DISABLED)
              .map((condition) => ({
                conditionType: condition.conditionType,
                thresholdConfig: condition.thresholdConfig ?? undefined,
                payoutAmount: condition.payoutAmount,
                payoutPct: condition.payoutPct,
                isRecurring: condition.isRecurring,
                status: PaymentConditionStatus.PENDING
              }))
          }
        }
      })
      await tx.contractVersion.create({
        data: {
          contractId: created.id,
          versionNumber: 1,
          valuationAmount: created.valuationAmount,
          publisherOwnershipPct: created.publisherOwnershipPct,
          mangakaOwnershipPct: created.mangakaOwnershipPct,
          terminationClause: created.terminationClause,
          editedById: editorId,
          createdAt: new Date()
        }
      })
      return created
    })
  }

  createComment(contractId: string, authorId: string, content: string) {
    return this.prisma.contractComment.create({
      data: { contractId, authorId, content }
    })
  }

  async findCommentsByContract(contractId: string) {
    const comments = await this.prisma.contractComment.findMany({
      where: { contractId },
      orderBy: { createdAt: 'asc' }
    })
    const authors = await fetchUserMiniMap(
      this.prisma,
      comments.map((comment) => comment.authorId)
    )
    return comments.map((comment) => ({
      ...comment,
      author: authors.get(comment.authorId) ?? null
    }))
  }

  findStaleUnclaimedBoardReview(cutoff: Date) {
    return this.prisma.contract.findMany({
      where: {
        status: ContractStatus.BOARD_REVIEW,
        representativeId: { isSet: false },
        boardReviewStartedAt: { lt: cutoff }
      },
      select: { id: true, editorId: true, mangakaId: true }
    })
  }

  findSuperAdminIds() {
    return this.prisma.user
      .findMany({
        where: { status: UserStatus.ACTIVE, role: { code: RoleName.SUPER_ADMIN } },
        select: { id: true }
      })
      .then((rows) => rows.map((row) => row.id))
  }

  voidNonExecutedContractsBySeries(seriesId: string) {
    return this.prisma.contract.updateMany({
      where: {
        seriesId,
        status: { in: [ContractStatus.DRAFT, ContractStatus.BOARD_REVIEW, ContractStatus.AWAITING_MANGAKA] }
      },
      data: { status: ContractStatus.VOIDED }
    })
  }

  private async withSettlementFailure<T>(
    operation: () => Promise<T>
  ): Promise<T | { settlementFailure: ContractSettlementFailure }> {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof ContractSettlementInvariantError) return { settlementFailure: error.reason }
      throw error
    }
  }

  private async enqueueReplacementReady(tx: Prisma.TransactionClient, contractId: string) {
    const candidate = await tx.contract.findUnique({
      where: { id: contractId },
      select: { sourceTransferRequestId: true }
    })
    if (!candidate?.sourceTransferRequestId) return

    const request = await tx.transferRequest.findUnique({
      where: { id: candidate.sourceTransferRequestId },
      select: {
        id: true,
        originalContractId: true,
        seriesId: true,
        requestingMangakaId: true
      }
    })
    if (!request?.originalContractId) {
      throw new ContractSettlementInvariantError('TRANSFER_REQUEST_MISSING_ORIGINAL_CONTRACT')
    }
    if (!this.outbox) {
      throw new ContractSettlementInvariantError('TRANSFER_REPLACEMENT_OUTBOX_UNAVAILABLE')
    }
    await this.outbox.enqueueWithClient(tx, {
      type: OutboxEventType.TRANSFER_REPLACEMENT_READY,
      aggregateId: request.id,
      payload: {
        transferRequestId: request.id,
        originalContractId: request.originalContractId,
        replacementContractId: contractId,
        seriesId: request.seriesId,
        toMangakaId: request.requestingMangakaId
      }
    })
  }

  private async fetchRepresentative(representativeId: string | null): Promise<UserMiniType | null> {
    if (!representativeId) return null
    const users = await fetchUserMiniMap(this.prisma, [representativeId])
    return users.get(representativeId) ?? null
  }
}
