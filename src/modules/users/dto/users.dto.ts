import { createZodDto } from 'nestjs-zod'
import { GetUserByIdParamsSchema, UpdateProfileBodySchema } from '../schemas/users-schemas'
import { UserProfileSchema } from '../schemas/users.model'

export class GetUserByIdParamsDto extends createZodDto(GetUserByIdParamsSchema) {}
export class UpdateProfileBodyDto extends createZodDto(UpdateProfileBodySchema) {}
export class UserProfileResDto extends createZodDto(UserProfileSchema) {}
