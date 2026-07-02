import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { QUEUE } from 'src/infrastructure/queue/queue.constant'
import { TaskModule } from 'src/modules/task/task.module'
import { AiController } from './ai.controller'
import { AiRepository } from './ai.repo'
import { AiService } from './ai.service'
import { AiClientPort } from './ports/ai-client.port'
import { AiHttpClient } from './ports/ai-http.client'
import { AiJobStateService } from './services/ai-job-state.service'
import { AiProcessor } from './services/ai.processor'
import { AiSegmentService } from './services/ai-segment.service'

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE.AI }), TaskModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiSegmentService,
    AiJobStateService,
    AiRepository,
    AiProcessor,
    { provide: AiClientPort, useClass: AiHttpClient }
  ]
})
export class AiModule {}
