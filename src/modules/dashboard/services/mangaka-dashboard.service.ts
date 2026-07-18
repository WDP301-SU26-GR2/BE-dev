import { Injectable } from '@nestjs/common'
import { ChapterProgressService } from 'src/modules/chapter/services/chapter-progress.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { RevisionService } from 'src/modules/revision/revision.service'
import { DashboardRepository } from '../dashboard.repo'

@Injectable()
export class MangakaDashboardService {
  constructor(
    private readonly progressService: ChapterProgressService,
    private readonly dashboardRepository: DashboardRepository,
    private readonly notificationService: NotificationService,
    private readonly revisionService: RevisionService
  ) {}

  async build(userId: string) {
    const [studio, rankings, unreadNotifications, openRevisionRequests] = await Promise.all([
      this.progressService.overviewForMangaka(userId),
      this.dashboardRepository.rankingForMangaka(userId),
      this.notificationService.countUnread(userId),
      this.revisionService.countOpenForRecipient(userId)
    ])

    return { studio: studio.items, rankings, unreadNotifications, openRevisionRequests }
  }
}
