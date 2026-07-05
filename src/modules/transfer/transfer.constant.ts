// Ánh xạ chính xác enum TransferRequestStatus từ Prisma
export const TRANSFER_REQUEST_STATUS = {
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  REJECTED_BY_BOARD: 'REJECTED_BY_BOARD',
  NEGOTIATING: 'NEGOTIATING',
  REJECTED_BY_ORIGINAL_MANGAKA: 'REJECTED_BY_ORIGINAL_MANGAKA',
  ACCEPTED: 'ACCEPTED',
  CANCELLED: 'CANCELLED'
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
