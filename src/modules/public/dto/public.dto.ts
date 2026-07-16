import { createZodDto } from 'nestjs-zod'
import {
  PublicChapterPagesResSchema,
  PublicSeriesDetailResSchema,
  PublicSeriesListQuerySchema,
  PublicSeriesListResSchema
} from '../schemas/public-schemas'

export class PublicSeriesListQueryDto extends createZodDto(PublicSeriesListQuerySchema) {}
export class PublicSeriesListResDto extends createZodDto(PublicSeriesListResSchema) {}
export class PublicSeriesDetailResDto extends createZodDto(PublicSeriesDetailResSchema) {}
export class PublicChapterPagesResDto extends createZodDto(PublicChapterPagesResSchema) {}
