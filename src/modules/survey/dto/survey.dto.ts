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
  RankingRecordListResSchema
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
