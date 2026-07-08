import { createZodDto } from 'nestjs-zod'
import {
  CreateTankobonSalesBodySchema,
  TankobonSalesResSchema,
  DefenseDashboardResSchema
} from '../schemas/tankobon-schemas'

export class CreateTankobonSalesBodyDto extends createZodDto(CreateTankobonSalesBodySchema) {}
export class TankobonSalesResDto extends createZodDto(TankobonSalesResSchema) {}
export class DefenseDashboardResDto extends createZodDto(DefenseDashboardResSchema) {}
