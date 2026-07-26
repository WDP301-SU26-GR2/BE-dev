import { createZodDto } from 'nestjs-zod'
import { HealthResSchema } from '../schemas/health-schemas'

export class HealthResDto extends createZodDto(HealthResSchema) {}
