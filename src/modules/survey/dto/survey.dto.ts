import { createZodDto } from 'nestjs-zod'
import {
  VoteOtpRequestBodySchema,
  ReaderVoteBodySchema,
  CreateSurveyPeriodBodySchema,
  UpdateSurveyPeriodStatusBodySchema,
  ImportSurveyDataBodySchema,
  VotingConfigBodySchema,
  SurveyPeriodResSchema,
  SurveyPeriodListQuerySchema,
  SurveyPeriodListResSchema,
  VotingConfigResSchema,
  RankingRecordResSchema,
  RankingRecordListResSchema,
  BoardRankingListResSchema,
  GetSeriesTrendQuerySchema,
  ReaderVoteListItemSchema,
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
  OpenVotePeriodsQuerySchema,
  OpenVotePeriodsResSchema,
  VotePeriodsQuerySchema,
  VotePeriodsResSchema,
  RankingAggregateQuerySchema,
  RankingAggregateResSchema,
  InternalRankingAggregateResSchema,
  VoteLiveQuerySchema,
  VoteTallyResSchema
} from '../schemas/survey-schemas'

export class VoteOtpRequestBodyDto extends createZodDto(VoteOtpRequestBodySchema) {}
export class ReaderVoteBodyDto extends createZodDto(ReaderVoteBodySchema) {}
export class CreateSurveyPeriodBodyDto extends createZodDto(CreateSurveyPeriodBodySchema) {}
export class UpdateSurveyPeriodStatusBodyDto extends createZodDto(UpdateSurveyPeriodStatusBodySchema) {}
export class ImportSurveyDataBodyDto extends createZodDto(ImportSurveyDataBodySchema) {}
export class VotingConfigBodyDto extends createZodDto(VotingConfigBodySchema) {}
export class SurveyPeriodResDto extends createZodDto(SurveyPeriodResSchema) {}
export class SurveyPeriodListQueryDto extends createZodDto(SurveyPeriodListQuerySchema) {}
export class SurveyPeriodListResDto extends createZodDto(SurveyPeriodListResSchema) {}
export class VotingConfigResDto extends createZodDto(VotingConfigResSchema) {}
export class RankingRecordResDto extends createZodDto(RankingRecordResSchema) {}
export class RankingRecordListResDto extends createZodDto(RankingRecordListResSchema) {}
export class BoardRankingListResDto extends createZodDto(BoardRankingListResSchema) {}
export class GetSeriesTrendQueryDto extends createZodDto(GetSeriesTrendQuerySchema) {}
export class ReaderVoteListItemDto extends createZodDto(ReaderVoteListItemSchema) {}
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
export class OpenVotePeriodsQueryDto extends createZodDto(OpenVotePeriodsQuerySchema) {}
export class OpenVotePeriodsResDto extends createZodDto(OpenVotePeriodsResSchema) {}
export class RankingAggregateQueryDto extends createZodDto(RankingAggregateQuerySchema) {}
export class RankingAggregateResDto extends createZodDto(RankingAggregateResSchema) {}
export class InternalRankingAggregateResDto extends createZodDto(InternalRankingAggregateResSchema) {}
export class VoteLiveQueryDto extends createZodDto(VoteLiveQuerySchema) {}
export class VoteTallyResDto extends createZodDto(VoteTallyResSchema) {}

export type GetSeriesTrendQueryType = {
  seriesId: string
  periods: number
}
