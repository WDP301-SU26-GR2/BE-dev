// Ánh xạ chính xác enum TransferRequestStatus từ Prisma
export const TRANSFER_REQUEST_STATUS = {
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  REJECTED_BY_BOARD: 'REJECTED_BY_BOARD',
  NEGOTIATING: 'NEGOTIATING',
  REJECTED_BY_ORIGINAL_MANGAKA: 'REJECTED_BY_ORIGINAL_MANGAKA',
  ACCEPTED: 'ACCEPTED',
  CANCELLED: 'CANCELLED',
  AWAITING_REPLACEMENT_SIGNATURES: 'AWAITING_REPLACEMENT_SIGNATURES',
  AWAITING_TRANSFER_SIGNATURES: 'AWAITING_TRANSFER_SIGNATURES',
  COMPLETED: 'COMPLETED'
} as const

// §v2 (Flow 8) — tách rõ "Board duyệt" (UNDER_REVIEW) và "Mangaka gốc đồng ý" (ACCEPTED):
//  - UNDER_REVIEW KHÔNG còn đi thẳng AWAITING_TRANSFER_SIGNATURES (bắt buộc qua NEGOTIATING → ACCEPTED).
//  - NEGOTIATING KHÔNG còn quay ngược UNDER_REVIEW; đồng ý ⇒ ACCEPTED, từ chối ⇒ REJECTED_BY_ORIGINAL_MANGAKA.
//  - ACCEPTED mới được soạn hợp đồng chuyển nhượng ⇒ AWAITING_TRANSFER_SIGNATURES.
// Full Buyout (Board toàn quyền, không cần Mangaka gốc) vẫn đi UNDER_REVIEW → AWAITING_REPLACEMENT_SIGNATURES.
export const TRANSFER_REQUEST_TRANSITIONS = {
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED_BY_BOARD', 'CANCELLED'],
  UNDER_REVIEW: ['NEGOTIATING', 'AWAITING_REPLACEMENT_SIGNATURES', 'CANCELLED'],
  NEGOTIATING: ['ACCEPTED', 'REJECTED_BY_ORIGINAL_MANGAKA', 'CANCELLED'],
  ACCEPTED: ['AWAITING_TRANSFER_SIGNATURES', 'CANCELLED'],
  PROPOSED: ['AWAITING_TRANSFER_SIGNATURES', 'REJECTED', 'CANCELLED'],
  AWAITING_REPLACEMENT_SIGNATURES: ['COMPLETED', 'CANCELLED'],
  AWAITING_TRANSFER_SIGNATURES: ['COMPLETED', 'CANCELLED'],
  REJECTED_BY_BOARD: [],
  REJECTED_BY_ORIGINAL_MANGAKA: [],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: []
} as const

// §v2 point 9: trần số lần thử settlement (outbox). Vượt trần ⇒ dead-letter: KHÔNG retry vô hạn,
// ghi audit + log ERROR để vận hành xử lý tay (tránh 1 event hỏng lặp mãi mỗi 5s).
export const MAX_TRANSFER_SETTLEMENT_ATTEMPTS = 10

// §v2 point 6: một series chỉ được có TỐI ĐA 1 yêu cầu chuyển nhượng đang hoạt động tại một thời điểm.
// Các trạng thái terminal (COMPLETED / CANCELLED / REJECTED_BY_BOARD / REJECTED_BY_ORIGINAL_MANGAKA) KHÔNG chặn.
export const ACTIVE_TRANSFER_REQUEST_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEGOTIATING',
  'ACCEPTED',
  'AWAITING_REPLACEMENT_SIGNATURES',
  'AWAITING_TRANSFER_SIGNATURES'
] as const

export const TRANSFER_CONTRACT_TRANSITIONS = {
  DRAFT: ['A_SIGNED', 'VOIDED'],
  A_SIGNED: ['B_SIGNED', 'VOIDED'],
  B_SIGNED: ['BOARD_SIGNED', 'VOIDED'],
  BOARD_SIGNED: ['FULLY_EXECUTED', 'VOIDED'],
  FULLY_EXECUTED: [],
  VOIDED: []
} as const

// Ánh xạ chính xác enum PaymentConditionStatus phục vụ cho AC3 của mô hình A
export const PAYMENT_CONDITION_STATUS = {
  PENDING: 'PENDING',
  ACHIEVED: 'ACHIEVED',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
  MISSED: 'MISSED',
  DISABLED: 'DISABLED'
} as const

// Ánh xạ chính xác enum CoOwnerApprovalStatus cho luồng hook duyệt chương truyện (B-TRF-05)
export const CO_OWNER_APPROVAL_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ESCALATED: 'ESCALATED'
} as const

// Danh sách các vai trò thực hiện ký kết hợp đồng chuyển nhượng 3 bên
export const TRANSFER_SIGNATURE_ROLE = {
  MANGAKA_A: 'MANGAKA_A',
  MANGAKA_B: 'MANGAKA_B',
  BOARD: 'BOARD'
} as const

export type TransferRequestStatusType = (typeof TRANSFER_REQUEST_STATUS)[keyof typeof TRANSFER_REQUEST_STATUS]
export type PaymentConditionStatusType = (typeof PAYMENT_CONDITION_STATUS)[keyof typeof PAYMENT_CONDITION_STATUS]
export type CoOwnerApprovalStatusType = (typeof CO_OWNER_APPROVAL_STATUS)[keyof typeof CO_OWNER_APPROVAL_STATUS]
export type TransferSignatureRoleType = (typeof TRANSFER_SIGNATURE_ROLE)[keyof typeof TRANSFER_SIGNATURE_ROLE]
