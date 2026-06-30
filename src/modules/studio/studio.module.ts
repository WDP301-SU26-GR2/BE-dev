import { Module } from '@nestjs/common'
import { StudioController } from './studio.controller'
import { StudioRepository } from './studio.repo'
import { StudioService } from './studio.service'
import { CollaborationInviteService } from './services/collaboration-invite.service'
import { StudioAssignmentService } from './services/studio-assignment.service'

@Module({
  controllers: [StudioController],
  providers: [StudioService, StudioRepository, CollaborationInviteService, StudioAssignmentService],
  exports: [StudioAssignmentService]
})
export class StudioModule {}
