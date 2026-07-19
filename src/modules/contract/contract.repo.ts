import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { CreateContractBodyType } from './schemas/contract-schema'
import type { Contract, ContractVersion } from '@prisma/client'
import { ContractStatus, Prisma } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { USER_MINI_FIELDS, toUserMini } from 'src/core/models/user-mini.model'

@Injectable()
export class ContractRepo {
  constructor(private readonly prisma: PrismaService) {}

  // B-CON-01: đọc trạng thái series để gate tạo hợp đồng (cross-module read prisma.series).
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
            boardSession: { select: { id: true, title: true, startTime: true } }
          }
        },
        mangaka: { select: USER_MINI_FIELDS },
        editor: { select: USER_MINI_FIELDS }
      }
    })
    if (!contract) return null
    return {
      ...contract,
      series: { id: contract.series.id, title: contract.series.title },
      mangaka: toUserMini(contract.mangaka),
      editor: contract.editor ? toUserMini(contract.editor) : null
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
            boardSession: { select: { id: true, title: true, startTime: true } }
          }
        },
        mangaka: { select: USER_MINI_FIELDS },
        editor: { select: USER_MINI_FIELDS }
      }
    })
    return rows.map((contract) => ({
      ...contract,
      series: { id: contract.series.id, title: contract.series.title },
      mangaka: toUserMini(contract.mangaka),
      editor: contract.editor ? toUserMini(contract.editor) : null
    }))
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

  // 5. Tìm hợp đồng kèm Quyết định (Đã sửa đổi: bỏ include khuyết allowedEditors)
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
