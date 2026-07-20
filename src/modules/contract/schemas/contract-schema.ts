import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { $Enums } from '@prisma/client'
import { zEnum } from 'src/core/http/docs/enum-docs'
import { zDateField } from 'src/core/http/docs/date-docs'
import { SeriesMiniSchema, UserMiniSchema } from 'src/core/models/user-mini.model'

// 1. Schema phục vụ API tạo bản thảo hợp đồng mới (POST /contracts)
export const CreateContractBodySchema = extendApi(
  z
    .object({
      seriesId: z
        .string({ error: 'seriesId phải là một chuỗi ký tự' })
        .min(1, { message: 'seriesId là bắt buộc không được để trống' }),
      mangakaId: z
        .string({ error: 'mangakaId phải là một chuỗi ký tự' })
        .min(1, { message: 'mangakaId là bắt buộc không được để trống' }),
      boardDecisionId: z
        .string({ error: 'boardDecisionId phải là một chuỗi ký tự' })
        .min(1, { message: 'boardDecisionId liên kết quyết định hội đồng là bắt buộc' }),

      contractType: zEnum($Enums.ContractType, 'ContractType'),

      valuationAmount: z
        .number({ error: 'valuationAmount phải là một số' })
        .min(0, { message: 'valuationAmount không được nhỏ hơn 0' }),
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
    .superRefine(({ contractType, publisherOwnershipPct, mangakaOwnershipPct }, ctx) => {
      if (contractType === 'FULL_BUYOUT') return

      if (publisherOwnershipPct + mangakaOwnershipPct !== 100) {
        ctx.addIssue({
          code: 'custom',
          message: 'Tổng phần trăm sở hữu của Nhà xuất bản và Tác giả bắt buộc phải bằng 100%',
          path: ['mangakaOwnershipPct']
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
      valuationAmount: z.number().min(0).optional(),
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
    .strict()
    .superRefine(({ contractType, publisherOwnershipPct, mangakaOwnershipPct }, ctx) => {
      if (contractType === 'FULL_BUYOUT') return

      const hasPub = publisherOwnershipPct !== undefined
      const hasMan = mangakaOwnershipPct !== undefined

      if (hasPub && hasMan) {
        if (publisherOwnershipPct + mangakaOwnershipPct !== 100) {
          ctx.addIssue({
            code: 'custom',
            message: 'Tổng phần trăm sở hữu sau khi thay đổi cấu trúc phải đạt chính xác 100%',
            path: ['mangakaOwnershipPct']
          })
        }
      } else if (hasPub || hasMan) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Khi thay đổi tỷ lệ phần trăm sở hữu, bạn bắt buộc phải cung cấp đồng thời cả publisherOwnershipPct và mangakaOwnershipPct',
          path: [hasPub ? 'mangakaOwnershipPct' : 'publisherOwnershipPct']
        })
      }
    }),
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
    boardSignedAt: zDateField().nullable(),
    createdAt: zDateField()
  }),
  { title: 'ContractRes', description: 'Chi tiết hợp đồng' }
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
    status: z.string(),
    module: z.string()
  }),
  { title: 'ContractHealthRes', description: 'Health check module contract' }
)

export const ContractSignResSchema = extendApi(
  z.object({
    status: z.string(),
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
    boardProgress: z.object({
      totalRequired: z.number(),
      totalSigned: z.number(),
      signedEditors: z.array(
        z.object({
          id: z.string(),
          actionAt: zDateField()
        })
      ),
      pendingEditors: z.array(
        z.object({
          id: z.string(),
          actionAt: z.null()
        })
      )
    })
  }),
  { title: 'ContractStatusProgressRes', description: 'Trạng thái hợp đồng và tiến độ ký' }
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

// 5. B-CON-02: lý do BẮT BUỘC khi yêu cầu chỉnh sửa điều khoản (cả phía Mangaka lẫn Hội đồng).
// Không có lý do thì Editor không biết sửa gì → vòng thương lượng BR-CONTRACT-02 gãy.
// Cùng shape với RevisionReasonBodySchema của manuscript (chapter) để FE dùng nhất quán.
export const ContractChangeReasonBodySchema = z
  .object({
    reason: z
      .string({ error: 'reason phải là một chuỗi ký tự' })
      .min(1, { message: 'reason là bắt buộc không được để trống' })
      .max(1000, { message: 'reason tối đa 1000 ký tự' })
  })
  .strict()

export type ContractChangeReasonBodyType = z.infer<typeof ContractChangeReasonBodySchema>
