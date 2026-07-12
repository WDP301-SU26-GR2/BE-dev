import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { $Enums } from '@prisma/client'
import { zEnum } from 'src/core/http/docs/enum-docs'
import { zDateField } from 'src/core/http/docs/date-docs'

// Body chung cho create/patch: các typed term optional (null/omit = không đổi).
const amendmentTermFields = {
  valuationAmount: z.number().positive({ message: 'valuationAmount phải lớn hơn 0' }).optional(),
  publisherOwnershipPct: z.number().min(0).max(100).optional(),
  mangakaOwnershipPct: z.number().min(0).max(100).optional(),
  terminationClause: z.string().min(1).optional(),
  contractStart: z
    .string()
    .datetime({ message: 'contractStart phải là ISO 8601' })
    .transform((v) => new Date(v))
    .optional(),
  contractEnd: z
    .string()
    .datetime({ message: 'contractEnd phải là ISO 8601' })
    .transform((v) => new Date(v))
    .optional()
}

// Ownership rule dùng chung: nếu gửi 1 trong 2 pct → phải gửi cả 2 & tổng = 100.
const ownershipRefine = (
  data: { publisherOwnershipPct?: number; mangakaOwnershipPct?: number; contractStart?: Date; contractEnd?: Date },
  ctx: z.RefinementCtx
) => {
  const hasPub = data.publisherOwnershipPct !== undefined
  const hasMan = data.mangakaOwnershipPct !== undefined
  if (hasPub !== hasMan) {
    ctx.addIssue({
      code: 'custom',
      message: 'Phải cung cấp đồng thời publisherOwnershipPct và mangakaOwnershipPct',
      path: [hasPub ? 'mangakaOwnershipPct' : 'publisherOwnershipPct']
    })
  } else if (hasPub && hasMan && data.publisherOwnershipPct! + data.mangakaOwnershipPct! !== 100) {
    ctx.addIssue({ code: 'custom', message: 'Tổng tỷ lệ sở hữu phải bằng 100%', path: ['mangakaOwnershipPct'] })
  }
  if (data.contractStart && data.contractEnd && data.contractStart >= data.contractEnd) {
    ctx.addIssue({ code: 'custom', message: 'contractStart phải trước contractEnd', path: ['contractEnd'] })
  }
}

export const CreateAmendmentBodySchema = extendApi(
  z
    .object({
      changedClauses: z.array(z.string().min(1)).min(1, { message: 'changedClauses cần ít nhất 1 mục mô tả' }),
      reason: z.string().min(1).optional(),
      ...amendmentTermFields
    })
    .strict()
    .superRefine(ownershipRefine),
  { title: 'CreateAmendmentBody', description: 'Editor tạo phụ lục hợp đồng (DRAFT)' }
)

export const UpdateAmendmentBodySchema = extendApi(
  z
    .object({
      changedClauses: z.array(z.string().min(1)).min(1).optional(),
      reason: z.string().min(1).optional(),
      ...amendmentTermFields
    })
    .strict()
    .superRefine(ownershipRefine),
  { title: 'UpdateAmendmentBody', description: 'Editor sửa phụ lục khi DRAFT (partial)' }
)

export const RejectAmendmentBodySchema = extendApi(
  z.object({ reason: z.string().min(1, { message: 'reason là bắt buộc' }) }).strict(),
  { title: 'RejectAmendmentBody', description: 'Mangaka từ chối phụ lục (về DRAFT)' }
)

export const VoidAmendmentBodySchema = extendApi(
  z.object({ voidReason: z.string().min(1, { message: 'voidReason là bắt buộc' }) }).strict(),
  { title: 'VoidAmendmentBody', description: 'Editor hủy phụ lục' }
)

export const SignAmendmentBodySchema = extendApi(
  z.object({ otpCode: z.string().length(6, { message: 'OTP phải đúng 6 ký số' }) }).strict(),
  { title: 'SignAmendmentBody', description: 'Ký phụ lục bằng OTP' }
)

export const AmendmentSignatureResSchema = z.object({
  id: z.string(),
  amendmentId: z.string(),
  userId: z.string(),
  role: z.string(),
  signedAt: zDateField()
})

export const AmendmentResSchema = extendApi(
  z.object({
    id: z.string(),
    contractId: z.string(),
    changedClauses: z.array(z.string()),
    reason: z.string().nullable(),
    status: zEnum($Enums.ContractAmendmentStatus, 'ContractAmendmentStatus'),
    triggerSource: zEnum($Enums.AmendmentTrigger, 'AmendmentTrigger'),
    valuationAmount: z.number().nullable(),
    publisherOwnershipPct: z.number().nullable(),
    mangakaOwnershipPct: z.number().nullable(),
    terminationClause: z.string().nullable(),
    contractStart: zDateField().nullable(),
    contractEnd: zDateField().nullable(),
    mangakaSignedAt: zDateField().nullable(),
    boardSignedAt: zDateField().nullable(),
    fullyExecutedAt: zDateField().nullable(),
    voidReason: z.string().nullable(),
    createdBy: z.string().nullable(),
    createdAt: zDateField(),
    signatures: z.array(AmendmentSignatureResSchema).optional()
  }),
  { title: 'AmendmentRes', description: 'Chi tiết phụ lục hợp đồng' }
)

export type CreateAmendmentBodyType = z.infer<typeof CreateAmendmentBodySchema>
export type UpdateAmendmentBodyType = z.infer<typeof UpdateAmendmentBodySchema>
