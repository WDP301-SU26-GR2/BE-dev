import { Module } from '@nestjs/common'
import { ChapterModule } from '../chapter/chapter.module'
import { DeadlineController } from './deadline.controller'
import { DeadlineRepository } from './deadline.repo'
import { DeadlineService } from './deadline.service'
import { DeadlineFinalizeService } from './services/deadline-finalize.service'
import { DeadlineNegotiationService } from './services/deadline-negotiation.service'
import { DeadlineQueryService } from './services/deadline-query.service'
import { DeadlineRequestStateService } from './services/deadline-request-state.service'

@Module({
  imports: [ChapterModule],
  controllers: [DeadlineController],
  providers: [
    DeadlineService,
    DeadlineRepository,
    DeadlineRequestStateService,
    DeadlineNegotiationService,
    DeadlineFinalizeService,
    DeadlineQueryService
  ]
})
export class DeadlineModule {}
