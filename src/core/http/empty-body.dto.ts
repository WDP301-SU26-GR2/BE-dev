import { createZodDto } from 'nestjs-zod'
import z from 'zod'

export const EmptyBodySchema = z.object({}).strict()
export type EmptyBodyType = z.infer<typeof EmptyBodySchema>

export class EmptyBodyDto extends createZodDto(EmptyBodySchema) {}
