import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { ConditionType, PaymentConditionStatus } from '@prisma/client'

export const PaymentConditionModelSchema = extendApi(
  z.object({
    id: z.string(),
    contractId: z.string(),
    conditionType: z.nativeEnum(ConditionType),
    thresholdConfig: z.any().nullable(),
    payoutAmount: z.number().nullable(),
    payoutPct: z.number().nullable(),
    isRecurring: z.boolean(),
    status: z.nativeEnum(PaymentConditionStatus),
    lastTriggeredValue: z.number().nullable(),
    achievedAt: z.any().nullable()
  }),
  {
    title: 'PaymentConditionModel',
    description: 'Một điều kiện thanh toán của hợp đồng'
  }
)

export type PaymentConditionModelType = z.infer<typeof PaymentConditionModelSchema>
