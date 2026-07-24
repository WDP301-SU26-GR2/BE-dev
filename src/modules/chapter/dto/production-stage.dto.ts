import { createZodDto } from 'nestjs-zod'
import {
  ConfirmStageOutputsBodySchema,
  CreateStageBodySchema,
  ProductionStageResSchema,
  StageListResSchema,
  StagePageListResSchema,
  UpdateStageBodySchema
} from '../schemas/production-stage-schemas'

export class StageListResDto extends createZodDto(StageListResSchema) {}
export class ProductionStageResDto extends createZodDto(ProductionStageResSchema) {}
export class UpdateStageBodyDto extends createZodDto(UpdateStageBodySchema) {}
export class CreateStageBodyDto extends createZodDto(CreateStageBodySchema) {}
export class StagePageListResDto extends createZodDto(StagePageListResSchema) {}
export class ConfirmStageOutputsBodyDto extends createZodDto(ConfirmStageOutputsBodySchema) {}
