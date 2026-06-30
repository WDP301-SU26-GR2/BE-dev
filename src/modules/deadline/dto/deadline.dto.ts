import { createZodDto } from 'nestjs-zod'
import {
  CounterDeadlineBodySchema,
  CreateDeadlineRequestBodySchema,
  DeadlineReasonBodySchema,
  DeadlineRequestListResSchema,
  DeadlineRequestResSchema,
  ListDeadlineRequestQuerySchema
} from '../schemas/deadline-schemas'

export class CreateDeadlineRequestBodyDto extends createZodDto(CreateDeadlineRequestBodySchema) {}
export class CounterDeadlineBodyDto extends createZodDto(CounterDeadlineBodySchema) {}
export class DeadlineReasonBodyDto extends createZodDto(DeadlineReasonBodySchema) {}
export class ListDeadlineRequestQueryDto extends createZodDto(ListDeadlineRequestQuerySchema) {}
export class DeadlineRequestResDto extends createZodDto(DeadlineRequestResSchema) {}
export class DeadlineRequestListResDto extends createZodDto(DeadlineRequestListResSchema) {}
