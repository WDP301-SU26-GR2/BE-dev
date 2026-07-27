import { Injectable } from '@nestjs/common'
import { PublicationType } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { CreateSurveyPeriodBodyDto, ImportSurveyDataBodyDto } from './dto/survey.dto'
import { SurveyConfigRepository, VotingConfigData } from './repositories/survey-config.repository'
import { SurveyPeriodRepository } from './repositories/survey-period.repository'
import {
  FinalizedRankingRecordData,
  RankingRecordData,
  SurveyRankingRepository
} from './repositories/survey-ranking.repository'
import { CreateReaderVoteData, SurveyVoteRepository } from './repositories/survey-vote.repository'

/**
 * Stable module repository boundary.
 *
 * Consumers keep one injection token while focused repositories own the
 * period, vote, ranking and configuration Prisma queries.
 */
@Injectable()
export class SurveyRepository {
  private readonly periods: SurveyPeriodRepository
  private readonly votes: SurveyVoteRepository
  private readonly rankings: SurveyRankingRepository
  private readonly config: SurveyConfigRepository

  constructor(prisma: PrismaService) {
    this.periods = new SurveyPeriodRepository(prisma)
    this.votes = new SurveyVoteRepository(prisma)
    this.rankings = new SurveyRankingRepository(prisma)
    this.config = new SurveyConfigRepository(prisma)
  }

  createSurveyPeriod(data: CreateSurveyPeriodBodyDto) {
    return this.periods.create(data)
  }
  findManySurveyPeriods() {
    return this.periods.findMany()
  }
  findSurveyPeriodById(id: string) {
    return this.periods.findById(id)
  }
  findScopedSurveyPeriod(magazine: string, publicationType: PublicationType, issueNumber: number) {
    return this.periods.findScoped(magazine, publicationType, issueNumber)
  }
  updateSurveyPeriodStatus(id: string, status: 'OPEN' | 'CLOSED' | 'REFLECTED') {
    return this.periods.updateStatus(id, status)
  }
  createSurveyData(data: ImportSurveyDataBodyDto & { importedBy: string }) {
    return this.periods.createSurveyData(data)
  }
  getSurveyDataByPeriod(surveyPeriodId: string) {
    return this.periods.getSurveyData(surveyPeriodId)
  }
  findLatestOpenSurveyPeriod() {
    return this.periods.findLatestOpen()
  }
  findOpenPeriods(filter: { magazine?: string; publicationType?: PublicationType }) {
    return this.periods.findOpenPeriods(filter)
  }
  findLatestReflectedPeriod() {
    return this.periods.findLatestReflected()
  }
  findLatestReflectedScopedPeriod(magazine: string, publicationType: PublicationType) {
    return this.periods.findLatestReflectedScoped(magazine, publicationType)
  }
  findReflectedPeriods(limit: number) {
    return this.periods.findReflected(limit)
  }
  findReflectedScopedPeriods(magazine: string, publicationType: PublicationType, limit: number) {
    return this.periods.findReflectedScoped(magazine, publicationType, limit)
  }
  findPreviousSurveyPeriod(currentSurveyPeriodId: string) {
    return this.periods.findPrevious(currentSurveyPeriodId)
  }
  findPreviousScopedSurveyPeriod(currentSurveyPeriodId: string, magazine: string, publicationType: PublicationType) {
    return this.periods.findPreviousScoped(currentSurveyPeriodId, magazine, publicationType)
  }
  findReflectedScopedPeriodsInRange(magazine: string, publicationType: PublicationType, from: Date, to: Date) {
    return this.periods.findReflectedScopedInRange(magazine, publicationType, from, to)
  }

  createReaderVote(data: CreateReaderVoteData) {
    return this.votes.create(data)
  }
  findReaderVoteByPeriodAndIdentity(
    surveyPeriodId: string,
    identityHash: string,
    publicationType: PublicationType | null
  ) {
    return this.votes.findByPeriodAndIdentity(surveyPeriodId, identityHash, publicationType)
  }
  countReaderVotesByPeriodAndIp(surveyPeriodId: string, ipHash: string, publicationType: PublicationType | null) {
    return this.votes.countByPeriodAndIp(surveyPeriodId, ipHash, publicationType)
  }
  getReaderVotesByPeriod(surveyPeriodId: string) {
    return this.votes.getByPeriod(surveyPeriodId)
  }
  findManySerializedSeriesPublic(publicationType?: PublicationType) {
    return this.votes.findManySerializedSeriesPublic(publicationType)
  }
  findSeriesTitlesByIds(seriesIds: string[]) {
    return this.votes.findSeriesTitlesByIds(seriesIds)
  }
  findPublicSeriesByIds(seriesIds: string[]) {
    return this.votes.findPublicSeriesByIds(seriesIds)
  }
  countPublishedChaptersBySeriesIds(seriesIds: string[]) {
    return this.votes.countPublishedChaptersBySeriesIds(seriesIds)
  }
  findHeldChapterSeriesIds(seriesIds: string[], thresholdDate: Date) {
    return this.votes.findHeldChapterSeriesIds(seriesIds, thresholdDate)
  }
  findSeriesOwnershipByIds(seriesIds: string[]) {
    return this.votes.findSeriesOwnershipByIds(seriesIds)
  }
  findBoardMemberIds() {
    return this.votes.findBoardMemberIds()
  }

  createRankingRecord(data: RankingRecordData) {
    return this.rankings.create(data)
  }
  getRankingRecordsByPeriod(surveyPeriodId: string) {
    return this.rankings.getByPeriod(surveyPeriodId)
  }
  getRankingRecordsBySeries(seriesId: string, take: number) {
    return this.rankings.getBySeries(seriesId, take)
  }
  findRankingRecordsByPeriodIds(surveyPeriodIds: string[]) {
    return this.rankings.findByPeriodIds(surveyPeriodIds)
  }
  finalizeScopedRanking(surveyPeriodId: string, records: FinalizedRankingRecordData[]) {
    return this.rankings.finalizeScoped(surveyPeriodId, records)
  }

  getVotingConfig() {
    return this.config.get()
  }
  createDefaultVotingConfig() {
    return this.config.createDefault()
  }
  updateVotingConfig(data: VotingConfigData) {
    return this.config.update(data)
  }
}
