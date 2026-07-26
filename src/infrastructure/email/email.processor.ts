import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import { JOB, QUEUE } from 'src/infrastructure/queue/queue.constant'
import { QueueProcessorMetricsService } from 'src/infrastructure/queue/queue-processor-metrics.service'
import { EmailService } from './email.service'
import type { SendAdminCredJob, SendOtpJob } from './email.queue'

@Processor(QUEUE.EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name)

  constructor(
    private readonly emailService: EmailService,
    private readonly processorMetrics: QueueProcessorMetricsService
  ) {
    super()
  }

  async process(job: Job): Promise<void> {
    return this.processorMetrics.run(QUEUE.EMAIL, job, () => this.processJob(job))
  }

  private async processJob(job: Job): Promise<void> {
    if (job.name === JOB.SEND_OTP) {
      const { error } = await this.emailService.sendOTP(job.data as SendOtpJob)
      if (error) throw new Error(`sendOTP failed: ${error.message}`)
      return
    }

    if (job.name === JOB.SEND_ADMIN_CRED) {
      const { error } = await this.emailService.sendAccountCredentials(job.data as SendAdminCredJob)
      if (error) throw new Error(`sendAccountCredentials failed: ${error.message}`)
      return
    }

    this.logger.warn(`Unknown email job: ${job.name}`)
  }
}
