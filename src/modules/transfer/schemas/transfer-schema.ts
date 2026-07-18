import { z } from 'zod'
import { $Enums } from '@prisma/client'
import { extendApi } from '@anatine/zod-openapi'
import { zEnum } from 'src/core/http/docs/enum-docs'
import { zDateField } from 'src/core/http/docs/date-docs'
import { SeriesMiniSchema, UserMiniSchema } from 'src/core/models/user-mini.model'

// ============================================================================
// 1. REQUEST SCHEMAS (Giữ nguyên enum chuẩn để validate dữ liệu đầu vào)
// ============================================================================

export const CreateTransferRequestSchema = extendApi(
  z.object({
    seriesId: z.string().min(1),
    planDescription: z.string().min(1),
    proposedType: zEnum($Enums.TransferType, 'TransferType'),
    proposedPercentage: z.number().min(0).max(100).optional()
  }),
  { title: 'CreateTransferRequestBody', description: 'Mangaka B tạo yêu cầu chuyển nhượng tác phẩm' }
)

export const BoardDecisionTransferSchema = extendApi(
  z.object({
    boardSessionId: z.string().min(1),
    details: z.string().optional()
  }),
  { title: 'BoardDecisionTransferBody', description: 'Board duyệt/từ chối yêu cầu chuyển nhượng' }
)

// B-TRF-02 (Mô hình A): Board định giá lại + đặt điều kiện thanh toán cho HĐ FULL_BUYOUT mới của B.
// `type` validate theo Prisma enum `ConditionType` (CHAPTER_MILESTONE | RECURRING_CHAPTER | RANKING_MILESTONE | TIME_BOUND)
// — fail-fast 422 nếu Board gửi giá trị ngoài enum (tránh Prisma P2009 → 500 ở runtime).
export const AssignFullBuyoutSchema = extendApi(
  z.object({
    boardSessionId: z.string().min(1),
    valuationAmount: z.number().positive(),
    conditions: z
      .array(
        z.object({
          description: z.string().min(1),
          type: zEnum($Enums.ConditionType, 'ConditionType'),
          value: z.number().positive()
        })
      )
      .min(1)
  }),
  { title: 'AssignFullBuyoutBody', description: 'Board giao FULL_BUYOUT cho Mangaka B (định giá lại + điều kiện)' }
)

export const CreateTransferContractSchema = extendApi(
  z.object({
    transferRequestId: z.string().min(1),
    transferAmount: z.number().positive(),
    transferType: zEnum($Enums.TransferType, 'TransferType'),
    newOwnershipSplit: z
      .record(z.string(), z.number().min(0).max(100))
      .refine((split) => Math.abs(Object.values(split).reduce((a, b) => a + b, 0) - 100) < 1e-6, {
        message: 'Error.InvalidOwnershipSplit'
      })
      .describe('Cấu hình chia tỷ lệ sở hữu doanh thu mới — tổng các giá trị PHẢI = 100 (%)'),
    coOwnerApprovalRequired: z.boolean().default(false)
  }),
  { title: 'CreateTransferContractBody', description: 'Editor tạo hợp đồng chuyển nhượng 3 bên' }
)

export const SignTransferContractSchema = extendApi(
  z.object({
    otpCode: z.string().length(6)
  }),
  { title: 'SignTransferContractBody', description: 'Ký hợp đồng chuyển nhượng bằng OTP' }
)

export const CoOwnerRejectChapterSchema = extendApi(
  z.object({
    rejectReason: z.string().min(1)
  }),
  { title: 'CoOwnerRejectChapterBody', description: 'Co-owner từ chối chapter mới' }
)

// ============================================================================
// 2. RESPONSE SCHEMAS (trường Date dùng zDateField — Spec 12; z.any() chỉ còn cho JSON blob)
// ============================================================================

export const TransferRequestSchema = extendApi(
  z.object({
    id: z.string(),
    seriesId: z.string(),
    requestingMangakaId: z.string(),
    originalMangakaId: z.string(),
    series: SeriesMiniSchema.nullable().optional(),
    requestingMangaka: UserMiniSchema.nullable().optional(),
    originalMangaka: UserMiniSchema.nullable().optional(),
    originalContractType: z.string().nullable().optional(),
    proposedType: z.string().nullable().optional(),
    proposedPercentage: z.number().nullable().optional(),
    planDescription: z.string().nullable().optional(),
    originalContractId: z.string().nullable().optional(),
    status: zEnum($Enums.TransferRequestStatus, 'TransferRequestStatus'),
    boardDecisionId: z.string().nullable().optional(),
    createdAt: zDateField()
  }),
  { title: 'TransferRequestRes', description: 'Chi tiết yêu cầu chuyển nhượng' }
)

export const TransferContractSignatureSchema = extendApi(
  z.object({
    id: z.string(),
    transferContractId: z.string(),
    userId: z.string(),
    role: z.string(),
    signedAt: zDateField()
  }),
  { title: 'TransferContractSignature', description: 'Một chữ ký của hợp đồng chuyển nhượng' }
)

export const TransferContractSchema = extendApi(
  z.object({
    id: z.string(),
    transferRequestId: z.string().nullable().optional(),
    seriesId: z.string().nullable().optional(),
    fromMangakaId: z.string().nullable().optional(),
    toMangakaId: z.string().nullable().optional(),
    series: SeriesMiniSchema.nullable().optional(),
    fromMangaka: UserMiniSchema.nullable().optional(),
    toMangaka: UserMiniSchema.nullable().optional(),
    transferType: z.string().nullable().optional(),
    transferAmount: z.number().nullable().optional(),
    newOwnershipSplit: z.any().nullable().optional(),
    coOwnerApprovalRequired: z.boolean(),
    status: zEnum($Enums.TransferContractStatus, 'TransferContractStatus'),
    aSignedAt: zDateField().optional(),
    bSignedAt: zDateField().optional(),
    boardSignedAt: zDateField().optional(),
    createdAt: zDateField(),
    signatures: z.array(TransferContractSignatureSchema).optional()
  }),
  { title: 'TransferContractRes', description: 'Chi tiết hợp đồng chuyển nhượng' }
)

export const TransferRequestListSchema = extendApi(
  z.object({
    data: z.array(TransferRequestSchema)
  }),
  { title: 'TransferRequestListRes', description: 'Danh sách yêu cầu chuyển nhượng' }
)

export const TransferSignatureListSchema = extendApi(
  z.object({
    signatures: z.array(TransferContractSignatureSchema)
  }),
  { title: 'TransferSignatureListRes', description: 'Danh sách chữ ký hợp đồng chuyển nhượng' }
)
