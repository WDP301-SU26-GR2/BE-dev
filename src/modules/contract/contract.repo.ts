import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { CreateContractBodyType } from './schemas/contract-schema'
import type { Contract, ContractVersion } from '@prisma/client'
import { ContractStatus, Prisma } from '@prisma/client'

@Injectable()
export class ContractRepo {
  constructor(private readonly prisma: PrismaService) {}

  // Tạo hợp đồng nháp mới
  createDraft(editorId: string, dto: CreateContractBodyType): Promise<Contract> {
    return this.prisma.contract.create({
      data: {
        ...dto,
        editorId,
        status: ContractStatus.DRAFT
      }
    })
  }

  // Tìm kiếm hợp đồng kèm theo toàn bộ lịch sử các phiên bản (versions)
  findById(id: string): Promise<(Contract & { versions: ContractVersion[] }) | null> {
    return this.prisma.contract.findUnique({
      where: { id },
      include: { versions: true }
    })
  }

  // Cập nhật điều khoản hợp đồng và lưu log vào bảng lịch sử phiên bản bên trong một Database Transaction
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

  // Cập nhật nhanh trạng thái của hợp đồng (ví dụ: chuyển sang trạng thái đã ký)
  updateStatus(id: string, status: ContractStatus, additionalData: Prisma.ContractUpdateInput = {}): Promise<Contract> {
    return this.prisma.contract.update({
      where: { id },
      data: { status, ...additionalData }
    })
  }
}
