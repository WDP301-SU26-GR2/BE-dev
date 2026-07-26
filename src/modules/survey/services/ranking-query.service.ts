import { Injectable } from '@nestjs/common'
import { PublicationType } from '@prisma/client'
import { RankingAggregateQueryDto } from '../dto/survey.dto'
import { InternalRankingQueryService } from './internal-ranking-query.service'
import { PublicVoteQueryService } from './public-vote-query.service'
import { RankingAggregateService } from './ranking-aggregate.service'

@Injectable()
export class RankingQueryService {
  constructor(
    private readonly internalQuery: InternalRankingQueryService,
    private readonly publicQuery: PublicVoteQueryService,
    private readonly aggregateService: RankingAggregateService
  ) {}
  getRankingRecords(id: string) {
    return this.internalQuery.getRankingRecords(id)
  }
  getBoardRanking(id: string) {
    return this.internalQuery.getBoardRanking(id)
  }
  getSeriesTrend(id: string, periods: number, caller: { userId: string; roleName: string }) {
    return this.internalQuery.getSeriesTrend(id, periods, caller)
  }
  getVoteContext(id?: string) {
    return this.publicQuery.getVoteContext(id)
  }
  getLatestVoteResults(magazine?: string, type?: PublicationType) {
    return this.publicQuery.getLatestVoteResults(magazine, type)
  }
  getReflectedPeriods(magazine: string | number, type?: PublicationType, limit = 12) {
    return this.publicQuery.getReflectedPeriods(magazine, type, limit)
  }
  getVoteResults(id: string, type?: PublicationType) {
    return this.publicQuery.getVoteResults(id, type)
  }
  getAggregate(query: RankingAggregateQueryDto) {
    return this.aggregateService.getAggregate(query)
  }
}
