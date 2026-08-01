import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { NotificationType } from '@prisma/client'
import { RedisService } from 'src/infrastructure/redis/redis.service'
import { AppConfigService } from 'src/modules/app-config/app-config.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { ContractMessages } from '../contract.messages'
import { ContractRepo } from '../contract.repo'

@Injectable()
export class ContractRepClaimEscalationCron {
  private readonly logger = new Logger(ContractRepClaimEscalationCron.name)

  constructor(
    private readonly redisService: RedisService,
    private readonly appConfigService: AppConfigService,
    private readonly contractRepo: ContractRepo,
    private readonly notificationService: NotificationService
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async run(): Promise<void> {
    const locked = await this.redisService.setNxEx('cron:contract-rep-claim', 300)
    if (!locked) return

    try {
      const config = await this.appConfigService.get()
      const cutoff = new Date(Date.now() - config.boardRepClaimGraceDays * 24 * 60 * 60 * 1000)
      const [contracts, adminIds] = await Promise.all([
        this.contractRepo.findStaleUnclaimedBoardReview(cutoff),
        this.contractRepo.findSuperAdminIds()
      ])
      for (const contract of contracts) {
        for (const recipientId of adminIds) {
          await this.notificationService.notifySafe({
            recipientId,
            type: NotificationType.CONTRACT,
            referenceId: contract.id,
            referenceType: 'CONTRACT_REP_CLAIM_ESCALATED',
            content: ContractMessages.notification.repClaimEscalated
          })
        }
      }
    } catch (error) {
      this.logger.error(
        `Contract representative claim escalation failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
