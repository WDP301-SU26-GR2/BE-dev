import { ContractStatus } from '@prisma/client'

export const CONTRACT_EVENTS = {
  // Sự kiện kích hoạt khi cả 2 bên (Mangaka & Board) đều đã hoàn tất ký kết thành công
  EXECUTED: 'contract.executed',

  // Sự kiện kích hoạt khi Editor chỉnh sửa và cập nhật lại một phiên bản hợp đồng mới
  AMENDED: 'contract.amended'
}

// Contract 2-phase signing: internal Board representative review/sign, then Mangaka accept/reject.
export const CONTRACT_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  [ContractStatus.DRAFT]: [ContractStatus.BOARD_REVIEW, ContractStatus.VOIDED],
  [ContractStatus.BOARD_REVIEW]: [ContractStatus.AWAITING_MANGAKA, ContractStatus.VOIDED],
  [ContractStatus.AWAITING_MANGAKA]: [
    ContractStatus.FULLY_EXECUTED,
    ContractStatus.ACTIVATION_PENDING,
    ContractStatus.REJECTED_BY_MANGAKA,
    ContractStatus.VOIDED
  ],
  [ContractStatus.ACTIVATION_PENDING]: [ContractStatus.FULLY_EXECUTED],
  [ContractStatus.FULLY_EXECUTED]: [
    ContractStatus.FULFILLED,
    ContractStatus.TERMINATED,
    ContractStatus.TERMINATED_BY_BREACH,
    ContractStatus.EXPIRED
  ],
  [ContractStatus.REJECTED_BY_MANGAKA]: [],
  [ContractStatus.FULFILLED]: [],
  [ContractStatus.TERMINATED]: [],
  [ContractStatus.TERMINATED_BY_BREACH]: [],
  [ContractStatus.EXPIRED]: [],
  [ContractStatus.VOIDED]: []
}

export function canTransitionContract(from: ContractStatus, to: ContractStatus): boolean {
  return CONTRACT_TRANSITIONS[from]?.includes(to) ?? false
}

export const CONTRACT_SIGNABLE_STATUSES: ContractStatus[] = [ContractStatus.BOARD_REVIEW]

export const MANGAKA_SIGNABLE_STATUSES: ContractStatus[] = [ContractStatus.AWAITING_MANGAKA]

export const CONTRACT_EDITABLE_STATUSES: ContractStatus[] = [ContractStatus.DRAFT, ContractStatus.BOARD_REVIEW]

// Only terminal contracts allow a new draft for the same Series or Board Decision.
export const CONTRACT_CREATION_BLOCKING_STATUSES: ContractStatus[] = [
  ContractStatus.DRAFT,
  ContractStatus.BOARD_REVIEW,
  ContractStatus.AWAITING_MANGAKA,
  ContractStatus.ACTIVATION_PENDING,
  ContractStatus.FULLY_EXECUTED
]

// Spec 24: a PDF is a locked, signed record. Terminal states retain that record for download.
export const PDF_EXPORTABLE_STATUSES: ContractStatus[] = [
  ContractStatus.FULLY_EXECUTED,
  ContractStatus.FULFILLED,
  ContractStatus.TERMINATED,
  ContractStatus.TERMINATED_BY_BREACH,
  ContractStatus.EXPIRED
]
