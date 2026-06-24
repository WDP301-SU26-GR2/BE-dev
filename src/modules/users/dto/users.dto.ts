import { createZodDto } from 'nestjs-zod'
import {
  AdminCreateUserBodySchema,
  AdminCreateUserResSchema,
  AssistantProfileBodySchema,
  AssistantProfileResSchema,
  MangakaProfileBodySchema,
  MangakaProfileResSchema
} from '../schemas/users-schemas'

export class AdminCreateUserBodyDto extends createZodDto(AdminCreateUserBodySchema) {}
export class AdminCreateUserResDto extends createZodDto(AdminCreateUserResSchema) {}
export class MangakaProfileBodyDto extends createZodDto(MangakaProfileBodySchema) {}
export class MangakaProfileResDto extends createZodDto(MangakaProfileResSchema) {}
export class AssistantProfileBodyDto extends createZodDto(AssistantProfileBodySchema) {}
export class AssistantProfileResDto extends createZodDto(AssistantProfileResSchema) {}
