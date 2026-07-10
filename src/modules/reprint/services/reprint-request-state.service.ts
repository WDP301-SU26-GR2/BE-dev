import { Injectable } from '@nestjs/common'
import { AuditEntityType, ReprintRequestStatus } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import { ReprintRequestErrors } from '../errors/reprint-request.error'

// Spec 9 — Part 4: Reprint request state machine (B-RPT-*).
//
// B-RPT-02: REVENUE_SHARE → PENDING/PROPOSED → MANGAKA_APPROVED → BOARD_APPROVED
//           (mangakaReview được gọi thẳng từ PENDING/PROPOSED — không có bước set MANGAKA_REVIEW
//            riêng, nên 2 trạng thái đầu phải cho phép MANGAKA_APPROVED/REJECTED_BY_MANGAKA trực tiếp;
//            MANGAKA_REVIEW giữ trong bảng cho dữ liệu cũ/tương lai)
// B-RPT-02: FULL_BUYOUT   → PENDING/PROPOSED → BOARD_APPROVED (no Mangaka review step)
// B-RPT-04: BOARD_APPROVED → PUBLISHED (chỉ khi mọi embedded chapter đạt APPROVED, do service quyết)
// Board reject → REJECTED; Mangaka reject → REJECTED_BY_MANGAKA.
export const REPRINT_REQUEST_TRANSITIONS: Record<ReprintRequestStatus, ReprintRequestStatus[]> = {
  [ReprintRequestStatus.PENDING]: [
    ReprintRequestStatus.MANGAKA_REVIEW,
    ReprintRequestStatus.MANGAKA_APPROVED,
    ReprintRequestStatus.BOARD_APPROVED,
    ReprintRequestStatus.REJECTED,
    ReprintRequestStatus.REJECTED_BY_MANGAKA
  ],
  [ReprintRequestStatus.PROPOSED]: [
    ReprintRequestStatus.MANGAKA_REVIEW,
    ReprintRequestStatus.MANGAKA_APPROVED,
    ReprintRequestStatus.BOARD_APPROVED,
    ReprintRequestStatus.REJECTED,
    ReprintRequestStatus.REJECTED_BY_MANGAKA
  ],
  [ReprintRequestStatus.MANGAKA_REVIEW]: [
    ReprintRequestStatus.MANGAKA_APPROVED,
    ReprintRequestStatus.REJECTED_BY_MANGAKA,
    ReprintRequestStatus.BOARD_APPROVED
  ],
  [ReprintRequestStatus.MANGAKA_APPROVED]: [ReprintRequestStatus.BOARD_APPROVED],
  [ReprintRequestStatus.BOARD_APPROVED]: [
    ReprintRequestStatus.IN_PRODUCTION,
    ReprintRequestStatus.PUBLISHED,
    ReprintRequestStatus.REJECTED
  ],
  [ReprintRequestStatus.IN_PRODUCTION]: [ReprintRequestStatus.APPROVED, ReprintRequestStatus.REJECTED],
  [ReprintRequestStatus.APPROVED]: [ReprintRequestStatus.PUBLISHED],
  [ReprintRequestStatus.PUBLISHED]: [],
  [ReprintRequestStatus.REJECTED]: [],
  [ReprintRequestStatus.REJECTED_BY_MANGAKA]: []
}

@Injectable()
export class ReprintRequestStateService {
  constructor(private readonly auditService: AuditService) {}

  // Throw nếu transition không hợp lệ — service dùng để guard trước khi update().
  assertTransition(from: ReprintRequestStatus, to: ReprintRequestStatus): void {
    const allowed = REPRINT_REQUEST_TRANSITIONS[from] ?? []
    if (!allowed.includes(to)) throw ReprintRequestErrors.InvalidReprintTransition()
  }

  // Ghi audit log cho transition (fail-soft bên AuditService nên không cần try/catch ở đây).
  audit(
    id: string,
    from: ReprintRequestStatus,
    to: ReprintRequestStatus,
    actorId: string | null,
    reason?: string
  ): Promise<void> {
    return this.auditService.record({
      actorId,
      entityType: AuditEntityType.REPRINT_REQUEST,
      entityId: id,
      action: 'TRANSITION',
      fromState: from,
      toState: to,
      reason
    })
  }
}
