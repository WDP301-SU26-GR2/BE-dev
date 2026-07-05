import { createZodDto } from 'nestjs-zod'
import {
  CreatePaymentConditionBodySchema,
  UpdatePaymentConditionBodySchema,
  PaymentConditionResSchema,
  PaymentConditionListResSchema
} from '../schemas/payment-condition-schema'

export class CreatePaymentConditionBodyDto extends createZodDto(CreatePaymentConditionBodySchema) {}
export class UpdatePaymentConditionBodyDto extends createZodDto(UpdatePaymentConditionBodySchema) {}
export class PaymentConditionResDto extends createZodDto(PaymentConditionResSchema) {}
export class PaymentConditionListResDto extends createZodDto(PaymentConditionListResSchema) {}
