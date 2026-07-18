import { Injectable } from '@nestjs/common'
import { NotificationService } from 'src/modules/notification/notification.service'
import { DashboardRepository } from '../dashboard.repo'

@Injectable()
export class BoardDashboardService {
  constructor(
    private readonly dashboardRepository: DashboardRepository,
    private readonly notificationService: NotificationService
  ) {}

  async build(userId: string) {
    const [sessions, upcomingSessions, severe, unreadNotifications] = await Promise.all([
      this.dashboardRepository.boardActiveSessions(userId),
      this.dashboardRepository.boardUpcomingSessionCount(userId),
      this.dashboardRepository.severeRiskRankings(),
      this.notificationService.countUnread(userId)
    ])
    const phaseBySession = new Map(sessions.map((session) => [session.id, session.phase]))
    const decisions = await this.dashboardRepository.pendingDecisionsBySessions([...phaseBySession.keys()])
    const completeDecisions = decisions.flatMap((decision) => {
      const phase = phaseBySession.get(decision.boardSessionId)
      const { decisionType, result } = decision
      if (decisionType === null || result === null || phase == null) return []
      return [{ decision, decisionType, phase, result }]
    })
    const decisionSeriesIds = completeDecisions
      .map(({ decision }) => decision.targetSeriesId)
      .filter((seriesId): seriesId is string => Boolean(seriesId))
    const severeSeriesIds = severe.map((ranking) => ranking.seriesId)
    const titles = await this.dashboardRepository.seriesTitles([...new Set([...decisionSeriesIds, ...severeSeriesIds])])
    const titleById = new Map(titles.map((series) => [series.id, series.title]))

    return {
      pendingDecisions: completeDecisions.map(({ decision, decisionType, phase, result }) => ({
        decisionId: decision.id,
        boardSessionId: decision.boardSessionId,
        decisionType,
        targetSeries: decision.targetSeriesId
          ? { id: decision.targetSeriesId, title: titleById.get(decision.targetSeriesId) ?? '' }
          : null,
        phase,
        result
      })),
      upcomingSessions,
      atRiskSevere: severe.map((ranking) => ({
        seriesId: ranking.seriesId,
        title: titleById.get(ranking.seriesId) ?? '',
        rankPosition: ranking.rankPosition
      })),
      unreadNotifications
    }
  }
}
