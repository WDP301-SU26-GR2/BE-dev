import { createZodDto } from 'nestjs-zod'
import z from 'zod'

export const ResponseSchema = z.object({
  message: z.string()
})
export type ResponseType = z.infer<typeof ResponseSchema>

export class MessageResDto extends createZodDto(ResponseSchema) {}
