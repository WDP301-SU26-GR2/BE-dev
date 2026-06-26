import { createZodDto } from 'nestjs-zod'
import {
  AdminCreateUserBodySchema,
  AdminCreateUserResSchema,
  AdminUserListResSchema,
  AdminUserResSchema,
  AssistantProfileBodySchema,
  AssistantProfileResSchema,
  ListUsersQuerySchema,
  MangakaProfileBodySchema,
  MangakaProfileResSchema
} from '../schemas/users-schemas'

export class AdminCreateUserBodyDto extends createZodDto(AdminCreateUserBodySchema) {}
export class AdminCreateUserResDto extends createZodDto(AdminCreateUserResSchema) {}
export class MangakaProfileBodyDto extends createZodDto(MangakaProfileBodySchema) {}
export class MangakaProfileResDto extends createZodDto(MangakaProfileResSchema) {}
export class AssistantProfileBodyDto extends createZodDto(AssistantProfileBodySchema) {}
export class AssistantProfileResDto extends createZodDto(AssistantProfileResSchema) {}
export class ListUsersQueryDto extends createZodDto(ListUsersQuerySchema) {}
export class AdminUserResDto extends createZodDto(AdminUserResSchema) {}
export class AdminUserListResDto extends createZodDto(AdminUserListResSchema) {}
