import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { PaymentRecordStatus, PaymentType, PaymentSource } from '@prisma/client'
import { zDateField } from 'src/core/http/docs/date-docs'

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
    paymentType: z.nativeEnum(PaymentType),
    paymentSource: z.nativeEnum(PaymentSource),
    amount: z.number(),
    period: z.string().nullable(),
    paymentMethod: z.string().nullable(),
    transactionReference: z.string().nullable(),
    status: z.nativeEnum(PaymentRecordStatus),
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
