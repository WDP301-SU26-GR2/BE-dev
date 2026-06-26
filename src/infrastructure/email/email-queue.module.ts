import { Global, Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { QUEUE } from 'src/infrastructure/queue/queue.constant'
import { EmailProcessor } from './email.processor'
import { EmailQueue } from './email.queue'

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE.EMAIL })],
  providers: [EmailQueue, EmailProcessor],
  exports: [EmailQueue]
})
export class EmailQueueModule {}
