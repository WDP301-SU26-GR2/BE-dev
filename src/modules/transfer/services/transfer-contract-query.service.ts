import { Injectable } from '@nestjs/common'
import { TransferAccessDeniedException } from '../errors/transfer.error'
import { TransferRepo } from '../transfer.repo'
import type { ActorContext } from '../transfer.types'
import { TransferAccessPolicy } from './transfer-access.policy'
import { TransferResourceLoader } from './transfer-resource-loader.service'

// Spec 27 (Flow 8) — tách read-path của TransferContract khỏi TransferSigningService.
// Lý do tách: signing service đã chạm ngưỡng 200 dòng của architecture guard, và "đọc hợp đồng"
// là use-case độc lập với "ký hợp đồng" (AGENTS §6).
@Injectable()
export class TransferContractQueryService {
  constructor(
    private readonly repository: TransferRepo,
    private readonly accessPolicy: TransferAccessPolicy,
    private readonly resourceLoader: TransferResourceLoader
  ) {}

  // Trước Spec 27 chỉ có route xem CHỮ KÝ, không có route xem ĐIỀU KHOẢN ⇒ các bên phải ký mù.
  // Map tường minh thay vì trả thẳng row: `newOwnershipSplit` là cột Json (type Prisma `JsonValue`)
  // không khớp `Record<string, number>` của response schema, và map cũng chặn rò rỉ field DB thêm sau này.
  async getContractById(id: string, actor: ActorContext) {
    const contract = await this.loadViewableContract(id, actor)
    return {
      id: contract.id,
      transferRequestId: contract.transferRequestId,
      seriesId: contract.seriesId,
      fromMangakaId: contract.fromMangakaId,
      toMangakaId: contract.toMangakaId,
      series: contract.series,
      fromMangaka: contract.fromMangaka,
      toMangaka: contract.toMangaka,
      transferType: contract.transferType,
      transferAmount: contract.transferAmount,
      newOwnershipSplit: this.narrowOwnershipSplit(contract.newOwnershipSplit),
      coOwnerApprovalRequired: contract.coOwnerApprovalRequired,
      status: contract.status,
      createdAt: contract.createdAt,
      signatures: this.mapSignatures(contract.signatures)
    }
  }

  async getSignatures(id: string, actor: ActorContext) {
    const contract = await this.loadViewableContract(id, actor)
    return { signatures: this.mapSignatures(contract.signatures) }
  }

  private mapSignatures(
    signatures: NonNullable<Awaited<ReturnType<TransferRepo['findTransferContractById']>>>['signatures']
  ) {
    return (signatures ?? []).map((signature) => ({
      id: signature.id,
      transferContractId: signature.transferContractId,
      userId: signature.userId,
      role: signature.role,
      signedAt: signature.signedAt
    }))
  }

  // RBAC dùng chung cho mọi đường ĐỌC hợp đồng chuyển nhượng: 2 Mangaka trong giao dịch,
  // Editor phụ trách series, Board member thuộc roster quyết định TRANSFER, Super Admin.
  // Hợp đồng mồ côi (mất transferRequestId/seriesId) → 403 thay vì lộ dữ liệu.
  private async loadViewableContract(id: string, actor: ActorContext) {
    const contract = await this.resourceLoader.loadContract(id)
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
    return contract
  }

  // Cột Json không được DB ràng buộc shape; dữ liệu cũ/ghi sai có thể là mảng hoặc scalar.
  // Trả null thay vì ném — hợp đồng vẫn đọc được phần còn lại, FE hiển thị "chưa có tỷ lệ".
  private narrowOwnershipSplit(value: unknown): Record<string, number> | null {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) return null
    const entries = Object.entries(value as Record<string, unknown>)
    if (!entries.every(([, share]) => typeof share === 'number')) return null
    return Object.fromEntries(entries) as Record<string, number>
  }
}
