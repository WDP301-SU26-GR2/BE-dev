import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { PaymentRecordStatus, PaymentType, PaymentSource } from '@prisma/client'
import { PaymentRecordModelSchema } from './payment.model'

// ============================================================================
// 1. REQUEST SCHEMAS (Dữ liệu đầu vào)
// ============================================================================

export const GetPaymentsQuerySchema = extendApi(
  z
    .object({
      status: z.nativeEnum(PaymentRecordStatus).optional(),
      receiverId: z.string().optional(),
      seriesId: z.string().optional(),
      contractId: z.string().optional(),
      paymentType: z.nativeEnum(PaymentType).optional(),
      paymentSource: z.nativeEnum(PaymentSource).optional()
    })
    .strict(),
  {
    title: 'GetPaymentsQuery',
    description: 'Lọc danh sách payment'
  }
)

export const ApprovePaymentBodySchema = extendApi(
  z
    .object({
      approvedBy: z.string().min(1, { message: 'approvedBy (ID người duyệt) là bắt buộc' })
    })
    .strict(),
  {
    title: 'ApprovePaymentBody',
    description: 'Board duyệt payment'
  }
)

export const PayPaymentBodySchema = extendApi(
  z
    .object({
      paymentMethod: z.string().min(1, { message: 'paymentMethod là bắt buộc' }),
      transactionReference: z.string().min(1, { message: 'transactionReference là bắt buộc' }),
      note: z.string().optional()
    })
    .strict(),
  {
    title: 'PayPaymentBody',
    description: 'Xác nhận payment đã được chuyển tiền'
  }
)

export const CancelPaymentBodySchema = extendApi(
  z
    .object({
      cancelReason: z.string().min(1, { message: 'cancelReason là bắt buộc' })
    })
    .strict(),
  {
    title: 'CancelPaymentBody',
    description: 'Hủy payment chưa PAID'
  }
)

export const CreatePaymentInternalSchema = extendApi(
  z
    .object({
      receiverId: z.string().min(1),
      amount: z.number().positive({ message: 'amount phải lớn hơn 0' }),
      paymentType: z.nativeEnum(PaymentType),
      paymentSource: z.nativeEnum(PaymentSource).default(PaymentSource.CONTRACT),
      contractId: z.string().min(1),
      conditionId: z.string().optional(),
      seriesId: z.string().optional(),
      period: z.string().optional(),
      description: z.string().optional(),
      createdBy: z.string().optional()
    })
    .strict(),
  {
    title: 'CreatePaymentInternal',
    description: 'Hệ thống tạo payment nội bộ'
  }
)

// ============================================================================
// 2. RESPONSE SCHEMAS (Dữ liệu đầu ra - Đã chuyển từ DTO sang đây)
// ============================================================================

export const PaymentRecordResSchema = extendApi(PaymentRecordModelSchema, {
  title: 'PaymentRecordRes',
  description: 'Chi tiết một payment record'
})

export const PaymentRecordListSchema = extendApi(
  z.object({
    data: z.array(PaymentRecordModelSchema)
  }),
  {
    title: 'PaymentRecordList',
    description: 'Danh sách payment'
  }
)

export type CreateYourBodyType = z.infer<typeof CreatePaymentInternalSchema>
