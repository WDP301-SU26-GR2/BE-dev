import { z } from 'zod'
import { $Enums } from '@prisma/client'
import { extendApi } from '@anatine/zod-openapi'
import { zEnum, zEnumString } from 'src/core/http/docs/enum-docs'
import { zDateField } from 'src/core/http/docs/date-docs'
import { SeriesMiniSchema, UserMiniSchema } from 'src/core/models/user-mini.model'
import { TransferMessages } from '../transfer.messages'
import { zObjectId } from 'src/core/http/schemas/object-id.schema'
import { zMoney } from 'src/core/http/schemas/money.schema'

export const OwnershipSplitSchema = z
  .record(z.string(), z.number().min(0).max(100))
  .refine((split) => Math.abs(Object.values(split).reduce((a, b) => a + b, 0) - 100) < 1e-6, {
    message: TransferMessages.error.invalidOwnershipSplit
  })
  .describe('New revenue ownership split; values must total exactly 100 percent')

// ============================================================================
// 1. REQUEST SCHEMAS (Giữ nguyên enum chuẩn để validate dữ liệu đầu vào)
// ============================================================================

export const CreateTransferRequestSchema = extendApi(
  z
    .object({
      seriesId: zObjectId('Mã bộ truyện không hợp lệ'),
      planDescription: z.string().min(1),
      proposedType: zEnum($Enums.TransferType, 'TransferType'),
      proposedPercentage: z.number().positive().max(100).optional()
    })
    .superRefine((value, ctx) => {
      const isPartial = value.proposedType === $Enums.TransferType.PARTIAL_TRANSFER
      if (
        (isPartial && (value.proposedPercentage == null || value.proposedPercentage >= 100)) ||
        (!isPartial && value.proposedPercentage != null)
      ) {
        ctx.addIssue({
          code: 'custom',
          message: TransferMessages.error.invalidProposal,
          path: ['proposedPercentage']
        })
      }
    }),
  { title: 'CreateTransferRequestBody', description: 'Mangaka B tạo yêu cầu chuyển nhượng tác phẩm' }
)

export const BoardDecisionTransferSchema = extendApi(
  z
    .object({
      boardDecisionId: z.string().min(1).optional().describe('Quyết định TRANSFER terminal có thẩm quyền'),
      boardSessionId: z
        .string()
        .min(1)
        .optional()
        .describe('Deprecated: chỉ resolve khi phiên có đúng một quyết định TRANSFER terminal'),
      details: z.string().optional()
    })
    .superRefine((value, ctx) => {
      if ((value.boardDecisionId ? 1 : 0) + (value.boardSessionId ? 1 : 0) !== 1) {
        ctx.addIssue({
          code: 'custom',
          message: TransferMessages.error.transferDecisionReferenceRequired,
          path: ['boardDecisionId']
        })
      }
    }),
  { title: 'BoardDecisionTransferBody', description: 'Board duyệt/từ chối yêu cầu chuyển nhượng' }
)

