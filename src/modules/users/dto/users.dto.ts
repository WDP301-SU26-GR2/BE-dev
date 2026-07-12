import { createZodDto } from 'nestjs-zod'
import {
  AdminCreateUserBodySchema,
  AdminCreateUserResSchema,
  AdminResetPasswordResSchema,
  AdminStatsResSchema,
  AdminUpdateUserStatusBodySchema,
  AdminUserListResSchema,
  AdminUserResSchema,
  AssistantDirectoryListResSchema,
  AssistantProfileBodySchema,
  AssistantProfileResSchema,
  ListAssistantsQuerySchema,
  ListUsersQuerySchema,
  MangakaProfileBodySchema,
  MangakaProfileResSchema,
  MeResSchema,
  StaffProfileBodySchema,
  StaffProfileResSchema,
  UpdateMeBodySchema
} from '../schemas/users-schemas'

export class AdminCreateUserBodyDto extends createZodDto(AdminCreateUserBodySchema) {}
export class AdminCreateUserResDto extends createZodDto(AdminCreateUserResSchema) {}
export class AdminUpdateUserStatusBodyDto extends createZodDto(AdminUpdateUserStatusBodySchema) {}
export class AdminResetPasswordResDto extends createZodDto(AdminResetPasswordResSchema) {}
export class AdminStatsResDto extends createZodDto(AdminStatsResSchema) {}
export class MangakaProfileBodyDto extends createZodDto(MangakaProfileBodySchema) {}
export class MangakaProfileResDto extends createZodDto(MangakaProfileResSchema) {}
export class AssistantProfileBodyDto extends createZodDto(AssistantProfileBodySchema) {}
export class AssistantProfileResDto extends createZodDto(AssistantProfileResSchema) {}
export class ListUsersQueryDto extends createZodDto(ListUsersQuerySchema) {}
export class AdminUserResDto extends createZodDto(AdminUserResSchema) {}
export class AdminUserListResDto extends createZodDto(AdminUserListResSchema) {}
export class ListAssistantsQueryDto extends createZodDto(ListAssistantsQuerySchema) {}
export class AssistantDirectoryListResDto extends createZodDto(AssistantDirectoryListResSchema) {}

export class MeResDto extends createZodDto(MeResSchema) {}
export class UpdateMeBodyDto extends createZodDto(UpdateMeBodySchema) {}
export class StaffProfileBodyDto extends createZodDto(StaffProfileBodySchema) {}
export class StaffProfileResDto extends createZodDto(StaffProfileResSchema) {}
