import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { PaymentRecordStatus, PaymentType, PaymentSource } from '@prisma/client'
import { zDateField } from 'src/core/http/docs/date-docs'
import { PaymentMethod } from 'src/core/http/docs/bounded-string-enums'
import { zEnum, zEnumString } from 'src/core/http/docs/enum-docs'

export const PaymentRecordModelSchema = extendApi(
  z.object({
    id: z.string(),
    contractId: z.string(),
    conditionId: z.string().nullable(),
    receiverId: z.string(),
    seriesId: z.string().nullable(),
    description: z.string().nullable(),
    approvedBy: z.string().nullable(),
    approvedAt: zDateField().nullable(),
    paymentType: zEnum(PaymentType, 'PaymentType'),
    paymentSource: zEnum(PaymentSource, 'PaymentSource'),
    amount: z.number(),
    period: z.string().nullable(),
    paymentMethod: zEnumString(PaymentMethod, 'PaymentMethod').nullable(),
    transactionReference: z.string().nullable(),
    status: zEnum(PaymentRecordStatus, 'PaymentRecordStatus'),
    paidAt: zDateField().nullable(),
    cancelledAt: zDateField().nullable(),
    cancelReason: z.string().nullable(),
    note: z.string().nullable(),
    createdBy: z.string().nullable(),
    createdAt: zDateField()
  }),
  {
    title: 'PaymentRecordModel',
    description: 'Một payment record'
  }
)

export type PaymentRecordModelType = z.infer<typeof PaymentRecordModelSchema>
