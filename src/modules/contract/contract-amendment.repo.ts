import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import type { ContractAmendment, ContractAmendmentStatus, Prisma } from '@prisma/client'
import { fetchUserMiniMap } from 'src/core/models/user-mini.model'

const NON_TERMINAL: ContractAmendmentStatus[] = ['DRAFT', 'PENDING_SIGNATURES']

@Injectable()
export class ContractAmendmentRepo {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ContractAmendmentUncheckedCreateInput): Promise<ContractAmendment> {
    return this.prisma.contractAmendment.create({ data })
  }

  async findById(id: string) {
    const amendment = await this.prisma.contractAmendment.findUnique({
      where: { id },
      include: { signatures: true }
    })
    if (!amendment) return null
    const creators = await fetchUserMiniMap(this.prisma, [amendment.createdBy])
    return {
      ...amendment,
      creator: amendment.createdBy ? (creators.get(amendment.createdBy) ?? null) : null
    }
  }

  async findManyByContract(contractId: string) {
    const amendments = await this.prisma.contractAmendment.findMany({
      where: { contractId },
      orderBy: { createdAt: 'desc' },
      include: { signatures: true }
    })
    const creators = await fetchUserMiniMap(
      this.prisma,
      amendments.map((amendment) => amendment.createdBy)
    )
    return amendments.map((amendment) => ({
      ...amendment,
      creator: amendment.createdBy ? (creators.get(amendment.createdBy) ?? null) : null
    }))
  }

  // Guard "1 amendment non-terminal / contract"
  findOpenByContract(contractId: string): Promise<ContractAmendment | null> {
    return this.prisma.contractAmendment.findFirst({
      where: { contractId, status: { in: NON_TERMINAL } }
    })
  }

  findExecutedContractBySeries(seriesId: string) {
    return this.prisma.contract.findFirst({
      where: { seriesId, status: 'FULLY_EXECUTED' },
      select: { id: true, editorId: true, mangakaId: true, contractType: true }
    })
  }

  update(id: string, data: Prisma.ContractAmendmentUpdateInput): Promise<ContractAmendment> {
    return this.prisma.contractAmendment.update({ where: { id }, data })
  }

  // Xóa toàn bộ chữ ký + reset 2 timestamp (dùng khi về DRAFT: patch/reject)
  async clearSignatures(id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.amendmentSignature.deleteMany({ where: { amendmentId: id } }),
      this.prisma.contractAmendment.update({
        where: { id },
        data: { mangakaSignedAt: null, boardSignedAt: null }
      })
    ])
  }

  countBoardSignatures(amendmentId: string): Promise<number> {
    return this.prisma.amendmentSignature.count({ where: { amendmentId } })
  }

  findSignature(amendmentId: string, userId: string) {
    return this.prisma.amendmentSignature.findUnique({
      where: { amendmentId_userId: { amendmentId, userId } }
    })
  }

  addBoardSignature(amendmentId: string, userId: string): Promise<void> {
    return this.prisma.amendmentSignature
      .create({ data: { amendmentId, userId, role: 'BOARD_MEMBER', signedAt: new Date() } })
      .then(() => undefined)
  }

  // Execute atomic: guard PENDING_SIGNATURES → FULLY_EXECUTED, apply typed field !=null lên Contract,
  // log 1 ContractVersion. Trả contract đã cập nhật, hoặc null nếu guard thua (đã execute nơi khác).
  async executeAndApply(amendmentId: string, contractId: string, lastSignerId: string): Promise<{ applied: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Guard atomic — chỉ 1 lần thắng
      const guard = await tx.contractAmendment.updateMany({
        where: { id: amendmentId, status: 'PENDING_SIGNATURES' },
        data: { status: 'FULLY_EXECUTED', fullyExecutedAt: new Date() }
      })
      if (guard.count !== 1) return { applied: false }

      // 2. Đọc amendment (typed term)
      const amendment = await tx.contractAmendment.findUniqueOrThrow({ where: { id: amendmentId } })

      // S-05: cấp số phiên bản từ bản ghi mới nhất TRONG transaction, không dùng
      // `versions.length + 1` (đếm sai khi có phiên bản bị xoá và đụng nhau khi chạy song song).
      const latestVersion = await tx.contractVersion.findFirst({
        where: { contractId },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true }
      })
      const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1

      // 3. Build contract update: chỉ field !=null
      const contractData: Prisma.ContractUpdateInput = {}
      if (amendment.valuationAmount != null) contractData.valuationAmount = amendment.valuationAmount
      if (amendment.publisherOwnershipPct != null) contractData.publisherOwnershipPct = amendment.publisherOwnershipPct
      if (amendment.mangakaOwnershipPct != null) contractData.mangakaOwnershipPct = amendment.mangakaOwnershipPct
      if (amendment.terminationClause != null) contractData.terminationClause = amendment.terminationClause
      if (amendment.contractStart != null) contractData.contractStart = amendment.contractStart
      if (amendment.contractEnd != null) contractData.contractEnd = amendment.contractEnd

      const updatedContract = await tx.contract.update({ where: { id: contractId }, data: contractData })

      // 4. Log ContractVersion (chỉ 4 field tiền tệ — ContractVersion không có start/end)
      await tx.contractVersion.create({
        data: {
          contractId,
          versionNumber: nextVersionNumber,
          valuationAmount: updatedContract.valuationAmount,
          publisherOwnershipPct: updatedContract.publisherOwnershipPct,
          mangakaOwnershipPct: updatedContract.mangakaOwnershipPct,
          terminationClause: updatedContract.terminationClause,
          editedById: lastSignerId,
          note: `Amendment ${amendmentId}`,
          createdAt: new Date()
        }
      })

      return { applied: true }
    })
  }
}
