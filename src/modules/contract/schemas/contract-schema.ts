import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { $Enums } from '@prisma/client'
import { zEnum, zEnumString } from 'src/core/http/docs/enum-docs'
import { zDateField } from 'src/core/http/docs/date-docs'
import { zObjectId } from 'src/core/http/schemas/object-id.schema'
import { zMoney } from 'src/core/http/schemas/money.schema'
import { SeriesMiniSchema, UserMiniSchema } from 'src/core/models/user-mini.model'

// 1. Schema phục vụ API tạo bản thảo hợp đồng mới (POST /contracts)
export const CreateContractBodySchema = extendApi(
  z
    .object({
      seriesId: zObjectId('seriesId phải là ObjectId hợp lệ'),
      mangakaId: zObjectId('mangakaId phải là ObjectId hợp lệ'),
      boardDecisionId: zObjectId('boardDecisionId phải là ObjectId hợp lệ'),

      contractType: zEnum($Enums.ContractType, 'ContractType'),

      valuationAmount: zMoney({ positive: true }),
      publisherOwnershipPct: z.number({ error: 'publisherOwnershipPct phải là một số' }).min(0).max(100),
      mangakaOwnershipPct: z.number({ error: 'mangakaOwnershipPct phải là một số' }).min(0).max(100),
      terminationClause: z
        .string({ error: 'terminationClause phải là một chuỗi ký tự' })
        .min(1, { message: 'terminationClause là bắt buộc' }),

      contractStart: z
        .string()
        .datetime({ message: 'contractStart phải là chuỗi định dạng ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)' })
        .transform((val) => new Date(val)),

      contractEnd: z
        .string()
        .datetime({ message: 'contractEnd phải là chuỗi định dạng ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)' })
        .transform((val) => new Date(val))
    })
    .strict()
    .superRefine(({ contractType, publisherOwnershipPct, mangakaOwnershipPct, contractStart, contractEnd }, ctx) => {
      if (contractType === 'FULL_BUYOUT') {
        if (publisherOwnershipPct !== 100 || mangakaOwnershipPct !== 0) {
          ctx.addIssue({
            code: 'custom',
            message: 'FULL_BUYOUT bắt buộc Nhà xuất bản 100% và Tác giả 0%',
            path: ['publisherOwnershipPct']
          })
        }
      } else {
        if (!(publisherOwnershipPct > 0 && publisherOwnershipPct < 100)) {
          ctx.addIssue({
            code: 'custom',
            message: 'REVENUE_SHARE: tỷ lệ sở hữu của Nhà xuất bản phải trong khoảng (0,100)',
            path: ['publisherOwnershipPct']
          })
        }
        if (!(mangakaOwnershipPct > 0 && mangakaOwnershipPct < 100)) {
          ctx.addIssue({
            code: 'custom',
            message: 'REVENUE_SHARE: tỷ lệ sở hữu của Tác giả phải trong khoảng (0,100)',
            path: ['mangakaOwnershipPct']
          })
        }
        if (publisherOwnershipPct + mangakaOwnershipPct !== 100) {
          ctx.addIssue({
            code: 'custom',
            message: 'Tổng phần trăm sở hữu của Nhà xuất bản và Tác giả bắt buộc phải bằng 100%',
            path: ['mangakaOwnershipPct']
          })
        }
      }
      if (contractEnd.getTime() <= contractStart.getTime()) {
        ctx.addIssue({
          code: 'custom',
          message: 'contractEnd phải sau contractStart',
          path: ['contractEnd']
        })
      }
    }),
  { title: 'CreateContractBody', description: 'Editor tạo hợp đồng nháp cho series' }
)

// 2. Schema phục vụ API Editor cập nhật sửa đổi điều khoản thương lượng (PATCH /contracts/:id)
export const EditorUpdateContractBodySchema = extendApi(
  z
    .object({
      contractType: zEnum($Enums.ContractType, 'ContractType').optional(),
      valuationAmount: zMoney({ positive: true }).optional(),
      publisherOwnershipPct: z.number().min(0).max(100).optional(),
      mangakaOwnershipPct: z.number().min(0).max(100).optional(),
      terminationClause: z.string().optional(),
      contractStart: z
        .string()
        .datetime()
        .transform((val) => new Date(val))
        .optional(),
      contractEnd: z
        .string()
        .datetime()
        .transform((val) => new Date(val))
        .optional(),
      note: z.string().max(500, { message: 'Nội dung ghi chú lịch sử phiên bản không được quá 500 ký tự' }).optional()
    })
    .strict(),
  { title: 'EditorUpdateContractBody', description: 'Editor cập nhật điều khoản hợp đồng nháp' }
)

