import { createZodDto } from 'nestjs-zod'
import {
  AddNamePageBodySchema,
  CreateChapterNameBodySchema,
  ListNamesQuerySchema,
  NameListResSchema,
  NameResSchema,
  ReasonBodySchema,
  UpdateNamePagesBodySchema
} from '../schemas/name-schemas'

export class CreateChapterNameBodyDto extends createZodDto(CreateChapterNameBodySchema) {}
export class UpdateNamePagesBodyDto extends createZodDto(UpdateNamePagesBodySchema) {}
export class AddNamePageBodyDto extends createZodDto(AddNamePageBodySchema) {}
export class ReasonBodyDto extends createZodDto(ReasonBodySchema) {}
export class ListNamesQueryDto extends createZodDto(ListNamesQuerySchema) {}
export class NameResDto extends createZodDto(NameResSchema) {}
export class NameListResDto extends createZodDto(NameListResSchema) {}
