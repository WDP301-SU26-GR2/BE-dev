import { PrismaService } from 'src/infrastructure/database/prisma.service'

export type RankingRecordData = {
  seriesId: string
  surveyPeriodId: string
  rankPosition?: number
  voteCount: number
  previousRank?: number | null
  rankChange?: number | null
  isAtRisk: boolean
  riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'SEVERE'
  consecutiveAtRiskCount: number
  isReliable: boolean
}

export type FinalizedRankingRecordData = Omit<RankingRecordData, 'surveyPeriodId' | 'rankPosition'> & {
  rankPosition: number
  normalizedScore: number
}

export class SurveyRankingRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: RankingRecordData) {
    return this.prisma.rankingRecord.create({
      data: {
        seriesId: data.seriesId,
        surveyPeriodId: data.surveyPeriodId,
        rankPosition: data.rankPosition ?? null,
        voteCount: data.voteCount,
        previousRank: data.previousRank ?? null,
        rankChange: data.rankChange ?? null,
        isAtRisk: data.isAtRisk,
        riskLevel: data.riskLevel,
        consecutiveAtRiskCount: data.consecutiveAtRiskCount,
        isReliable: data.isReliable
      }
    })
  }

  getByPeriod(surveyPeriodId: string) {
    return this.prisma.rankingRecord.findMany({
      where: { surveyPeriodId },
      orderBy: { rankPosition: 'asc' },
      include: {
        surveyPeriod: {
          select: { magazine: true, publicationType: true, issueNumber: true, status: true }
        }
      }
    })
  }

  getBySeries(seriesId: string, take: number) {
    return this.prisma.rankingRecord.findMany({
      where: { seriesId },
      orderBy: { recordedAt: 'desc' },
      take,
      include: {
        surveyPeriod: {
          select: { magazine: true, publicationType: true, issueNumber: true, status: true }
        }
      }
    })
  }

  findByPeriodIds(surveyPeriodIds: string[]) {
    if (surveyPeriodIds.length === 0) return Promise.resolve([])
    return this.prisma.rankingRecord.findMany({
      where: { surveyPeriodId: { in: surveyPeriodIds } },
      select: { seriesId: true, surveyPeriodId: true, voteCount: true, normalizedScore: true }
    })
  }

  async finalizeScoped(surveyPeriodId: string, records: FinalizedRankingRecordData[]): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.surveyPeriod.updateMany({
        where: { id: surveyPeriodId, status: 'CLOSED' },
        data: { status: 'REFLECTED' }
      })
      if (claimed.count !== 1) return false

      await transaction.rankingRecord.createMany({
        data: records.map((record) => ({ ...record, surveyPeriodId }))
      })
      return true
    })
  }
}