// 3. Schema phục vụ API xác thực chữ ký bảo mật số bằng mã OTP (POST /contracts/:id/sign-...)
export const SignContractWithOtpBodySchema = extendApi(
  z
    .object({
      otpCode: z.string().length(6, { message: 'Mã xác thực OTP bắt buộc phải nhập đúng 6 ký số' })
    })
    .strict(),
  { title: 'SignContractWithOtpBody', description: 'Xác thực chữ ký hợp đồng bằng OTP' }
)

export const ContractResSchema = extendApi(
  z.object({
    id: z.string(),
    seriesId: z.string(),
    mangakaId: z.string(),
    editorId: z.string().nullable(),
    series: SeriesMiniSchema.optional().describe('Thông tin hiển thị — CÓ ở GET list/detail'),
    mangaka: UserMiniSchema.optional().describe('Thông tin hiển thị — CÓ ở GET list/detail'),
    editor: UserMiniSchema.nullable().optional().describe('null = chưa gán; absent ở mutation path'),
    boardDecisionId: z.string().nullable(),
    boardDecision: z
      .object({
        id: z.string(),
        decisionType: zEnum($Enums.DecisionType, 'DecisionType').nullable(),
        result: zEnum($Enums.BoardDecisionResult, 'BoardDecisionResult').nullable(),
        decidedAt: zDateField().nullable().describe('Thời điểm Board chốt Decision; null khi chưa finalize'),
        boardSession: z.object({
          id: z.string(),
          title: z.string(),
          startTime: zDateField()
        })
      })
      .nullable()
      .optional()
      .describe('Căn cứ Board Decision và phiên họp nguồn; có ở GET list/detail'),
    sourceTransferRequestId: z.string().nullable().optional(),
    contractType: zEnum($Enums.ContractType, 'ContractType'),
    valuationAmount: z.number().nullable(),
    publisherOwnershipPct: z.number().nullable(),
    mangakaOwnershipPct: z.number().nullable(),
    terminationClause: z.string().nullable(),
    contractStart: zDateField().nullable(),
    contractEnd: zDateField().nullable(),
    status: zEnum($Enums.ContractStatus, 'ContractStatus'),
    mangakaSignedAt: zDateField().nullable(),
    representativeId: z.string().nullable().optional(),
    representative: UserMiniSchema.nullable()
      .optional()
      .describe('Đại diện Hội đồng đã claim/gán; absent ở mutation path'),
    representativeSignedAt: zDateField().nullable().optional(),
    supersedesContractId: z.string().nullable().optional(),
    rejectionReason: z.string().nullable().optional(),
    mangakaRejectedAt: zDateField().nullable().optional(),
    createdAt: zDateField()
  }),
  { title: 'ContractRes', description: 'Chi tiết hợp đồng' }
)

export const ContractListItemSchema = extendApi(
  ContractResSchema.omit({
    boardDecision: true,
    terminationClause: true,
    sourceTransferRequestId: true,
    mangakaSignedAt: true,
    representativeSignedAt: true,
    mangakaRejectedAt: true,
    rejectionReason: true
  }),
  {
    title: 'ContractListItemRes',
    description: 'Contract list item without Board decision payload and signature timestamps'
  }
)

export const ContractVersionResSchema = extendApi(
  z.object({
    id: z.string(),
    contractId: z.string(),
    versionNumber: z.number(),
    valuationAmount: z.number().nullable(),
    publisherOwnershipPct: z.number().nullable(),
    mangakaOwnershipPct: z.number().nullable(),
    terminationClause: z.string().nullable(),
    editedById: z.string(),
    note: z.string().nullable(),
    createdAt: zDateField()
  }),
  { title: 'ContractVersionRes', description: 'Chi tiết phiên bản hợp đồng' }
)

