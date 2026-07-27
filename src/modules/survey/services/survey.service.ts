import { Injectable } from '@nestjs/common'
import { PublicationType } from '@prisma/client'
import {
  CreateSurveyPeriodBodyDto,
  ImportSurveyDataBodyDto,
  RankingAggregateQueryDto,
  ReaderVoteBodyDto,
  UpdateSurveyPeriodStatusBodyDto,
  VoteOtpRequestBodyDto,
  VotingConfigBodyDto
} from '../dto/survey.dto'
import { GuestVoteService } from './guest-vote.service'
import { DEFAULT_LOW_VOTE_RELIABILITY_THRESHOLD, RankingFinalizeService } from './ranking-finalize.service'
import { RankingQueryService } from './ranking-query.service'
import { SurveyConfigService } from './survey-config.service'
import { SurveyImportService } from './survey-import.service'
import { SurveyPeriodService } from './survey-period.service'

@Injectable()
export class SurveyService {
  constructor(
    private readonly guestVoteService: GuestVoteService,
    private readonly surveyPeriodService: SurveyPeriodService,
    private readonly surveyImportService: SurveyImportService,
    private readonly rankingFinalizeService: RankingFinalizeService,
    private readonly rankingQueryService: RankingQueryService,
    private readonly surveyConfigService: SurveyConfigService
  ) {}

  requestOtp(body: VoteOtpRequestBodyDto, ip: string) {
    return this.guestVoteService.requestOtp(body, ip)
  }

  submitVote(body: ReaderVoteBodyDto, ip: string) {
    return this.guestVoteService.submitVote(body, ip)
  }

  getLiveTally(periodId: string) {
    return this.guestVoteService.getLiveTally(periodId)
  }

  getSurveyPeriods() {
    return this.surveyPeriodService.getSurveyPeriods()
  }

  getSurveyPeriodById(id: string) {
    return this.surveyPeriodService.getSurveyPeriodById(id)
  }

  getSurveyPeriodVotes(id: string) {
    return this.surveyPeriodService.getSurveyPeriodVotes(id)
  }

  getSurveyPeriodSurveyData(id: string) {
    return this.surveyPeriodService.getSurveyPeriodSurveyData(id)
  }

  createSurveyPeriod(body: CreateSurveyPeriodBodyDto, userId?: string) {
    return this.surveyPeriodService.createSurveyPeriod(body, userId)
  }

  updateSurveyPeriodStatus(id: string, body: UpdateSurveyPeriodStatusBodyDto, userId?: string) {
    return this.surveyPeriodService.updateSurveyPeriodStatus(id, body, userId)
  }

  importSurveyData(body: ImportSurveyDataBodyDto, userId: string) {
    return this.surveyImportService.importSurveyData(body, userId)
  }

  finalizeRanking(periodId: string, userId?: string) {
    return this.rankingFinalizeService.finalizeRanking(periodId, userId)
  }

  getRankingRecords(periodId: string) {
    return this.rankingQueryService.getRankingRecords(periodId)
  }

  getBoardRanking(periodId: string) {
    return this.rankingQueryService.getBoardRanking(periodId)
  }

  getSeriesTrend(seriesId: string, periods: number, caller: { userId: string; roleName: string }) {
    return this.rankingQueryService.getSeriesTrend(seriesId, periods, caller)
  }

  getOpenPeriods(magazine?: string, publicationType?: PublicationType) {
    return this.rankingQueryService.getOpenPeriods(magazine, publicationType)
  }

  getVoteContext(periodId?: string) {
    return this.rankingQueryService.getVoteContext(periodId)
  }

  getLatestVoteResults(magazine?: string, publicationType?: PublicationType) {
    return this.rankingQueryService.getLatestVoteResults(magazine, publicationType)
  }

  getReflectedPeriods(magazine: string | number, publicationType?: PublicationType, limit = 12) {
    return this.rankingQueryService.getReflectedPeriods(magazine, publicationType, limit)
  }

  getVoteResults(periodId: string, publicationType?: PublicationType) {
    return this.rankingQueryService.getVoteResults(periodId, publicationType)
  }

  getRankingAggregate(query: RankingAggregateQueryDto) {
    return this.rankingQueryService.getAggregate(query)
  }

  getVotingConfig() {
    return this.surveyConfigService.getResponse()
  }

  updateVotingConfig(body: VotingConfigBodyDto) {
    return this.surveyConfigService.update(body)
  }
}

export { DEFAULT_LOW_VOTE_RELIABILITY_THRESHOLD }
