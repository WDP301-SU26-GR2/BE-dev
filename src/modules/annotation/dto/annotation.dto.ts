import { createZodDto } from 'nestjs-zod'
import {
  AnnotationListResSchema,
  AnnotationResSchema,
  CreateAnnotationBodySchema,
  ListAnnotationQuerySchema
} from '../schemas/annotation-schemas'

export class CreateAnnotationBodyDto extends createZodDto(CreateAnnotationBodySchema) {}
export class AnnotationResDto extends createZodDto(AnnotationResSchema) {}
export class AnnotationListResDto extends createZodDto(AnnotationListResSchema) {}
export class ListAnnotationQueryDto extends createZodDto(ListAnnotationQuerySchema) {}
