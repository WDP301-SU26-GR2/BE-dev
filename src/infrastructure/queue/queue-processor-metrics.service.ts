import { Injectable } from '@nestjs/common'
import type { Job } from 'bullmq'
import { RuntimeMetricsService } from 'src/core/observability/runtime-metrics.service'

@Injectable()
export class QueueProcessorMetricsService {
  constructor(private readonly metrics: RuntimeMetricsService) {}

  async run<T>(queue: string, job: Job, handler: () => Promise<T> | T): Promise<T> {
    const startedAt = Date.now()
    const ageSeconds = typeof job.timestamp === 'number' ? Math.max(0, startedAt - job.timestamp) / 1000 : 0

    try {
      const result = await handler()
      this.record(queue, job.name, 'success', startedAt, ageSeconds)
      return result
    } catch (error) {
      const attempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1
      const outcome = job.attemptsMade + 1 < attempts ? 'retry' : 'failure'
      this.record(queue, job.name, outcome, startedAt, ageSeconds)
      throw error
    }
  }

  private record(
    queue: string,
    job: string,
    outcome: 'success' | 'failure' | 'retry',
    startedAt: number,
    ageSeconds: number
  ): void {
    this.metrics.recordQueueProcessing({
      queue,
      job,
      outcome,
      durationSeconds: Math.max(0, Date.now() - startedAt) / 1000,
      ageSeconds
    })
  }
}
