import { Module } from '@nestjs/common'
import { AdminUserQueryService } from './services/admin-user-query.service'
import { AssistantProfileService } from './services/assistant-profile.service'
import { MangakaProfileService } from './services/mangaka-profile.service'
import { AdminUserService } from './services/admin-user.service'
import { UsersController } from './users.controller'
import { UsersRepository } from './users.repo'
import { UsersService } from './users.service'

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersRepository,
    AdminUserService,
    AdminUserQueryService,
    MangakaProfileService,
    AssistantProfileService
  ],
  exports: [MangakaProfileService, AssistantProfileService]
})
export class UsersModule {}
