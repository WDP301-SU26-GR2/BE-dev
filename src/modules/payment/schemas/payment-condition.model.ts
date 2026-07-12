import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { ConditionType, $Enums } from '@prisma/client'
import { zEnum } from 'src/core/http/docs/enum-docs'
import { zDateField } from 'src/core/http/docs/date-docs'

export const PaymentConditionModelSchema = extendApi(
  z.object({
    id: z.string(),
    contractId: z.string(),
    conditionType: z.nativeEnum(ConditionType),
    thresholdConfig: z.any().nullable(),
    payoutAmount: z.number().nullable(),
    payoutPct: z.number().nullable(),
    isRecurring: z.boolean(),
    status: zEnum($Enums.PaymentConditionStatus, 'PaymentConditionStatus'),
    lastTriggeredValue: z.number().nullable(),
    achievedAt: zDateField().nullable()
  }),
  {
    title: 'PaymentConditionModel',
    description: 'Một điều kiện thanh toán của hợp đồng'
  }
)

export type PaymentConditionModelType = z.infer<typeof PaymentConditionModelSchema>
