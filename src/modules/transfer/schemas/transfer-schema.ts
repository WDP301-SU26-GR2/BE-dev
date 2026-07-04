import { z } from 'zod'
import { $Enums } from '@prisma/client'

// ============================================================================
// 1. REQUEST SCHEMAS (Giữ nguyên enum chuẩn để validate dữ liệu đầu vào)
// ============================================================================

export const CreateTransferRequestSchema = z.object({
  seriesId: z.string().min(1, 'SERIES_ID_REQUIRED'),
  planDescription: z.string().min(1, 'PLAN_DESCRIPTION_REQUIRED'),
  proposedType: z.nativeEnum($Enums.TransferType),
  proposedPercentage: z.number().min(0).max(100).optional()
})

export const BoardDecisionTransferSchema = z.object({
  boardSessionId: z.string().min(1, 'BOARD_SESSION_ID_REQUIRED'),
  details: z.string().optional()
})

export const CreateTransferContractSchema = z.object({
  transferRequestId: z.string().min(1, 'TRANSFER_REQUEST_ID_REQUIRED'),
  transferAmount: z.number().positive('AMOUNT_MUST_BE_POSITIVE'),
  transferType: z.nativeEnum($Enums.TransferType),
  newOwnershipSplit: z.record(z.string(), z.any()).describe('Cấu hình chia tỷ lệ sở hữu doanh thu mới'),
  coOwnerApprovalRequired: z.boolean().default(false)
})

export const SignTransferContractSchema = z.object({
  otpCode: z.string().length(6, 'OTP_MUST_BE_6_DIGITS')
})

export const CoOwnerRejectChapterSchema = z.object({
  rejectReason: z.string().min(1, 'REJECT_REASON_REQUIRED')
})

// ============================================================================
// 2. RESPONSE SCHEMAS (Đã tối giản bằng z.any() cho các trường Date)
// ============================================================================

export const TransferRequestSchema = z.object({
  id: z.string(),
  seriesId: z.string(),
  requestingMangakaId: z.string(),
  originalMangakaId: z.string(),
  originalContractType: z.string().nullable().optional(),
  proposedType: z.string().nullable().optional(),
  proposedPercentage: z.number().nullable().optional(),
  planDescription: z.string().nullable().optional(),
  originalContractId: z.string().nullable().optional(),
  status: z.string(),
  boardDecisionId: z.string().nullable().optional(),

  // Dùng z.any() để chấp nhận cả Date object của Prisma lẫn string, Swagger đọc vô tư
  createdAt: z.any()
})

export const TransferContractSignatureSchema = z.object({
  id: z.string(),
  transferContractId: z.string(),
  userId: z.string(),
  role: z.string(), // Để string cho khớp với Prisma String như bạn muốn
  signedAt: z.any() // Gọn gàng, không lo crash JSON Schema
})

export const TransferContractSchema = z.object({
  id: z.string(),
  transferRequestId: z.string().nullable().optional(),
  seriesId: z.string().nullable().optional(),
  fromMangakaId: z.string().nullable().optional(),
  toMangakaId: z.string().nullable().optional(),
  transferType: z.string().nullable().optional(),
  transferAmount: z.number().nullable().optional(),
  newOwnershipSplit: z.any().nullable().optional(),
  coOwnerApprovalRequired: z.boolean(),
  status: z.string(),

  // Toàn bộ các trường ngày tháng chuyển hết về z.any()
  aSignedAt: z.any().optional(),
  bSignedAt: z.any().optional(),
  boardSignedAt: z.any().optional(),
  createdAt: z.any(),

  signatures: z.array(TransferContractSignatureSchema).optional()
})

export const TransferRequestListSchema = z.object({
  data: z.array(TransferRequestSchema)
})

export const TransferSignatureListSchema = z.object({
  signatures: z.array(TransferContractSignatureSchema)
})
