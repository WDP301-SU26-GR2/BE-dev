import { createZodDto } from 'nestjs-zod'
import {
  AiJobListResSchema,
  AiJobResSchema,
  ApplyAiJobResSchema,
  ListAiJobsQuerySchema,
  SegmentAcceptedResSchema,
  SegmentPageBodySchema
} from '../schemas/ai-schemas'

export class SegmentPageBodyDto extends createZodDto(SegmentPageBodySchema) {}
export class SegmentAcceptedResDto extends createZodDto(SegmentAcceptedResSchema) {}
export class AiJobResDto extends createZodDto(AiJobResSchema) {}
export class AiJobListResDto extends createZodDto(AiJobListResSchema) {}
export class ApplyAiJobResDto extends createZodDto(ApplyAiJobResSchema) {}
export class ListAiJobsQueryDto extends createZodDto(ListAiJobsQuerySchema) {}
