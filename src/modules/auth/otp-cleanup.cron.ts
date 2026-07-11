import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { RedisService } from 'src/infrastructure/redis/redis.service'
import { AuthRepository } from './auth.repo'

@Injectable()
export class OtpCleanupCron {
  private readonly logger = new Logger(OtpCleanupCron.name)

  constructor(
    private readonly redisService: RedisService,
    private readonly authRepository: AuthRepository
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async run(): Promise<void> {
    const locked = await this.redisService.setNxEx('cron:otp-cleanup', 600)
    if (!locked) return

    try {
      const { count } = await this.authRepository.deleteExpiredOtpRequests(new Date())
      this.logger.log(`OTP cleanup cron: removed ${count} expired otp requests`)
    } catch (error) {
      this.logger.error(`OTP cleanup cron failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
