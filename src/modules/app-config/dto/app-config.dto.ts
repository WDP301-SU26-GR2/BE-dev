import { createZodDto } from 'nestjs-zod'
import { AppConfigResSchema, PatchAppConfigBodySchema } from '../schemas/app-config-schemas'

export class PatchAppConfigBodyDto extends createZodDto(PatchAppConfigBodySchema) {}
export class AppConfigResDto extends createZodDto(AppConfigResSchema) {}
