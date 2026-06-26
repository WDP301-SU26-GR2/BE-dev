import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { CreateContractBodyType } from './schemas/contract-schema'
import type { Contract, ContractVersion } from '@prisma/client'
import { ContractStatus, Prisma } from '@prisma/client'

@Injectable()
export class ContractRepo {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Tạo hợp đồng nháp mới
  createDraft(editorId: string, dto: CreateContractBodyType): Promise<Contract> {
    return this.prisma.contract.create({
      data: {
        ...dto,
        editorId,
        status: ContractStatus.DRAFT
      }
    })
  }

  // 2. Tìm kiếm hợp đồng kèm theo toàn bộ lịch sử các phiên bản (versions)
  findById(id: string): Promise<(Contract & { versions: ContractVersion[] }) | null> {
    return this.prisma.contract.findUnique({
      where: { id },
      include: { versions: true }
    })
  }

  // 3. Cập nhật điều khoản hợp đồng và lưu log vào bảng lịch sử phiên bản bên trong một Database Transaction
  async updateAndLogVersion(
    contractId: string,
    data: Prisma.ContractUpdateInput,
    editedById: string,
    versionNumber: number,
    note?: string
  ): Promise<Contract> {
    return this.prisma.$transaction(async (tx) => {
      const updatedContract = await tx.contract.update({
        where: { id: contractId },
        data
      })

      await tx.contractVersion.create({
        data: {
          contractId,
          versionNumber,
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
  }

  // 4. Cập nhật nhanh trạng thái của hợp đồng
  updateStatus(id: string, status: ContractStatus, additionalData: Prisma.ContractUpdateInput = {}): Promise<Contract> {
    return this.prisma.contract.update({
      where: { id },
      data: { status, ...additionalData }
    })
  }

  // 🌟 5. ĐÃ SỬA: Tìm hợp đồng kèm Quyết định & Đào sâu lấy Hội đồng cha (BoardSession)
  async findWithBoardDecision(contractId: string) {
    return this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        boardDecision: {
          include: {
            boardSession: {
              select: {
                allowedEditorIds: true // Lấy nguồn sự thật duy nhất từ phòng họp hội đồng cha
              }
            }
          }
        }
      }
    })
  }

  // 6. Kiểm tra xem một thành viên cụ thể trong ban giám đốc đã ký chưa
  findSpecificSignature(contractId: string, userId: string) {
    return this.prisma.contractSignature.findUnique({
      where: {
        contractId_userId: { contractId, userId }
      }
    })
  }

  // 7. Đếm xem hiện tại đã có bao nhiêu thành viên ban giám đốc hoàn tất ký
  countBoardSignatures(contractId: string): Promise<number> {
    return this.prisma.contractSignature.count({
      where: { contractId, role: 'BOARD_EDITOR' }
    })
  }

  // 8. Thực thi ghi nhận chữ ký và chốt trạng thái hợp đồng (MongoDB-friendly)
  async executeBoardSignature(
    contractId: string,
    userId: string,
    shouldFinalizeBoard: boolean,
    nextStatus?: ContractStatus,
    updatedData?: any
  ): Promise<Contract | null> {
    // Tạo bản ghi chữ ký độc lập
    await this.prisma.contractSignature.create({
      data: {
        contractId,
        userId,
        role: 'BOARD_EDITOR',
        signedAt: new Date()
      }
    })

    // Nếu là người cuối cùng, kích hoạt update hợp đồng chính
    if (shouldFinalizeBoard && nextStatus && updatedData) {
      return this.prisma.contract.update({
        where: { id: contractId },
        data: {
          status: nextStatus,
          ...updatedData
        }
      })
    }

    return this.prisma.contract.findUnique({ where: { id: contractId } })
  }

  // 9. Lấy tiến độ ký kết hợp đồng chi tiết
  async getContractSignaturesProgress(contractId: string) {
    return this.prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        status: true,
        mangakaId: true,
        mangakaSignedAt: true,
        boardDecision: {
          select: {
            id: true,
            result: true,
            boardSession: {
              select: {
                allowedEditorIds: true
              }
            }
          }
        },
        contractSignatures: {
          where: { role: 'BOARD_EDITOR' },
          select: {
            userId: true,
            signedAt: true
          }
        }
      }
    })
  }
}
