import { z } from 'zod'
import { $Enums } from '@prisma/client'
import { extendApi } from '@anatine/zod-openapi'

// ============================================================================
// 1. REQUEST SCHEMAS (Giữ nguyên enum chuẩn để validate dữ liệu đầu vào)
// ============================================================================

export const CreateTransferRequestSchema = extendApi(
  z.object({
    seriesId: z.string().min(1, 'SERIES_ID_REQUIRED'),
    planDescription: z.string().min(1, 'PLAN_DESCRIPTION_REQUIRED'),
    proposedType: z.nativeEnum($Enums.TransferType),
    proposedPercentage: z.number().min(0).max(100).optional()
  }),
  { title: 'CreateTransferRequestBody', description: 'Mangaka B tạo yêu cầu chuyển nhượng tác phẩm' }
)

export const BoardDecisionTransferSchema = extendApi(
  z.object({
    boardSessionId: z.string().min(1, 'BOARD_SESSION_ID_REQUIRED'),
    details: z.string().optional()
  }),
  { title: 'BoardDecisionTransferBody', description: 'Board duyệt/từ chối yêu cầu chuyển nhượng' }
)

// B-TRF-02 (Mô hình A): Board định giá lại + đặt điều kiện thanh toán cho HĐ FULL_BUYOUT mới của B.
export const AssignFullBuyoutSchema = extendApi(
  z.object({
    boardSessionId: z.string().min(1, 'BOARD_SESSION_ID_REQUIRED'),
    valuationAmount: z.number().positive('VALUATION_MUST_BE_POSITIVE'),
    conditions: z
      .array(
        z.object({
          description: z.string().min(1),
          type: z.string().min(1),
          value: z.number().positive()
        })
      )
      .min(1, 'AT_LEAST_ONE_CONDITION')
  }),
  { title: 'AssignFullBuyoutBody', description: 'Board giao FULL_BUYOUT cho Mangaka B (định giá lại + điều kiện)' }
)

export const CreateTransferContractSchema = extendApi(
  z.object({
    transferRequestId: z.string().min(1, 'TRANSFER_REQUEST_ID_REQUIRED'),
    transferAmount: z.number().positive('AMOUNT_MUST_BE_POSITIVE'),
    transferType: z.nativeEnum($Enums.TransferType),
    newOwnershipSplit: z.record(z.string(), z.any()).describe('Cấu hình chia tỷ lệ sở hữu doanh thu mới'),
    coOwnerApprovalRequired: z.boolean().default(false)
  }),
  { title: 'CreateTransferContractBody', description: 'Editor tạo hợp đồng chuyển nhượng 3 bên' }
)

export const SignTransferContractSchema = extendApi(
  z.object({
    otpCode: z.string().length(6, 'OTP_MUST_BE_6_DIGITS')
  }),
  { title: 'SignTransferContractBody', description: 'Ký hợp đồng chuyển nhượng bằng OTP' }
)

export const CoOwnerRejectChapterSchema = extendApi(
  z.object({
    rejectReason: z.string().min(1, 'REJECT_REASON_REQUIRED')
  }),
  { title: 'CoOwnerRejectChapterBody', description: 'Co-owner từ chối chapter mới' }
)

// ============================================================================
// 2. RESPONSE SCHEMAS (Đã tối giản bằng z.any() cho các trường Date)
// ============================================================================

export const TransferRequestSchema = extendApi(
  z.object({
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
    createdAt: z.any()
  }),
  { title: 'TransferRequestRes', description: 'Chi tiết yêu cầu chuyển nhượng' }
)

export const TransferContractSignatureSchema = extendApi(
  z.object({
    id: z.string(),
    transferContractId: z.string(),
    userId: z.string(),
    role: z.string(),
    signedAt: z.any()
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
    transferType: z.string().nullable().optional(),
    transferAmount: z.number().nullable().optional(),
    newOwnershipSplit: z.any().nullable().optional(),
    coOwnerApprovalRequired: z.boolean(),
    status: z.string(),
    aSignedAt: z.any().optional(),
    bSignedAt: z.any().optional(),
    boardSignedAt: z.any().optional(),
    createdAt: z.any(),
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
