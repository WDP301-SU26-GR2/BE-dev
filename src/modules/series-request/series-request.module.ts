import { Module } from '@nestjs/common'
import { ChapterModule } from '../chapter/chapter.module'
import { SeriesModule } from '../series/series.module'
import { SeriesRequestController } from './series-request.controller'
import { SeriesRequestRepository } from './series-request.repo'
import { SeriesRequestService } from './series-request.service'
import { SeriesRequestCreateService } from './services/series-request-create.service'
import { SeriesRequestDecisionService } from './services/series-request-decision.service'
import { SeriesRequestQueryService } from './services/series-request-query.service'
import { SeriesRequestStateService } from './services/series-request-state.service'

@Module({
  imports: [SeriesModule, ChapterModule],
  controllers: [SeriesRequestController],
  providers: [
    SeriesRequestService,
    SeriesRequestRepository,
    SeriesRequestStateService,
    SeriesRequestCreateService,
    SeriesRequestDecisionService,
    SeriesRequestQueryService
  ]
})
export class SeriesRequestModule {}
