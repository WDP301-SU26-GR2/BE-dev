import { createZodDto } from 'nestjs-zod'
import { ResponseSchema } from 'src/shared/models/shared-response.model'

export class MessageResDto extends createZodDto(ResponseSchema) {}
