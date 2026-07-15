import { createZodDto } from 'nestjs-zod'
import {
  ChapterListResSchema,
  ChapterProgressResSchema,
  ChapterResSchema,
  CreateChapterBodySchema,
  CreatePageBodySchema,
  ExtendDeadlineBodySchema,
  HoldChapterBodySchema,
  PageListResSchema,
  PageResSchema,
  ReasonBodySchema,
  RevisionReasonBodySchema,
  SetScheduleBodySchema,
  StudioOverviewResSchema,
  UpdateChapterBodySchema,
  UpdatePageBodySchema
} from '../schemas/chapter-schemas'

export class CreateChapterBodyDto extends createZodDto(CreateChapterBodySchema) {}
export class SetScheduleBodyDto extends createZodDto(SetScheduleBodySchema) {}
export class ExtendDeadlineBodyDto extends createZodDto(ExtendDeadlineBodySchema) {}
export class HoldChapterBodyDto extends createZodDto(HoldChapterBodySchema) {}
export class CreatePageBodyDto extends createZodDto(CreatePageBodySchema) {}
export class UpdatePageBodyDto extends createZodDto(UpdatePageBodySchema) {}
export class UpdateChapterBodyDto extends createZodDto(UpdateChapterBodySchema) {}
export class ReasonBodyDto extends createZodDto(ReasonBodySchema) {}
export class RevisionReasonBodyDto extends createZodDto(RevisionReasonBodySchema) {}
export class ChapterResDto extends createZodDto(ChapterResSchema) {}
export class ChapterListResDto extends createZodDto(ChapterListResSchema) {}
export class ChapterProgressResDto extends createZodDto(ChapterProgressResSchema) {}
export class StudioOverviewResDto extends createZodDto(StudioOverviewResSchema) {}
export class PageResDto extends createZodDto(PageResSchema) {}
export class PageListResDto extends createZodDto(PageListResSchema) {}
