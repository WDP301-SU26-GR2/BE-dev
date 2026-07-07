import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { PAYMENT_CONDITION_STATUS } from './transfer.constant'
import { $Enums, TransferContractSignature } from '@prisma/client'

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
      select: { email: true }
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
    return this.prisma.transferRequest.findUnique({
      where: { id },
      include: {
        boardDecision: true,
        originalContract: true
      }
    })
  }

  // Tìm danh sách hồ sơ chuyển nhượng thuộc về một Mangaka cụ thể
  async findTransferRequestsByMangaka(mangakaId: string) {
    return this.prisma.transferRequest.findMany({
      where: {
        OR: [{ requestingMangakaId: mangakaId }, { originalMangakaId: mangakaId }]
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  // Tìm danh sách hồ sơ đang chờ Hội đồng (Board) chấm điểm sàng lọc
  async findPendingBoardRequests() {
    return this.prisma.transferRequest.findMany({
      where: { status: 'SUBMITTED' },
      orderBy: { createdAt: 'asc' }
    })
  }

  // Cập nhật trạng thái và thông tin liên quan của TransferRequest
  async updateTransferRequest(id: string, data: { status: $Enums.TransferRequestStatus; boardDecisionId?: string }) {
    return this.prisma.transferRequest.update({
      where: { id },
      data
    })
  }

  // B-TRF-02: Giao dịch nguyên tử (Transaction) Đóng hợp đồng cũ A và chấm dứt các điều khoản dang dở
  async terminateOldContract(contractId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Chuyển trạng thái hợp đồng cũ sang TERMINATED
      const updatedContract = await tx.contract.update({
        where: { id: contractId },
        data: { status: 'TERMINATED' as any } // Ép kiểu nếu dùng ContractStatus custom chưa sync hết vào Prisma Client
      })

      // 2. Chuyển toàn bộ điều kiện thanh toán chưa đạt (PENDING) của Mangaka A sang dạng MISSED
      await tx.paymentCondition.updateMany({
        where: {
          contractId,
          status: 'PENDING'
        },
        data: {
          status: PAYMENT_CONDITION_STATUS.MISSED as any
        }
      })

      return updatedContract
    })
  }

  // B-TRF-02: Tạo hợp đồng mới độc lập hoàn toàn cho Mangaka B (Không cộng dồn công sức người cũ).
  // Map input {description, type, value} → PaymentCondition schema thật:
  //   conditionType (Prisma ConditionType) — type | fallback 'ONE_TIME'
  //   payoutAmount — value (số tiền payout mỗi lần trigger)
  //   thresholdConfig — { description } (lưu mô tả dạng JSON theo schema)
  async createNewContractFromTransfer(data: {
    seriesId: string
    mangakaId: string
    sourceTransferRequestId: string
    contractType: $Enums.ContractType
    valuationAmount?: number
    conditions: { description: string; type: string; value: number }[]
  }) {
    const { conditions, ...contractData } = data
    return this.prisma.contract.create({
      data: {
        ...contractData,
        status: 'DRAFT',
        conditions: {
          create: conditions.map((cond) => ({
            conditionType: (cond.type as unknown as $Enums.ConditionType) ?? ('TIME_BOUND' as $Enums.ConditionType),
            payoutAmount: cond.value,
            thresholdConfig: { description: cond.description },
            status: PAYMENT_CONDITION_STATUS.PENDING as $Enums.PaymentConditionStatus
          }))
        }
      }
    })
  }

  // B-TRF-02 & B-TRF-04: Cập nhật thông tin quyền sở hữu trên thực thể Series
  async updateSeriesOwnership(
    seriesId: string,
    data: {
      mangakaId: string
      coOwnerId?: string | null
      coOwnerApprovalRequired?: boolean
    }
  ) {
    // Chú ý: Vì schema prisma của bạn không hiển thị rõ trường coOwnerId trong block text,
    // hàm này chạy trực tiếp lệnh update thô dựa trên mô tả thiết kế AC1/AC2 của B-TRF-04.
    return this.prisma.series.update({
      where: { id: seriesId },
      data: data as any
    })
  }

  // B-TRF-03: Tạo mới cấu trúc hợp đồng thỏa thuận chuyển nhượng 3 bên
  async createTransferContract(data: {
    transferRequestId: string
    seriesId: string
    fromMangakaId: string
    toMangakaId: string
    transferType: $Enums.TransferType
    transferAmount: number
    newOwnershipSplit: any
    coOwnerApprovalRequired: boolean
  }) {
    return this.prisma.transferContract.create({
      data: {
        ...data,
        status: 'DRAFT'
      }
    })
  }

  // Tìm chi tiết hợp đồng chuyển nhượng kèm danh sách các chữ ký hiện có
  async findTransferContractById(id: string) {
    return this.prisma.transferContract.findUnique({
      where: { id },
      include: {
        signatures: true
      }
    })
  }

  // Cập nhật trạng thái tiến độ hợp đồng 3 bên
  async updateTransferContractStatus(id: string, status: $Enums.TransferContractStatus) {
    return this.prisma.transferContract.update({
      where: { id },
      data: { status }
    })
  }

  // Thêm mới một chữ ký xác thực vào bảng Signature (Single Source of Truth)
  addTransferContractSignature(
    transferContractId: string,
    userId: string,
    role: 'MANGAKA_A' | 'MANGAKA_B' | 'BOARD'
  ): Promise<TransferContractSignature> {
    return this.prisma.transferContractSignature.create({
      data: {
        transferContractId,
        userId,
        role
      }
    })
  }

  // Co-owner chapter approval (A-CHP-06 / B-TRF-05) đã CHUYỂN sang chapter module (BE-A) —
  // xem src/modules/chapter/chapter.repo.ts (createCoOwnerApproval / findCoOwnerApprovalByChapterId / ...).
  // Spec 6 / Task 6 — code cũ (findCoOwnerApprovalByChapterId / createCoOwnerChapterApproval / updateCoOwnerApproval) gỡ bỏ.
}
