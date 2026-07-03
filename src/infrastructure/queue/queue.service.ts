import { Injectable } from '@nestjs/common'
import { getQueueToken } from '@nestjs/bullmq'
import { ModuleRef } from '@nestjs/core'
import type { JobsOptions, Queue } from 'bullmq'
import { DEFAULT_JOB_OPTIONS } from './queue.constant'

// Khi Redis down: BullMQ connection (maxRetriesPerRequest:null + offline-queue mặc định) KHÔNG reject
// queue.add() mà BUFFER chờ reconnect → treo request. Bọc timeout để add() fail nhanh → producer fallback sync.
// (Verified bằng smoke: thiếu timeout thì register treo ~15s khi Redis chết.)
const ENQUEUE_TIMEOUT_MS = 2000

@Injectable()
export class QueueService {
  constructor(private readonly moduleRef: ModuleRef) {}

  private getQueue(name: string): Queue {
    return this.moduleRef.get<Queue>(getQueueToken(name), { strict: false })
  }

  async enqueue<T>(queue: string, jobName: string, payload: T, opts: JobsOptions = DEFAULT_JOB_OPTIONS): Promise<void> {
    await this.withTimeout(this.getQueue(queue).add(jobName, payload, opts), ENQUEUE_TIMEOUT_MS)
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
