import { createZodDto } from 'nestjs-zod'
import {
  VoteOtpRequestBodySchema,
  ReaderVoteBodySchema,
  CreateSurveyPeriodBodySchema,
  UpdateSurveyPeriodStatusBodySchema,
  ImportSurveyDataBodySchema,
  VotingConfigBodySchema,
  SurveyPeriodResSchema,
  VotingConfigResSchema,
  RankingRecordResSchema,
  RankingRecordListResSchema,
  ReaderVoteResSchema,
  ReaderVoteListResSchema,
  SurveyDataResSchema,
  SurveyDataListResSchema
} from '../schemas/survey-schemas'

export class VoteOtpRequestBodyDto extends createZodDto(VoteOtpRequestBodySchema) {}
export class ReaderVoteBodyDto extends createZodDto(ReaderVoteBodySchema) {}
export class CreateSurveyPeriodBodyDto extends createZodDto(CreateSurveyPeriodBodySchema) {}
export class UpdateSurveyPeriodStatusBodyDto extends createZodDto(UpdateSurveyPeriodStatusBodySchema) {}
export class ImportSurveyDataBodyDto extends createZodDto(ImportSurveyDataBodySchema) {}
export class VotingConfigBodyDto extends createZodDto(VotingConfigBodySchema) {}
export class SurveyPeriodResDto extends createZodDto(SurveyPeriodResSchema) {}
export class VotingConfigResDto extends createZodDto(VotingConfigResSchema) {}
export class RankingRecordResDto extends createZodDto(RankingRecordResSchema) {}
export class RankingRecordListResDto extends createZodDto(RankingRecordListResSchema) {}
export class ReaderVoteResDto extends createZodDto(ReaderVoteResSchema) {}
export class ReaderVoteListResDto extends createZodDto(ReaderVoteListResSchema) {}
export class SurveyDataResDto extends createZodDto(SurveyDataResSchema) {}
export class SurveyDataListResDto extends createZodDto(SurveyDataListResSchema) {}
