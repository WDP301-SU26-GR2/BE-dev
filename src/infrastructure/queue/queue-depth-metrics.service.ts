import { Injectable } from '@nestjs/common'
import { getQueueToken } from '@nestjs/bullmq'
import { ModuleRef } from '@nestjs/core'
import type { Queue } from 'bullmq'
import { RuntimeMetricsService } from 'src/core/observability/runtime-metrics.service'
import { QUEUE } from './queue.constant'

const QUEUE_DEPTH_TIMEOUT_MS = 1000
const STATES = ['waiting', 'active', 'delayed', 'failed'] as const

@Injectable()
export class QueueDepthMetricsService {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly metrics: RuntimeMetricsService
  ) {}

  async sample(): Promise<void> {
    await Promise.all(Object.values(QUEUE).map((name) => this.sampleQueue(name)))
  }

  private async sampleQueue(name: string): Promise<void> {
    try {
      const queue = this.moduleRef.get<Queue>(getQueueToken(name), { strict: false })
      const counts = await this.withTimeout(queue.getJobCounts(...STATES))
      this.metrics.recordQueueDepth(name, {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0
      })
    } catch {
      // Metrics scraping must remain available while Redis or a queue registration is unavailable.
    }
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('queue depth sample timed out')), QUEUE_DEPTH_TIMEOUT_MS)
    })
    try {
      return await Promise.race([operation, timeout])
    } finally {
      clearTimeout(timer!)
    }
  }
}
