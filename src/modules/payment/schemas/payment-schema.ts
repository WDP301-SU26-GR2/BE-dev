import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { PaymentRecordStatus, PaymentType, PaymentSource } from '@prisma/client'
import { zEnum } from 'src/core/http/docs/enum-docs'
import { PaymentRecordModelSchema } from './payment.model'
import { SeriesMiniSchema, UserMiniSchema } from 'src/core/models/user-mini.model'

// ============================================================================
// 1. REQUEST SCHEMAS (Dữ liệu đầu vào)
// ============================================================================

export const GetPaymentsQuerySchema = extendApi(
  z
    .object({
      status: zEnum(PaymentRecordStatus, 'PaymentRecordStatus').optional(),
      receiverId: z.string().optional(),
      seriesId: z.string().optional(),
      contractId: z.string().optional(),
      paymentType: zEnum(PaymentType, 'PaymentType').optional(),
      paymentSource: zEnum(PaymentSource, 'PaymentSource').optional()
    })
    .strict(),
  {
    title: 'GetPaymentsQuery',
    description: 'Lọc danh sách payment'
  }
)

// S-01: bỏ `approvedBy` khỏi body — actor lấy từ access token (chống giả mạo người duyệt).
// Route approve nay KHÔNG nhận body.

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
      paymentType: zEnum(PaymentType, 'PaymentType'),
      paymentSource: zEnum(PaymentSource, 'PaymentSource').default(PaymentSource.CONTRACT),
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

export const PaymentRecordResSchema = extendApi(
  PaymentRecordModelSchema.extend({
    series: SeriesMiniSchema.nullable().optional(),
    receiver: UserMiniSchema.optional(),
    approver: UserMiniSchema.nullable().optional().describe('Nguoi duyet chi (approvedBy); null neu chua duyet')
  }),
  {
    title: 'PaymentRecordRes',
    description: 'Chi tiết một payment record'
  }
)

export const PaymentRecordListSchema = extendApi(
  z.object({
    data: z.array(PaymentRecordResSchema)
  }),
  {
    title: 'PaymentRecordList',
    description: 'Danh sách payment'
  }
)

export type CreateYourBodyType = z.infer<typeof CreatePaymentInternalSchema>
