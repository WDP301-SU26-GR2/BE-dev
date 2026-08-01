import { createZodDto } from 'nestjs-zod'
import {
  AddStoryboardPageBodySchema,
  CreateChapterStoryboardBodySchema,
  StoryboardListResSchema,
  StoryboardResSchema,
  ReasonBodySchema,
  UpdateStoryboardPagesBodySchema
} from '../schemas/storyboard-schemas'

export class CreateChapterStoryboardBodyDto extends createZodDto(CreateChapterStoryboardBodySchema) {}
export class UpdateStoryboardPagesBodyDto extends createZodDto(UpdateStoryboardPagesBodySchema) {}
export class AddStoryboardPageBodyDto extends createZodDto(AddStoryboardPageBodySchema) {}
export class StoryboardReasonBodyDto extends createZodDto(ReasonBodySchema) {}
export class StoryboardResDto extends createZodDto(StoryboardResSchema) {}
export class StoryboardListResDto extends createZodDto(StoryboardListResSchema) {}
