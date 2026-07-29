import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { $Enums, Prisma } from '@prisma/client'
import { fetchSeriesMiniMap, fetchUserMiniMap } from 'src/core/models/user-mini.model'
import type { TransactionContext } from 'src/infrastructure/database/transaction-context'
import { transactionClient } from 'src/infrastructure/database/transaction-context'

@Injectable()
export class TransferRepo {
  constructor(private readonly prisma: PrismaService) {}

  // Tìm hợp đồng đang hoạt động của Series để làm căn cứ chuyển nhượng
  async findActiveContractBySeriesId(seriesId: string) {
    return this.prisma.contract.findFirst({
      where: {
        seriesId,
        status: 'FULLY_EXECUTED' // Hoặc trạng thái tương đương đang có hiệu lực trong hệ thống của bạn
      },
      include: {
        conditions: true
      }
    })
  }

  async findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { email: true, status: true }
    })
  }

  findSeriesAccessScope(seriesId: string) {
    return this.prisma.series.findUnique({
      where: { id: seriesId },
      select: { editorId: true }
    })
  }

  // B-TRF-01: Tạo mới một yêu cầu chuyển nhượng tác phẩm
  async createTransferRequest(data: {
    seriesId: string
    requestingMangakaId: string
    originalMangakaId: string
    originalContractType: string
    proposedType: $Enums.TransferType
    proposedPercentage?: number
    planDescription: string
    originalContractId: string
  }) {
    return this.prisma.transferRequest.create({
      data: {
        ...data,
        status: 'SUBMITTED'
      }
    })
  }

  // Tìm chi tiết một hồ sơ TransferRequest
  async findTransferRequestById(id: string) {
    const request = await this.prisma.transferRequest.findUnique({
      where: { id },
      include: {
        boardDecision: true,
        originalContract: true
      }
    })
    if (!request) return null
    return (await this.enrichTransferRequests([request]))[0]
  }

  // Tìm danh sách hồ sơ chuyển nhượng thuộc về một Mangaka cụ thể
  async findTransferRequestsByMangaka(mangakaId: string) {
    const requests = await this.prisma.transferRequest.findMany({
      where: {
        OR: [{ requestingMangakaId: mangakaId }, { originalMangakaId: mangakaId }]
      },
      orderBy: { createdAt: 'desc' }
    })
    return this.enrichTransferRequests(requests)
  }

  // Tìm danh sách hồ sơ đang chờ Hội đồng (Board) chấm điểm sàng lọc
  async findPendingBoardRequests() {
    const requests = await this.prisma.transferRequest.findMany({
      where: { status: 'SUBMITTED' },
      orderBy: { createdAt: 'asc' }
    })
    return this.enrichTransferRequests(requests)
  }

  // Single-writer primitive: state services call this inside a transaction.
  async compareAndSetRequestStatus(
    context: TransactionContext,
    id: string,
    expected: $Enums.TransferRequestStatus,
    target: $Enums.TransferRequestStatus,
    patch?: { boardDecisionId?: string }
  ): Promise<boolean> {
    const result = await transactionClient(context).transferRequest.updateMany({
      where: { id, status: expected },
      data: { status: target, ...patch }
    })
    return result.count === 1
  }

  findRequestInTransaction(context: TransactionContext, id: string) {
    return transactionClient(context).transferRequest.findUnique({ where: { id } })
  }

  async findRequestStatus(context: TransactionContext, id: string) {
    const request = await transactionClient(context).transferRequest.findUnique({
      where: { id },
      select: { status: true }
    })
    return request?.status ?? null
  }

  createTransferContractInTransaction(
    context: TransactionContext,
    data: {
      transferRequestId: string
      seriesId: string
      fromMangakaId: string
      toMangakaId: string
      transferType: $Enums.TransferType
      transferAmount: number
      newOwnershipSplit: Prisma.InputJsonValue
      coOwnerApprovalRequired: boolean
    }
  ) {
    return transactionClient(context).transferContract.create({ data })
  }

  addSignatureInTransaction(
    context: TransactionContext,
    transferContractId: string,
    userId: string,
    role: $Enums.TransferSignerRole
  ) {
    return transactionClient(context).transferContractSignature.create({
      data: { transferContractId, userId, role }
    })
  }

  async compareAndSetContractStatus(
    context: TransactionContext,
    id: string,
    expected: $Enums.TransferContractStatus,
    target: $Enums.TransferContractStatus
  ): Promise<boolean> {
    const result = await transactionClient(context).transferContract.updateMany({
      where: { id, status: expected },
      data: { status: target }
    })
    return result.count === 1
  }

  // Tìm chi tiết hợp đồng chuyển nhượng kèm danh sách các chữ ký hiện có
  async findTransferContractById(id: string) {
    const contract = await this.prisma.transferContract.findUnique({
      where: { id },
      include: {
        signatures: true
      }
    })
    if (!contract) return null
    return (await this.attachTransferContractPeople([contract]))[0]
  }

  // Spec 27 (Flow 8): TransferContract.transferRequestId là field thường, KHÔNG phải `@relation`
  // Prisma ⇒ không `include` được, phải truy vấn riêng rồi map thủ công. Một request nghiệp vụ chỉ
  // có tối đa 1 hợp đồng (create chỉ chạy khi request UNDER_REVIEW rồi chuyển ngay sang
  // AWAITING_TRANSFER_SIGNATURES), nhưng vẫn sort giảm dần theo createdAt để chọn tất định nếu
  // dữ liệu cũ có hơn 1 bản.
  private async enrichTransferRequests<
    T extends {
      id?: string | null
      seriesId?: string | null
      requestingMangakaId?: string | null
      originalMangakaId?: string | null
    }
  >(rows: T[]) {
    const withPeople = await this.attachTransferRequestPeople(rows)
    const requestIds = rows.map((row) => row.id).filter((id): id is string => Boolean(id))
    if (requestIds.length === 0) return withPeople.map((row) => ({ ...row, transferContractId: null }))
    const contracts = await this.prisma.transferContract.findMany({
      where: { transferRequestId: { in: requestIds } },
      select: { id: true, transferRequestId: true },
      orderBy: { createdAt: 'desc' }
    })
    const contractByRequestId = new Map<string, string>()
    for (const contract of contracts) {
      if (contract.transferRequestId && !contractByRequestId.has(contract.transferRequestId)) {
        contractByRequestId.set(contract.transferRequestId, contract.id)
      }
    }
    return withPeople.map((row) => ({
      ...row,
      transferContractId: row.id ? (contractByRequestId.get(row.id) ?? null) : null
    }))
  }

  private async attachTransferRequestPeople<
    T extends {
      seriesId?: string | null
      requestingMangakaId?: string | null
      originalMangakaId?: string | null
    }
  >(rows: T[]) {
    const [users, series] = await Promise.all([
      fetchUserMiniMap(
        this.prisma,
        rows.flatMap((row) => [row.requestingMangakaId, row.originalMangakaId])
      ),
      fetchSeriesMiniMap(
        this.prisma,
        rows.map((row) => row.seriesId)
      )
    ])
    return rows.map((row) => ({
      ...row,
      series: row.seriesId ? (series.get(row.seriesId) ?? null) : null,
      requestingMangaka: row.requestingMangakaId ? (users.get(row.requestingMangakaId) ?? null) : null,
      originalMangaka: row.originalMangakaId ? (users.get(row.originalMangakaId) ?? null) : null
    }))
  }

  private async attachTransferContractPeople<
    T extends { seriesId?: string | null; fromMangakaId?: string | null; toMangakaId?: string | null }
  >(rows: T[]) {
    const [users, series] = await Promise.all([
      fetchUserMiniMap(
        this.prisma,
        rows.flatMap((row) => [row.fromMangakaId, row.toMangakaId])
      ),
      fetchSeriesMiniMap(
        this.prisma,
        rows.map((row) => row.seriesId)
      )
    ])
    return rows.map((row) => ({
      ...row,
      series: row.seriesId ? (series.get(row.seriesId) ?? null) : null,
      fromMangaka: row.fromMangakaId ? (users.get(row.fromMangakaId) ?? null) : null,
      toMangaka: row.toMangakaId ? (users.get(row.toMangakaId) ?? null) : null
    }))
  }

  // Co-owner chapter approval (A-CHP-06 / B-TRF-05) đã CHUYỂN sang chapter module (BE-A) —
  // xem src/modules/chapter/chapter.repo.ts (createCoOwnerApproval / findCoOwnerApprovalByChapterId / ...).
  // Spec 6 / Task 6 — code cũ (findCoOwnerApprovalByChapterId / createCoOwnerChapterApproval / updateCoOwnerApproval) gỡ bỏ.
}
