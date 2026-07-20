import { createZodDto } from 'nestjs-zod'
import {
  GetPaymentsQuerySchema,
  PayPaymentBodySchema,
  CancelPaymentBodySchema,
  CreatePaymentInternalSchema,
  PaymentRecordResSchema,
  PaymentRecordListSchema
} from '../schemas/payment-schema'

// Request DTOs
export class GetPaymentsQueryDto extends createZodDto(GetPaymentsQuerySchema) {}
export class PayPaymentBodyDto extends createZodDto(PayPaymentBodySchema) {}
export class CancelPaymentBodyDto extends createZodDto(CancelPaymentBodySchema) {}
export class CreatePaymentInternalDto extends createZodDto(CreatePaymentInternalSchema) {}

// Response DTOs
export class PaymentRecordResDto extends createZodDto(PaymentRecordResSchema) {}
export class PaymentRecordListResDto extends createZodDto(PaymentRecordListSchema) {}
