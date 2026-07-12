import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { PaymentRecordStatus, PaymentType, PaymentSource } from '@prisma/client'

export const PaymentRecordModelSchema = extendApi(
  z.object({
    id: z.string(),
    contractId: z.string(),
    conditionId: z.string().nullable(),
    receiverId: z.string(),
    seriesId: z.string().nullable(),
    description: z.string().nullable(),
    approvedBy: z.string().nullable(),
    approvedAt: z.any().nullable(),
    paymentType: z.nativeEnum(PaymentType),
    paymentSource: z.nativeEnum(PaymentSource),
    amount: z.number(),
    period: z.string().nullable(),
    paymentMethod: z.string().nullable(),
    transactionReference: z.string().nullable(),
    status: z.nativeEnum(PaymentRecordStatus),
    paidAt: z.any().nullable(),
    cancelledAt: z.any().nullable(),
    cancelReason: z.string().nullable(),
    note: z.string().nullable(),
    createdBy: z.string().nullable(),
    createdAt: z.any()
  }),
  {
    title: 'PaymentRecordModel',
    description: 'Một payment record'
  }
)

export type PaymentRecordModelType = z.infer<typeof PaymentRecordModelSchema>
