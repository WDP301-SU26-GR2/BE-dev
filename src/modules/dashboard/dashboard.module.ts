import { Module } from '@nestjs/common'
import { ChapterModule } from 'src/modules/chapter/chapter.module'
import { RevisionModule } from 'src/modules/revision/revision.module'
import { UsersModule } from 'src/modules/users/users.module'
import { AdminDashboardController } from './admin-dashboard.controller'
import { AssistantDashboardController } from './assistant-dashboard.controller'
import { BoardDashboardController } from './board-dashboard.controller'
import { EditorDashboardController } from './editor-dashboard.controller'
import { MangakaDashboardController } from './mangaka-dashboard.controller'
import { DashboardRepository } from './dashboard.repo'
import { AdminDashboardService } from './services/admin-dashboard.service'
import { AssistantDashboardService } from './services/assistant-dashboard.service'
import { BoardDashboardService } from './services/board-dashboard.service'
import { EditorDashboardService } from './services/editor-dashboard.service'
import { MangakaDashboardService } from './services/mangaka-dashboard.service'
import { MangakaEarningsService } from './services/mangaka-earnings.service'
import { MangakaDashboardFacade } from './services/mangaka-dashboard.facade'
import {
  AdminDashboardFacade,
  AssistantDashboardFacade,
  BoardDashboardFacade,
  EditorDashboardFacade
} from './services/dashboard.facades'

@Module({
  imports: [ChapterModule, RevisionModule, UsersModule],
  controllers: [
    MangakaDashboardController,
    AssistantDashboardController,
    EditorDashboardController,
    BoardDashboardController,
    AdminDashboardController
  ],
  providers: [
    DashboardRepository,
    MangakaDashboardService,
    MangakaEarningsService,
    MangakaDashboardFacade,
    AssistantDashboardFacade,
    EditorDashboardFacade,
    BoardDashboardFacade,
    AdminDashboardFacade,
    AssistantDashboardService,
    EditorDashboardService,
    BoardDashboardService,
    AdminDashboardService
  ]
})
export class DashboardModule {}