// B-TRF-02 (Mô hình A): Board định giá lại + đặt điều kiện thanh toán cho HĐ FULL_BUYOUT mới của B.
// `type` validate theo Prisma enum `ConditionType` (CHAPTER_MILESTONE | RECURRING_CHAPTER | RANKING_MILESTONE | TIME_BOUND)
// — fail-fast 422 nếu Board gửi giá trị ngoài enum (tránh Prisma P2009 → 500 ở runtime).
export const AssignFullBuyoutSchema = extendApi(
  z.object({
    boardSessionId: z
      .string()
      .min(1)
      .optional()
      .describe('Deprecated compatibility field; ignored in favor of request.boardDecisionId'),
    valuationAmount: zMoney({ positive: true }),
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

// §v2 point 3: query lọc list Editor. Một field optional để tránh gotcha "empty strict query" của nestjs-zod.
export const ListTransferRequestsQuerySchema = extendApi(
  z
    .object({
      status: zEnum($Enums.TransferRequestStatus, 'TransferRequestStatus').optional()
    })
    .strict(),
  { title: 'ListTransferRequestsQuery', description: 'Lọc danh sách yêu cầu chuyển nhượng theo trạng thái' }
)

export const CreateTransferContractSchema = extendApi(
  z.object({
    transferRequestId: z.string().min(1),
    transferAmount: zMoney({ positive: true }),
    transferType: zEnum($Enums.TransferType, 'TransferType'),
    newOwnershipSplit: OwnershipSplitSchema,
    coOwnerApprovalRequired: z.boolean().default(false)
  }),
  { title: 'CreateTransferContractBody', description: 'Editor tạo hợp đồng chuyển nhượng 3 bên' }
)

// §v2 point 7: response của assign-full-buyout mang replacementContractId + requestStatus (không chỉ message).
export const AssignFullBuyoutResSchema = extendApi(
  z.object({
    message: z.string(),
    replacementContractId: z.string().describe('Contract (hợp đồng XUẤT BẢN mới, Full Buyout) vừa tạo cho Mangaka B'),
    requestStatus: zEnum($Enums.TransferRequestStatus, 'TransferRequestStatus')
  }),
  { title: 'AssignFullBuyoutRes', description: 'Kết quả giao Full Buyout: đã tạo hợp đồng thay thế, chờ ký' }
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
    originalContractType: zEnumString($Enums.ContractType, 'ContractType').nullable().optional(),
    proposedType: zEnum($Enums.TransferType, 'TransferType').nullable().optional(),
    proposedPercentage: z.number().nullable().optional(),
    planDescription: z.string().nullable().optional(),
    originalContractId: z
      .string()
      .nullable()
      .optional()
      .describe(
        'Contract (hợp đồng XUẤT BẢN) đang có hiệu lực của series — căn cứ chuyển nhượng, KHÔNG phải hợp đồng chuyển nhượng'
      ),
    // Spec 27: đảm bảo có mặt (null nếu chưa soạn HĐ) ở 3 đường ĐỌC — `GET /transfers/requests/:id`,
    // `/mine`, `/pending-board`. Route MUTATION (tạo request, board-approve/reject, start-negotiation,
    // mangaka-accept/reject) KHÔNG mang field này — đúng quy ước Spec 20 (enrichment chỉ đảm bảo ở read
    // path), và ở mọi mốc mutation đó thì hợp đồng chuyển nhượng chưa tồn tại nên cũng không mất gì.
    transferContractId: z
      .string()
      .nullable()
      .optional()
      .describe(
        'TransferContract (hợp đồng CHUYỂN NHƯỢNG 3 bên) đã soạn cho yêu cầu này; null khi Editor chưa soạn. Dùng id này gọi GET /transfers/contracts/:id và POST /transfers/contracts/:id/sign. CHỈ có ở 3 route GET request; response của route mutation không mang field này'
      ),
    // §v2 point 7: Full Buyout (Mô hình A) tạo Contract mới (không phải TransferContract) → tra theo
    // Contract.sourceTransferRequestId. Dùng id này để FE mở đúng hợp đồng thay thế thay vì list chung.
    replacementContractId: z
      .string()
      .nullable()
      .optional()
      .describe(
        'Contract thay thế (Full Buyout Mô hình A) sinh từ yêu cầu này; null nếu chưa có / không phải Full Buyout'
      ),
    status: zEnum($Enums.TransferRequestStatus, 'TransferRequestStatus'),
    boardDecisionId: z.string().nullable().optional(),
    createdAt: zDateField()
  }),
  { title: 'TransferRequestRes', description: 'Chi tiết yêu cầu chuyển nhượng' }
)

export const TransferRequestListItemSchema = extendApi(
  TransferRequestSchema.omit({
    planDescription: true
  }),
  {
    title: 'TransferRequestListItemRes',
    description: 'Transfer request list item without long handover plan payload'
  }
)

export const TransferContractSignatureSchema = extendApi(
  z.object({
    id: z.string(),
    transferContractId: z.string(),
    userId: z.string(),
    role: zEnum($Enums.TransferSignerRole, 'TransferSignerRole'),
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
    transferType: zEnum($Enums.TransferType, 'TransferType').nullable().optional(),
    transferAmount: z.number().nullable().optional(),
    newOwnershipSplit: OwnershipSplitSchema.nullable().optional(),
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
    data: z.array(TransferRequestListItemSchema)
  }),
  { title: 'TransferRequestListRes', description: 'Danh sách yêu cầu chuyển nhượng' }
)

export const TransferSignatureListSchema = extendApi(
  z.object({
    signatures: z.array(TransferContractSignatureSchema)
  }),
  { title: 'TransferSignatureListRes', description: 'Danh sách chữ ký hợp đồng chuyển nhượng' }
)
