import { ContractStatus } from '@prisma/client'

export const CONTRACT_EVENTS = {
  // Sự kiện kích hoạt khi cả 2 bên (Mangaka & Board) đều đã hoàn tất ký kết thành công
  EXECUTED: 'contract.executed',

  // Sự kiện kích hoạt khi Editor chỉnh sửa và cập nhật lại một phiên bản hợp đồng mới
  AMENDED: 'contract.amended'
}

// B-CON-02: bảng chuyển trạng thái hợp lệ cho vòng thương lượng + ký (Requiment Flow 6).
// DRAFT → MANGAKA_REVIEW → MANGAKA_APPROVED → BOARD_APPROVED → (ký) → FULLY_EXECUTED.
// NEGOTIATION khi Mangaka/Board yêu cầu sửa → editor cập nhật → quay về MANGAKA_REVIEW.
export const CONTRACT_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  [ContractStatus.DRAFT]: [ContractStatus.MANGAKA_REVIEW],
  [ContractStatus.MANGAKA_REVIEW]: [ContractStatus.MANGAKA_APPROVED, ContractStatus.NEGOTIATION],
  [ContractStatus.MANGAKA_APPROVED]: [ContractStatus.BOARD_APPROVED, ContractStatus.NEGOTIATION],
  // Ký: both-sign mechanic (thứ tự Mangaka/Board tự do) nên cho phép cả MANGAKA_SIGNED lẫn FULLY_EXECUTED.
  [ContractStatus.BOARD_APPROVED]: [
    ContractStatus.MANGAKA_SIGNED,
    ContractStatus.FULLY_EXECUTED,
    ContractStatus.NEGOTIATION
  ],
  [ContractStatus.NEGOTIATION]: [ContractStatus.MANGAKA_REVIEW],
  [ContractStatus.MANGAKA_SIGNED]: [ContractStatus.FULLY_EXECUTED],
  [ContractStatus.FULLY_EXECUTED]: [
    ContractStatus.FULFILLED,
    ContractStatus.TERMINATED,
    ContractStatus.TERMINATED_BY_BREACH,
    ContractStatus.EXPIRED
  ],
  [ContractStatus.FULFILLED]: [],
  [ContractStatus.TERMINATED]: [],
  [ContractStatus.TERMINATED_BY_BREACH]: [],
  [ContractStatus.EXPIRED]: [],
  [ContractStatus.VOIDED]: []
}

export function canTransitionContract(from: ContractStatus, to: ContractStatus): boolean {
  return CONTRACT_TRANSITIONS[from]?.includes(to) ?? false
}

// Signing chỉ được phép khi điều khoản đã BOARD_APPROVED (đã qua BOARD_REVIEW) — Requiment Flow 6.
export const CONTRACT_SIGNABLE_STATUSES: ContractStatus[] = [
  ContractStatus.BOARD_APPROVED,
  ContractStatus.MANGAKA_SIGNED
]

// Editor chỉ được sửa điều khoản khi HĐ còn ở giai đoạn thương lượng (chưa ký, chưa terminal) — B-CON-02.
export const CONTRACT_EDITABLE_STATUSES: ContractStatus[] = [
  ContractStatus.MANGAKA_REVIEW,
  ContractStatus.MANGAKA_APPROVED,
  ContractStatus.BOARD_APPROVED,
  ContractStatus.NEGOTIATION
]

// Only terminal contracts allow a new draft for the same Series or Board Decision.
export const CONTRACT_CREATION_BLOCKING_STATUSES: ContractStatus[] = [
  ContractStatus.DRAFT,
  ContractStatus.MANGAKA_REVIEW,
  ContractStatus.MANGAKA_APPROVED,
  ContractStatus.BOARD_APPROVED,
  ContractStatus.NEGOTIATION,
  ContractStatus.MANGAKA_SIGNED,
  ContractStatus.FULLY_EXECUTED
]
