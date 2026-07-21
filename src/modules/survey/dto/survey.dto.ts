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
  BoardRankingListResSchema,
  GetSeriesTrendQuerySchema,
  ReaderVoteResSchema,
  ReaderVoteListResSchema,
  SurveyDataResSchema,
  SurveyDataListResSchema,
  VoteContextResSchema,
  VoteContextQuerySchema,
  VoteResultsResSchema,
  VoteResultsQuerySchema,
  LatestVoteResultsResSchema,
  LatestVoteResultsQuerySchema,
  VotePeriodsQuerySchema,
  VotePeriodsResSchema
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
export class BoardRankingListResDto extends createZodDto(BoardRankingListResSchema) {}
export class GetSeriesTrendQueryDto extends createZodDto(GetSeriesTrendQuerySchema) {}
export class ReaderVoteResDto extends createZodDto(ReaderVoteResSchema) {}
export class ReaderVoteListResDto extends createZodDto(ReaderVoteListResSchema) {}
export class SurveyDataResDto extends createZodDto(SurveyDataResSchema) {}
export class SurveyDataListResDto extends createZodDto(SurveyDataListResSchema) {}
export class VoteContextResDto extends createZodDto(VoteContextResSchema) {}
export class VoteContextQueryDto extends createZodDto(VoteContextQuerySchema) {}
export class VoteResultsResDto extends createZodDto(VoteResultsResSchema) {}
export class VoteResultsQueryDto extends createZodDto(VoteResultsQuerySchema) {}
export class LatestVoteResultsResDto extends createZodDto(LatestVoteResultsResSchema) {}
export class LatestVoteResultsQueryDto extends createZodDto(LatestVoteResultsQuerySchema) {}
export class VotePeriodsQueryDto extends createZodDto(VotePeriodsQuerySchema) {}
export class VotePeriodsResDto extends createZodDto(VotePeriodsResSchema) {}

export type GetSeriesTrendQueryType = {
  seriesId: string
  periods: number
}
