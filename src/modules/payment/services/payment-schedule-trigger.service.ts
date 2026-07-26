import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { Prisma } from '@prisma/client'
import { CronMetricsService, runCron } from 'src/core/observability/cron-metrics.service'
import { RedisService } from 'src/infrastructure/redis/redis.service'
import { PaymentRecordRepo } from '../payment.repo'

@Injectable()
export class PaymentScheduleTriggerService {
  private readonly logger = new Logger(PaymentScheduleTriggerService.name)

  constructor(
    private readonly paymentRepo: PaymentRecordRepo,
    private readonly redisService: RedisService,
    private readonly cronMetrics?: CronMetricsService
  ) {}

  async handleSeriesHiatusStarted(payload: { seriesId: string }) {
    await this.paymentRepo.pauseTimeBoundConditions(payload.seriesId)
  }

  async handleSeriesHiatusEnded(payload: { seriesId: string; pausedMs: number }) {
    const conditions = await this.paymentRepo.findDisabledTimeBoundConditions(payload.seriesId)
    for (const condition of conditions) {
      await this.paymentRepo.resumeTimeBoundCondition(
        condition.id,
        this.shiftDeadline(condition.thresholdConfig, payload.pausedMs)
      )
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markMissedTimeBoundConditions() {
    if (!(await this.redisService.setNxEx('cron:payment-timebound-missed', 300))) return
    try {
      await runCron(this.cronMetrics, 'payment-timebound-missed', async () => {
        const now = new Date()
        const conditions = await this.paymentRepo.findPendingTimeBoundConditions()
        for (const condition of conditions) {
          try {
            const deadline = this.readDeadline(condition.thresholdConfig)
            if (deadline && deadline < now) await this.paymentRepo.markConditionMissed(condition.id)
          } catch (error) {
            this.logger.error(
              `TIME_BOUND missed cron: skip condition ${condition.id} — ${error instanceof Error ? error.message : String(error)}`
            )
          }
        }
      })
    } catch (error) {
      this.logger.error(`TIME_BOUND missed cron failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private readDeadline(config: unknown) {
    if (!config || typeof config !== 'object') return null
    const deadline = (config as Record<string, unknown>).deadline
    if (typeof deadline !== 'string') return null
    const date = new Date(`${deadline}T23:59:59.999Z`)
    return Number.isNaN(date.getTime()) ? null : date
  }

  private shiftDeadline(config: Prisma.JsonValue, pausedMs: number): Prisma.InputJsonObject {
    const base: Record<string, Prisma.InputJsonValue | null> = {}
    if (config && typeof config === 'object' && !Array.isArray(config)) {
      for (const [key, value] of Object.entries(config)) {
        if (value !== undefined) base[key] = this.toInputJsonValue(value)
      }
    }
    const deadline = base.deadline
    if (typeof deadline === 'string') {
      const shifted = new Date(new Date(`${deadline}T00:00:00.000Z`).getTime() + pausedMs)
      if (!Number.isNaN(shifted.getTime())) base.deadline = shifted.toISOString().slice(0, 10)
    }
    return base
  }

  private toInputJsonValue(value: Prisma.JsonValue): Prisma.InputJsonValue | null {
    if (value === null) return null
    if (Array.isArray(value)) return value.map((item) => this.toInputJsonValue(item))
    if (typeof value !== 'object') return value
    const object: Record<string, Prisma.InputJsonValue | null> = {}
    for (const [key, nestedValue] of Object.entries(value)) {
      if (nestedValue !== undefined) object[key] = this.toInputJsonValue(nestedValue)
    }
    return object
  }
}
