import { Module } from '@nestjs/common'
import { AdminModerationService } from './services/admin-moderation.service'
import { AdminStatsService } from './services/admin-stats.service'
import { AdminUserQueryService } from './services/admin-user-query.service'
import { AssistantProfileService } from './services/assistant-profile.service'
import { MangakaProfileService } from './services/mangaka-profile.service'
import { MangakaDirectoryService } from './services/mangaka-directory.service'
import { MeService } from './services/me.service'
import { AdminUserService } from './services/admin-user.service'
import { AssistantDirectoryService } from './services/assistant-directory.service'
import { StaffProfileService } from './services/staff-profile.service'
import { UsersController } from './users.controller'
import { UsersRepository } from './users.repo'
import { UsersService } from './users.service'

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersRepository,
    MeService,
    AdminUserService,
    AdminUserQueryService,
    AdminModerationService,
    AdminStatsService,
    MangakaProfileService,
    MangakaDirectoryService,
    AssistantProfileService,
    AssistantDirectoryService,
    StaffProfileService
  ],
  exports: [MangakaProfileService, AssistantProfileService, StaffProfileService]
})
export class UsersModule {}
