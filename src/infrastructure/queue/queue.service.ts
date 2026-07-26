import { Injectable } from '@nestjs/common'
import { getQueueToken } from '@nestjs/bullmq'
import { ModuleRef } from '@nestjs/core'
import type { JobsOptions, Queue } from 'bullmq'
import { DEFAULT_JOB_OPTIONS } from './queue.constant'
import { RequestContextService } from 'src/core/observability/request-context.service'
import { RuntimeMetricsService } from 'src/core/observability/runtime-metrics.service'

// Khi Redis down: BullMQ connection (maxRetriesPerRequest:null + offline-queue mặc định) KHÔNG reject
// queue.add() mà BUFFER chờ reconnect → treo request. Bọc timeout để add() fail nhanh → producer fallback sync.
// (Verified bằng smoke: thiếu timeout thì register treo ~15s khi Redis chết.)
const ENQUEUE_TIMEOUT_MS = 2000

@Injectable()
export class QueueService {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly requestContext: RequestContextService,
    private readonly metrics: RuntimeMetricsService
  ) {}

  private getQueue(name: string): Queue {
    return this.moduleRef.get<Queue>(getQueueToken(name), { strict: false })
  }

  async enqueue<T>(queue: string, jobName: string, payload: T, opts: JobsOptions = DEFAULT_JOB_OPTIONS): Promise<void> {
    const requestId = this.requestContext.getRequestId()
    const data =
      requestId && typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? { ...payload, requestId }
        : payload
    const retryBudget = typeof opts.attempts === 'number' ? Math.max(0, opts.attempts - 1) : 0
    try {
      await this.withTimeout(this.getQueue(queue).add(jobName, data, opts), ENQUEUE_TIMEOUT_MS)
      this.metrics.recordQueueEnqueue({ queue, job: jobName, outcome: 'success', retryBudget })
    } catch (error) {
      this.metrics.recordQueueEnqueue({ queue, job: jobName, outcome: 'failure', retryBudget })
      throw error
    }
  }

  // Race promise enqueue với timeout. Quá hạn → reject để caller fallback. (Lưu ý: lệnh add() vẫn có thể
  // được flush khi Redis hồi → trùng job; với OTP là email lặp hiếm gặp, với notify thì idempotent — chấp nhận.)
  private async withTimeout<R>(promise: Promise<R>, ms: number): Promise<R> {
    let timer: NodeJS.Timeout
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`enqueue timed out after ${ms}ms`)), ms)
    })
    try {
      return await Promise.race([promise, timeout])
    } finally {
      clearTimeout(timer!)
    }
  }
}
