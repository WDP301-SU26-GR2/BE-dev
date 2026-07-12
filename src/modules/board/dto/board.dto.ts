import { createZodDto } from 'nestjs-zod'
import {
  CreateBoardDecisionBodySchema,
  CastVoteBodySchema,
  CreateSeriesReportBodySchema,
  UpdateBoardConfigBodySchema,
  CreateBoardSessionBodySchema,
  BoardSessionResSchema,
  BoardDecisionResSchema,
  BoardVoteResSchema,
  BoardVoteListResSchema,
  SeriesReportResSchema,
  BoardConfigResSchema,
  SuggestBoardMembersQuerySchema,
  SuggestBoardMembersResSchema
} from '../schemas/board-schema'

export class CreateBoardSessionBodyDto extends createZodDto(CreateBoardSessionBodySchema) {}
export class CreateBoardDecisionBodyDto extends createZodDto(CreateBoardDecisionBodySchema) {}
export class CastVoteBodyDto extends createZodDto(CastVoteBodySchema) {}
export class CreateSeriesReportBodyDto extends createZodDto(CreateSeriesReportBodySchema) {}
export class UpdateBoardConfigBodyDto extends createZodDto(UpdateBoardConfigBodySchema) {}
export class BoardSessionResDto extends createZodDto(BoardSessionResSchema) {}
export class BoardDecisionResDto extends createZodDto(BoardDecisionResSchema) {}
export class BoardVoteResDto extends createZodDto(BoardVoteResSchema) {}
export class BoardVoteListResDto extends createZodDto(BoardVoteListResSchema) {}
export class SeriesReportResDto extends createZodDto(SeriesReportResSchema) {}
export class BoardConfigResDto extends createZodDto(BoardConfigResSchema) {}
export class SuggestBoardMembersQueryDto extends createZodDto(SuggestBoardMembersQuerySchema) {}
export class SuggestBoardMembersResDto extends createZodDto(SuggestBoardMembersResSchema) {}
