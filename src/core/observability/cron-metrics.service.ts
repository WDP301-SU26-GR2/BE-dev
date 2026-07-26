import { Injectable, Logger } from '@nestjs/common'
import { RuntimeMetricsService } from './runtime-metrics.service'

@Injectable()
export class CronMetricsService {
  private readonly logger = new Logger(CronMetricsService.name)

  constructor(private readonly metrics: RuntimeMetricsService) {}

  async run<T>(job: string, task: () => Promise<T>): Promise<T> {
    const startedAt = performance.now()
    try {
      const result = await task()
      this.record(job, 'success', startedAt)
      return result
    } catch (error) {
      this.record(job, 'failure', startedAt)
      throw error
    }
  }

  private record(job: string, outcome: 'success' | 'failure', startedAt: number): void {
    try {
      this.metrics.recordCron({
        job,
        outcome,
        durationSeconds: Math.max(0, performance.now() - startedAt) / 1000
      })
    } catch (error) {
      this.logger.warn(
        `Unable to record cron metrics for ${job}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

export function runCron<T>(metrics: CronMetricsService | undefined, job: string, task: () => Promise<T>): Promise<T> {
  return metrics ? metrics.run(job, task) : task()
}
