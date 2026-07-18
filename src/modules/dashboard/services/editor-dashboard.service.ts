import { Injectable } from '@nestjs/common'
import { $Enums } from '@prisma/client'
import { ChapterProgressService } from 'src/modules/chapter/services/chapter-progress.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { DashboardRepository } from '../dashboard.repo'

@Injectable()
export class EditorDashboardService {
  constructor(
    private readonly progressService: ChapterProgressService,
    private readonly dashboardRepository: DashboardRepository,
    private readonly notificationService: NotificationService
  ) {}

  async build(userId: string) {
    const [reviewQueue, seriesRows, seriesForRanking, pendingContracts, overview, unreadNotifications] =
      await Promise.all([
        this.dashboardRepository.editorReviewQueueCount(),
        this.dashboardRepository.editorSeriesByStatus(userId),
        this.dashboardRepository.editorSeriesForRanking(userId),
        this.dashboardRepository.editorPendingContracts(userId),
        this.progressService.overviewForEditor(userId),
        this.notificationService.countUnread(userId)
      ])
    const byStatus = Object.fromEntries(Object.values($Enums.SeriesStatus).map((status) => [status, 0])) as Record<
      $Enums.SeriesStatus,
      number
    >
    for (const row of seriesRows) byStatus[row.status] = row._count._all
    const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0)

    const titleById = new Map(seriesForRanking.map((series) => [series.id, series.title]))
    const latest = await this.dashboardRepository.latestRankingForSeries([...titleById.keys()])
    const atRisk = latest
      .filter((ranking) => ranking.riskLevel !== $Enums.RiskLevel.NONE)
      .map((ranking) => ({
        seriesId: ranking.seriesId,
        title: titleById.get(ranking.seriesId) ?? '',
        riskLevel: ranking.riskLevel,
        rankPosition: ranking.rankPosition
      }))
    const productionAlerts = overview.items.filter((item) => item.warningLevel !== 'NONE')

    return {
      reviewQueue,
      mySeries: { byStatus, total },
      atRisk,
      productionAlerts,
      pendingContracts: pendingContracts.map((contract) => ({
        contractId: contract.id,
        seriesId: contract.seriesId,
        status: contract.status
      })),
      unreadNotifications
    }
  }
}
