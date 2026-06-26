import { createZodDto } from 'nestjs-zod'
import {
  CreateBoardDecisionBodySchema,
  CastVoteBodySchema,
  CreateSeriesReportBodySchema,
  UpdateBoardConfigBodySchema
} from '../schemas/board-schema'

export class CreateBoardDecisionBodyDto extends createZodDto(CreateBoardDecisionBodySchema) {}
export class CastVoteBodyDto extends createZodDto(CastVoteBodySchema) {}
export class CreateSeriesReportBodyDto extends createZodDto(CreateSeriesReportBodySchema) {}
export class UpdateBoardConfigBodyDto extends createZodDto(UpdateBoardConfigBodySchema) {}