export const ContractHealthResSchema = extendApi(
  z.object({
    status: zEnumString({ OK: 'OK' } as const, 'ContractHealthStatus'),
    module: z.string()
  }),
  { title: 'ContractHealthRes', description: 'Health check module contract' }
)

export const ContractSignResSchema = extendApi(
  z.object({
    status: zEnum($Enums.ContractStatus, 'ContractStatus'),
    message: z.string(),
    contract: ContractResSchema.nullable()
  }),
  { title: 'ContractSignRes', description: 'Kết quả ký hợp đồng' }
)

export const ContractStatusProgressResSchema = extendApi(
  z.object({
    id: z.string(),
    status: zEnum($Enums.ContractStatus, 'ContractStatus'),
    mangaka: z.object({
      id: z.string(),
      isSigned: z.boolean(),
      signedAt: zDateField().nullable()
    }),
    representative: z.object({
      id: z.string().nullable().describe('null = chưa ai claim'),
      claimed: z.boolean(),
      signed: z.boolean(),
      signedAt: zDateField().nullable()
    })
  }),
  { title: 'ContractStatusProgressRes', description: 'Trạng thái hợp đồng và tiến độ ký' }
)

export const RejectContractBodySchema = z
  .object({
    reason: z.string().min(1, { message: 'reason là bắt buộc' }).max(1000)
  })
  .strict()

// Spec 2026-08-06 — Group F: Void contract draft
export const VoidContractBodySchema = z
  .object({
    reason: z.string().min(1, { message: 'reason là bắt buộc' }).max(1000).describe('Lý do huỷ hợp đồng nháp')
  })
  .strict()

export const AssignRepresentativeBodySchema = z
  .object({
    representativeId: zObjectId('representativeId phải là ObjectId hợp lệ')
  })
  .strict()

export const CreateContractCommentBodySchema = z
  .object({
    content: z.string().trim().min(1).max(2000)
  })
  .strict()

export const ContractCommentResSchema = extendApi(
  z.object({
    id: z.string(),
    contractId: z.string(),
    authorId: z.string(),
    author: UserMiniSchema.nullable().optional(),
    content: z.string(),
    createdAt: zDateField()
  }),
  { title: 'ContractCommentRes', description: 'Góp ý tư vấn của Board cho hợp đồng' }
)

export const ContractCommentListResSchema = extendApi(
  z.object({
    data: z.array(ContractCommentResSchema)
  }),
  { title: 'ContractCommentListRes', description: 'Danh sách góp ý hợp đồng' }
)

export const ContractPdfResSchema = extendApi(
  z.object({
    downloadUrl: z.string().describe('Presigned GET URL; open or download before expiresAt'),
    expiresAt: z.string().describe('ISO 8601 expiry of downloadUrl'),
    key: z.string().describe('Version-derived object storage key for the contract PDF')
  }),
  { title: 'ContractPdfRes', description: 'Presigned download for a signed Contract PDF' }
)

// Cung cấp các Types gọn gàng ra bên ngoài
export type CreateContractBodyType = z.infer<typeof CreateContractBodySchema>
export type EditorUpdateContractBodyType = z.infer<typeof EditorUpdateContractBodySchema>
export type SignContractWithOtpBodyType = z.infer<typeof SignContractWithOtpBodySchema>
export type RejectContractBodyType = z.infer<typeof RejectContractBodySchema>
export type VoidContractBodyType = z.infer<typeof VoidContractBodySchema>
export type AssignRepresentativeBodyType = z.infer<typeof AssignRepresentativeBodySchema>
export type CreateContractCommentBodyType = z.infer<typeof CreateContractCommentBodySchema>

// 4. Schema phục vụ API nhập doanh thu kỳ cho hợp đồng REVENUE_SHARE (B-CON-07, POST /contracts/:id/revenue)
export const ReportRevenueBodySchema = z
  .object({
    revenue: z.number({ error: 'revenue phải là một số' }).positive({ message: 'revenue phải lớn hơn 0' }),
    period: z
      .string({ error: 'period phải là một chuỗi ký tự' })
      .min(1, { message: 'period là bắt buộc không được để trống' })
  })
  .strict()

export type ReportRevenueBodyType = z.infer<typeof ReportRevenueBodySchema>
