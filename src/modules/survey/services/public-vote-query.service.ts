import { Injectable } from '@nestjs/common'
import { PublicationType } from '@prisma/client'
import { PublicRankingQueryService } from './public-ranking-query.service'
import { PublicVoteContextQueryService } from './public-vote-context-query.service'

@Injectable()
export class PublicVoteQueryService {
  constructor(
    private readonly voteContextQuery: PublicVoteContextQueryService,
    private readonly rankingQuery: PublicRankingQueryService
  ) {}

  getOpenPeriods(magazine?: string, publicationType?: PublicationType) {
    return this.voteContextQuery.getOpenPeriods(magazine, publicationType)
  }

  getVoteContext(periodId?: string) {
    return this.voteContextQuery.getVoteContext(periodId)
  }

  getLatestVoteResults(magazine?: string, publicationType?: PublicationType) {
    return this.rankingQuery.getLatestVoteResults(magazine, publicationType)
  }

  getReflectedPeriods(magazine: string | number, publicationType?: PublicationType, limit = 12) {
    return this.rankingQuery.getReflectedPeriods(magazine, publicationType, limit)
  }

  getVoteResults(surveyPeriodId: string, legacyPublicationType?: PublicationType) {
    return this.rankingQuery.getVoteResults(surveyPeriodId, legacyPublicationType)
  }
}
