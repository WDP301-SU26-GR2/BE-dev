import { Injectable } from '@nestjs/common'
import { SurveyPeriodAlreadyFinalizedException } from '../errors/survey.errors'
import { SurveyRepository } from '../survey.repo'

type RankingRecord = {
  surveyPeriodId: string
  seriesId: string
  rankPosition: number
  voteCount: number
  normalizedScore: number
  previousRank: number | null
  rankChange: number | null
  isAtRisk: boolean
  riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'SEVERE'
  consecutiveAtRiskCount: number
  isReliable: boolean
}

@Injectable()
export class RankingFinalizePersistenceService {
  constructor(private readonly repository: SurveyRepository) {}

  async persist(surveyPeriodId: string, isScopedPeriod: boolean, records: RankingRecord[]) {
    if (isScopedPeriod) {
      const finalized = await this.repository.finalizeScopedRanking(
        surveyPeriodId,
        records.map(({ surveyPeriodId: periodId, ...record }) => {
          void periodId
          return record
        })
      )
      if (!finalized) throw SurveyPeriodAlreadyFinalizedException
      return
    }
    for (const record of records) {
      const { normalizedScore, ...legacyRecord } = record
      void normalizedScore
      await this.repository.createRankingRecord(legacyRecord)
    }
    await this.repository.updateSurveyPeriodStatus(surveyPeriodId, 'REFLECTED')
  }
}
