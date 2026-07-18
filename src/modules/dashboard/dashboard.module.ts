import { Module } from '@nestjs/common'
import { ChapterModule } from 'src/modules/chapter/chapter.module'
import { RevisionModule } from 'src/modules/revision/revision.module'
import { UsersModule } from 'src/modules/users/users.module'
import { DashboardController } from './dashboard.controller'
import { DashboardRepository } from './dashboard.repo'
import { AdminDashboardService } from './services/admin-dashboard.service'
import { AssistantDashboardService } from './services/assistant-dashboard.service'
import { BoardDashboardService } from './services/board-dashboard.service'
import { EditorDashboardService } from './services/editor-dashboard.service'
import { MangakaDashboardService } from './services/mangaka-dashboard.service'
import { MangakaEarningsService } from './services/mangaka-earnings.service'

@Module({
  imports: [ChapterModule, RevisionModule, UsersModule],
  controllers: [DashboardController],
  providers: [
    DashboardRepository,
    MangakaDashboardService,
    MangakaEarningsService,
    AssistantDashboardService,
    EditorDashboardService,
    BoardDashboardService,
    AdminDashboardService
  ]
})
export class DashboardModule {}
