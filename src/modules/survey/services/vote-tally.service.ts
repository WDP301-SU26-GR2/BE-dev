import { Injectable } from '@nestjs/common'
import { PublicationType } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { SurveyPeriodNotFoundException, SurveyPeriodNotOpenException } from '../errors/survey.errors'
import { SurveyRepository } from '../survey.repo'

export type VoteTallyPayload = {
  periodId: string
  magazine: string
  publicationType: PublicationType
  issueNumber: number | null
  tally: { seriesId: string; title: string; coverImage: string | null; count: number }[]
  totalVotes: number
  updatedAt: string
}

// This narrow port deliberately keeps the tally use case independent from the
// broader SurveyRepository implementation. SurveyRepository owns the Prisma
// selects; its implementation must keep these selects public-safe.
export type VoteTallyRepository = {
  findSurveyPeriodById(id: string): Promise<{
    id: string
    status: string
    magazine?: string | null
    publicationType?: PublicationType | null
    issueNumber: number | null
    eligibleSeriesIds?: string[]
  } | null>
  getReaderVotesByPeriod(surveyPeriodId: string): Promise<{ seriesIds: string[]; votedAt: Date }[]>
  findPublicSeriesByIds(seriesIds: string[]): Promise<{ id: string; title: string; coverImage: string | null }[]>
}

@Injectable()
export class VoteTallyService {
  private readonly repository: VoteTallyRepository

  constructor(surveyRepository: SurveyRepository) {
    this.repository = surveyRepository
  }

  async getLiveTally(periodId: string): Promise<VoteTallyPayload> {
    if (!isObjectId(periodId)) throw SurveyPeriodNotFoundException

    const period = await this.repository.findSurveyPeriodById(periodId)
    if (!period) throw SurveyPeriodNotFoundException
    if (
      period.status !== 'OPEN' ||
      !period.magazine?.trim() ||
      !period.publicationType ||
      !period.eligibleSeriesIds?.length
    ) {
      throw SurveyPeriodNotOpenException
    }

    const [votes, series] = await Promise.all([
      this.repository.getReaderVotesByPeriod(period.id),
      this.repository.findPublicSeriesByIds(period.eligibleSeriesIds)
    ])
    const eligibleIds = new Set(period.eligibleSeriesIds)
    const counts = new Map(period.eligibleSeriesIds.map((seriesId) => [seriesId, 0]))

    for (const vote of votes) {
      for (const seriesId of vote.seriesIds) {
        if (eligibleIds.has(seriesId)) counts.set(seriesId, (counts.get(seriesId) ?? 0) + 1)
      }
    }

    const seriesById = new Map(series.map((item) => [item.id, item]))
    const tally = period.eligibleSeriesIds.flatMap((seriesId) => {
      const item = seriesById.get(seriesId)
      return item
        ? [{ seriesId, title: item.title, coverImage: item.coverImage, count: counts.get(seriesId) ?? 0 }]
        : []
    })

    return {
      periodId: period.id,
      magazine: period.magazine.trim(),
      publicationType: period.publicationType,
      issueNumber: period.issueNumber,
      tally,
      totalVotes: votes.length,
      updatedAt: new Date().toISOString()
    }
  }
}
