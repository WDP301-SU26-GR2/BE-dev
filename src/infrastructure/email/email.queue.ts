import { Injectable, Logger } from '@nestjs/common'
import { JOB, QUEUE } from 'src/infrastructure/queue/queue.constant'
import { QueueService } from 'src/infrastructure/queue/queue.service'
import { EmailService } from './email.service'

export interface SendOtpJob {
  email: string
  code: string
  expiresInMinutes: number
}

export interface SendAdminCredJob {
  email: string
  name: string
  temporaryPassword: string
}

@Injectable()
export class EmailQueue {
  private readonly logger = new Logger(EmailQueue.name)

  constructor(
    private readonly queueService: QueueService,
    private readonly emailService: EmailService
  ) {}

  async enqueueOtp(payload: SendOtpJob): Promise<void> {
    try {
      await this.queueService.enqueue(QUEUE.EMAIL, JOB.SEND_OTP, payload)
    } catch (err) {
      this.logger.error('enqueue OTP failed, fallback sync', err as Error)
      try {
        const { error } = await this.emailService.sendOTP(payload)
        if (error) this.logger.error(`fallback sync OTP send failed for ${payload.email}: ${error.message}`)
      } catch (mailError) {
        this.logger.error(`fallback sync OTP send threw for ${payload.email}`, mailError as Error)
      }
    }
  }

  async enqueueAdminCred(payload: SendAdminCredJob): Promise<void> {
    try {
      await this.queueService.enqueue(QUEUE.EMAIL, JOB.SEND_ADMIN_CRED, payload)
    } catch (err) {
      this.logger.error('enqueue admin credentials failed, fallback sync', err as Error)
      try {
        const { error } = await this.emailService.sendAccountCredentials(payload)
        if (error) this.logger.error(`fallback sync admin credentials failed for ${payload.email}: ${error.message}`)
      } catch (mailError) {
        this.logger.error(`fallback sync admin credentials threw for ${payload.email}`, mailError as Error)
      }
    }
  }
}
