import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { ConditionType } from '@prisma/client'
import { PaymentConditionModelSchema } from './payment-condition.model'

const payoutFields = {
  payoutAmount: z.number().min(0).optional(),
  payoutPct: z.number().min(0).max(100).optional()
}

export const CreatePaymentConditionBodySchema = extendApi(
  z
    .object({
      conditionType: z.nativeEnum(ConditionType),
      thresholdConfig: z.unknown(),
      isRecurring: z.boolean().optional().default(false),
      ...payoutFields
    })
    .strict()
    .superRefine((data, ctx) => {
      if (data.payoutAmount == null && data.payoutPct == null) {
        ctx.addIssue({
          code: 'custom',
          message: 'payoutAmount hoặc payoutPct phải được cung cấp',
          path: ['payoutAmount']
        })
      }

      if (data.conditionType === ConditionType.CHAPTER_MILESTONE) {
        const result = z.object({ chapter: z.number().int().positive() }).strict().safeParse(data.thresholdConfig)
        if (!result.success) {
          ctx.addIssue({
            code: 'custom',
            message: result.error.issues.map((issue) => issue.message).join('; '),
            path: ['thresholdConfig']
          })
        }
      }

      if (data.conditionType === ConditionType.RECURRING_CHAPTER) {
        const result = z.object({ every: z.number().int().positive() }).strict().safeParse(data.thresholdConfig)
        if (!result.success) {
          ctx.addIssue({
            code: 'custom',
            message: result.error.issues.map((issue) => issue.message).join('; '),
            path: ['thresholdConfig']
          })
        }
        if (!data.isRecurring) {
          ctx.addIssue({
            code: 'custom',
            message: 'Điều kiện theo chu kỳ chương phải được đánh dấu là định kỳ',
            path: ['isRecurring']
          })
        }
      }

      if (data.conditionType === ConditionType.RANKING_MILESTONE) {
        const result = z.object({ topRank: z.number().int().positive() }).strict().safeParse(data.thresholdConfig)
        if (!result.success) {
          ctx.addIssue({
            code: 'custom',
            message: result.error.issues.map((issue) => issue.message).join('; '),
            path: ['thresholdConfig']
          })
        }
      }

      if (data.conditionType === ConditionType.TIME_BOUND) {
        const result = z
          .object({
            deadline: z
              .string()
              .min(1)
              .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'deadline phải có định dạng YYYY-MM-DD' })
          })
          .strict()
          .safeParse(data.thresholdConfig)
        if (!result.success) {
          ctx.addIssue({
            code: 'custom',
            message: result.error.issues.map((issue) => issue.message).join('; '),
            path: ['thresholdConfig']
          })
        }
      }
    }),
  {
    title: 'CreatePaymentConditionBody',
    description: 'Editor tạo điều kiện thanh toán cho hợp đồng'
  }
)

export const UpdatePaymentConditionBodySchema = extendApi(
  z
    .object({
      thresholdConfig: z.unknown().optional(),
      payoutAmount: z.number().min(0).optional(),
      payoutPct: z.number().min(0).max(100).optional(),
      isRecurring: z.boolean().optional()
    })
    .strict()
    .refine(
      (data) =>
        data.thresholdConfig !== undefined ||
        data.payoutAmount !== undefined ||
        data.payoutPct !== undefined ||
        data.isRecurring !== undefined,
      { message: 'Phải cung cấp ít nhất một trường để cập nhật' }
    ),
  {
    title: 'UpdatePaymentConditionBody',
    description: 'Editor cập nhật điều kiện thanh toán'
  }
)

export const PaymentConditionResSchema = extendApi(PaymentConditionModelSchema, {
  title: 'PaymentConditionRes',
  description: 'Chi tiết điều kiện thanh toán'
})

export const PaymentConditionListResSchema = extendApi(
  z.object({
    data: z.array(PaymentConditionModelSchema)
  }),
  {
    title: 'PaymentConditionListRes',
    description: 'Danh sách điều kiện thanh toán'
  }
)

export type CreatePaymentConditionBodyType = z.infer<typeof CreatePaymentConditionBodySchema>
export type UpdatePaymentConditionBodyType = z.infer<typeof UpdatePaymentConditionBodySchema>
