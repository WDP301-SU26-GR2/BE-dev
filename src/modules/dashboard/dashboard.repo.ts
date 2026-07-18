import { $Enums } from '@prisma/client'
import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { DashboardRankingItemType } from './schemas/dashboard-schemas'

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ranking kỳ GẦN NHẤT của mỗi series thuộc Mangaka.
   * 1 query series + 1 query rankingRecord (in seriesIds) → dedupe latest-per-series trong JS (không N+1).
   */
  async rankingForMangaka(mangakaId: string): Promise<DashboardRankingItemType[]> {
    const series = await this.prisma.series.findMany({
      where: { mangakaId },
      select: { id: true, title: true, status: true }
    })
    if (series.length === 0) return []

    const seriesIds = series.map((s) => s.id)
    const records = await this.prisma.rankingRecord.findMany({
      where: { seriesId: { in: seriesIds } },
      orderBy: { recordedAt: 'desc' }
    })

    const seriesById = new Map(series.map((s) => [s.id, s]))
    const seen = new Set<string>()
    const latest: DashboardRankingItemType[] = []
    for (const r of records) {
      if (seen.has(r.seriesId)) continue
      const s = seriesById.get(r.seriesId)
      if (!s) continue
      seen.add(r.seriesId)
      latest.push({
        seriesId: r.seriesId,
        seriesTitle: s.title,
        seriesStatus: s.status,
        rankPosition: r.rankPosition,
        voteCount: r.voteCount,
        previousRank: r.previousRank,
        rankChange: r.rankChange,
        riskLevel: r.riskLevel,
        isAtRisk: r.isAtRisk,
        recordedAt: r.recordedAt.toISOString()
      })
    }
    return latest
  }

  async earningsForMangaka(mangakaId: string) {
    return this.prisma.paymentRecord.findMany({
      where: { receiverId: mangakaId },
      orderBy: { createdAt: 'desc' }
    })
  }

  async assistantTaskCounts(assistantId: string) {
    return this.prisma.task.groupBy({
      by: ['status'],
      where: { assistantId },
      _count: { _all: true }
    })
  }

  async assistantActiveAssignmentCount(assistantId: string, now: Date) {
    return this.prisma.studioAssignment.count({
      where: {
        assistantId,
        status: $Enums.StudioAssignmentStatus.ACTIVE,
        OR: [{ hireEnd: { isSet: false } }, { hireEnd: { gte: now } }]
      }
    })
  }

  async assistantReputation(userId: string) {
    return this.prisma.assistantProfile.findFirst({
      where: { userId },
      select: { ratingAvg: true, ratingCount: true, reputationScore: true, isRecommended: true }
    })
  }

  async editorReviewQueueCount() {
    return this.prisma.series.count({
      where: { status: $Enums.SeriesStatus.IN_REVIEW, editorId: { isSet: false } }
    })
  }

  async editorSeriesByStatus(editorId: string) {
    return this.prisma.series.groupBy({
      by: ['status'],
      where: { editorId },
      _count: { _all: true }
    })
  }

  async editorSeriesForRanking(editorId: string) {
    return this.prisma.series.findMany({
      where: { editorId },
      select: { id: true, title: true }
    })
  }

  async editorPendingContracts(editorId: string) {
    return this.prisma.contract.findMany({
      where: {
        editorId,
        status: {
          in: [
            $Enums.ContractStatus.DRAFT,
            $Enums.ContractStatus.MANGAKA_REVIEW,
            $Enums.ContractStatus.MANGAKA_APPROVED,
            $Enums.ContractStatus.BOARD_APPROVED,
            $Enums.ContractStatus.NEGOTIATION,
            $Enums.ContractStatus.MANGAKA_SIGNED
          ]
        }
      },
      select: { id: true, seriesId: true, status: true },
      orderBy: { id: 'desc' }
    })
  }

  async latestRankingForSeries(seriesIds: string[]) {
    if (seriesIds.length === 0) return []

    const records = await this.prisma.rankingRecord.findMany({
      where: { seriesId: { in: seriesIds } },
      orderBy: { recordedAt: 'desc' }
    })
    return this.latestPerSeries(records)
  }

  async seriesTitles(seriesIds: string[]) {
    if (seriesIds.length === 0) return []

    return this.prisma.series.findMany({
      where: { id: { in: seriesIds } },
      select: { id: true, title: true }
    })
  }

  async boardActiveSessions(memberId: string) {
    return this.prisma.boardSession.findMany({
      where: { status: $Enums.BoardSessionStatus.ACTIVE, allowedEditorIds: { has: memberId } },
      select: { id: true, phase: true }
    })
  }

  async boardUpcomingSessionCount(memberId: string) {
    return this.prisma.boardSession.count({
      where: { status: $Enums.BoardSessionStatus.UPCOMING, allowedEditorIds: { has: memberId } }
    })
  }

  async pendingDecisionsBySessions(sessionIds: string[]) {
    if (sessionIds.length === 0) return []

    return this.prisma.boardDecision.findMany({
      where: {
        boardSessionId: { in: sessionIds },
        result: { in: [$Enums.BoardDecisionResult.PENDING, $Enums.BoardDecisionResult.PENDING_QUORUM] }
      },
      select: { id: true, boardSessionId: true, decisionType: true, targetSeriesId: true, result: true }
    })
  }

  async severeRiskRankings() {
    const records = await this.prisma.rankingRecord.findMany({
      orderBy: { recordedAt: 'desc' }
    })
    return this.latestPerSeries(records).filter((record) => record.riskLevel === $Enums.RiskLevel.SEVERE)
  }

  private latestPerSeries<T extends { seriesId: string }>(records: T[]): T[] {
    const seen = new Set<string>()
    const latest: T[] = []
    for (const record of records) {
      if (seen.has(record.seriesId)) continue
      seen.add(record.seriesId)
      latest.push(record)
    }
    return latest
  }
}
