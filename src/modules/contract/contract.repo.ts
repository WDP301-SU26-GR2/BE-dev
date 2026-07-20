import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { CreateContractBodyType } from './schemas/contract-schema'
import type { Contract, ContractVersion } from '@prisma/client'
import { ContractStatus, Prisma } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { isRetryableTransactionError, isUniqueConstrainError } from 'src/infrastructure/database/prisma-error.helper'
import { fetchUserMiniMap, USER_MINI_FIELDS, toUserMini } from 'src/core/models/user-mini.model'

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

  // Spec 24: dedicated rich query for PDF export, keeping regular GET queries lean.
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
        amendments: { select: { status: true, fullyExecutedAt: true } },
        contractSignatures: { select: { userId: true, role: true, signedAt: true } }
      }
    })
    if (!contract) return null

    // ContractSignature deliberately has no Prisma User relation; batch lookup avoids N+1.
    const signerMap = await fetchUserMiniMap(
      this.prisma,
      contract.contractSignatures.map((signature) => signature.userId)
    )
    return {
      ...contract,
      mangaka: toUserMini(contract.mangaka),
      editor: contract.editor ? toUserMini(contract.editor) : null,
      contractSignatures: contract.contractSignatures.map((signature) => ({
        ...signature,
        user: signerMap.get(signature.userId) ?? null
      }))
    }
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

  /**
   * S-05 (BACKEND_AUDIT_2026-07-20): cấp số phiên bản kế tiếp TỪ DB, bên trong transaction.
   *
   * Bản cũ tính `contract.versions.length + 1` từ snapshot đọc ngoài transaction → hai
   * lần sửa đồng thời cấp trùng số. Nay đọc bản mới nhất ngay trong tx và đã có
   * `@@unique([contractId, versionNumber])` chặn ở tầng DB.
   */
  private async nextVersionNumber(tx: Prisma.TransactionClient, contractId: string): Promise<number> {
    const latest = await tx.contractVersion.findFirst({
      where: { contractId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true }
    })
    return (latest?.versionNumber ?? 0) + 1
  }

  /**
   * S-05: retry có giới hạn khi đụng unique versionNumber.
   *
   * Unique index biến race thành P2002 thay vì ghi trùng âm thầm; nhưng để lỗi này
   * nổi lên client thành 500 thì chỉ đổi bug này lấy bug khác. Người thua thử lại và
   * lấy số kế tiếp — vẫn giữ được tính đúng đắn mà không vỡ trải nghiệm.
   */
  private async withVersionRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn()
      } catch (error) {
        if (!isUniqueConstrainError(error) && !isRetryableTransactionError(error)) throw error
        lastError = error
      }
    }
    throw lastError
  }

  // 3. Cập nhật điều khoản hợp đồng và lưu log vào bảng lịch sử phiên bản bên trong một Database Transaction
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

  /**
   * S-02 (BACKEND_AUDIT_2026-07-20): chốt hợp đồng khi CẢ HAI phía đã ký.
   *
   * CAS thuần: chỉ lật sang FULLY_EXECUTED khi hai mốc ký đều có mặt và hợp đồng
   * chưa được chốt. `count === 1` xác định DUY NHẤT một request là người chốt →
   * chỉ người đó emit `contract.executed`, nên dù mangaka và board-cuối chạy song
   * song thì event vẫn bắn đúng một lần.
   *
   * Hàm này idempotent: gọi lại khi đã FULLY_EXECUTED trả về executedNow = false.
   */
  private async settleFullyExecuted(tx: Prisma.TransactionClient, contractId: string) {
    const res = await tx.contract.updateMany({
      where: {
        id: contractId,
        mangakaSignedAt: { not: null },
        boardSignedAt: { not: null },
        status: { not: ContractStatus.FULLY_EXECUTED }
      },
      data: { status: ContractStatus.FULLY_EXECUTED }
    })
    return res.count === 1
  }

  /**
   * S-02: ghi chữ ký Board + chốt trạng thái NGUYÊN TỬ trong một transaction.
   *
   * Bản cũ đếm chữ ký NGOÀI transaction rồi mới ghi (`count + 1`), sinh hai lỗi thật:
   *  1. Hai người ký giữa chừng đồng thời → cả hai cùng thấy `count` cũ → không ai
   *     đạt ngưỡng → hợp đồng KẸT VĨNH VIỄN (đã ký nên không thể ký lại).
   *  2. Hai người ký cuối đồng thời → cả hai cùng đạt ngưỡng → emit `contract.executed`
   *     hai lần → downstream sinh payment trùng.
   *
   * Bản mới ĐẾM LẠI BÊN TRONG transaction, sau khi đã ghi chữ ký, nên con số luôn
   * phản ánh sự thật; việc lật cờ `boardSignedAt` dùng CAS để chỉ một người thắng.
   */
  async recordBoardSignatureAndSettle(contractId: string, userId: string, requiredSignatures: number) {
    return this.withTransactionRetry(() =>
      this.prisma.$transaction(async (tx) => {
        // Serialization fence MUST be the first DB operation in this transaction. Every signer
        // writes the same Contract document with a unique value, so concurrent snapshots cannot
        // both commit after counting different subsets of signatures.
        await tx.contract.update({
          where: { id: contractId },
          data: { signingFence: randomUUID() }
        })

        await tx.contractSignature.create({
          data: { contractId, userId, role: 'BOARD_EDITOR', signedAt: new Date() }
        })

        // Đếm SAU khi ghi, BÊN TRONG transaction → không còn cửa sổ TOCTOU.
        const signatureCount = await tx.contractSignature.count({
          where: { contractId, role: 'BOARD_EDITOR' }
        })

        let boardCompletedNow = false
        if (requiredSignatures > 0 && signatureCount >= requiredSignatures) {
          const flip = await tx.contract.updateMany({
            // 🔴 AGENTS §10: hợp đồng chưa từng ký có `boardSignedAt` ABSENT, không phải null.
            // `where: { boardSignedAt: null }` KHÔNG match doc absent ⇒ CAS không bao giờ khớp
            // ⇒ hợp đồng không bao giờ chốt. Phải phủ CẢ HAI dạng "chưa ký".
            where: { id: contractId, OR: [{ boardSignedAt: null }, { boardSignedAt: { isSet: false } }] },
            data: { boardSignedAt: new Date() }
          })
          boardCompletedNow = flip.count === 1
        }

        const executedNow = await this.settleFullyExecuted(tx, contractId)
        const contract = await tx.contract.findUnique({ where: { id: contractId } })

        return { signatureCount, boardCompletedNow, executedNow, contract }
      })
    )
  }

  /**
   * S-02: ghi chữ ký Mangaka + chốt trạng thái nguyên tử.
   *
   * `signed = false` nghĩa là mốc `mangakaSignedAt` đã có sẵn (thua race hoặc gọi lại)
   * → caller ném AlreadySigned và KHÔNG emit.
   */
  async recordMangakaSignatureAndSettle(contractId: string) {
    return this.withTransactionRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const flip = await tx.contract.updateMany({
          // 🔴 AGENTS §10: xem chú thích ở recordBoardSignatureAndSettle — absent ≠ null.
          where: { id: contractId, OR: [{ mangakaSignedAt: null }, { mangakaSignedAt: { isSet: false } }] },
          data: { mangakaSignedAt: new Date(), status: ContractStatus.MANGAKA_SIGNED, signingFence: randomUUID() }
        })
        if (flip.count !== 1) {
          return { signed: false, executedNow: false, contract: null }
        }

        const executedNow = await this.settleFullyExecuted(tx, contractId)
        const contract = await tx.contract.findUnique({ where: { id: contractId } })

        return { signed: true, executedNow, contract }
      })
    )
  }

  private async withTransactionRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
    let lastError: unknown
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await fn()
      } catch (error) {
        if (!isRetryableTransactionError(error)) throw error
        lastError = error
      }
    }
    throw lastError
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
