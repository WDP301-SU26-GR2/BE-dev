import { createZodDto } from 'nestjs-zod'
import {
  ChapterListResSchema,
  ChapterResSchema,
  CreateChapterBodySchema,
  CreatePageBodySchema,
  ExtendDeadlineBodySchema,
  PageListResSchema,
  PageResSchema,
  ReasonBodySchema,
  SetScheduleBodySchema,
  UpdatePageBodySchema
} from '../schemas/chapter-schemas'

export class CreateChapterBodyDto extends createZodDto(CreateChapterBodySchema) {}
export class SetScheduleBodyDto extends createZodDto(SetScheduleBodySchema) {}
export class ExtendDeadlineBodyDto extends createZodDto(ExtendDeadlineBodySchema) {}
export class CreatePageBodyDto extends createZodDto(CreatePageBodySchema) {}
export class UpdatePageBodyDto extends createZodDto(UpdatePageBodySchema) {}
export class ReasonBodyDto extends createZodDto(ReasonBodySchema) {}
export class ChapterResDto extends createZodDto(ChapterResSchema) {}
export class ChapterListResDto extends createZodDto(ChapterListResSchema) {}
export class PageResDto extends createZodDto(PageResSchema) {}
export class PageListResDto extends createZodDto(PageListResSchema) {}
