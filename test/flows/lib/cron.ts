import { NestFactory } from '@nestjs/core'
import { ModulesContainer } from '@nestjs/core'
import { SchedulerRegistry } from '@nestjs/schedule'
import { Redis } from 'ioredis'
import { pathToFileURL } from 'node:url'
import * as path from 'node:path'
import './env.js'

// Resolve AppModule: tsx chạy từ cwd (BE-dev/), nên path relative 'dist/app.module.js' OK nếu đã build.
// Trong flowtest ta LUÔN chạy sau khi `pnpm build` (dist/ có sẵn), nên load từ dist là đủ.
const APP_MODULE_PATH = path.resolve(process.cwd(), 'dist/app.module.js')

export type CronCtx = {
  get: <T>(clsOrToken: new (...a: any[]) => T) => T
  // Lấy provider theo TÊN class (không cần import class từ dist trong file test).
  getByName: <T = any>(className: string) => T
  close: () => Promise<void>
}

// Boot NestApplicationContext KHÔNG listen HTTP, stop mọi cron tick → gọi cron thủ công deterministic.
// Chạy song song server flowtest :4100 là AN TOÀN: context không listen port, Prisma/Redis cho phép
// nhiều client cùng DB. (Ghi chú cho FINDING-BE-009 cũ: "conflict" thực ra là env chưa load — đã fix ở lib/env.)
export const withCronContext = async <R>(fn: (ctx: CronCtx) => Promise<R>): Promise<R> => {
  const mod = await import(pathToFileURL(APP_MODULE_PATH).href)
  const AppModule = mod.AppModule ?? mod.default
  if (!AppModule) throw new Error(`AppModule not found at ${APP_MODULE_PATH} — run pnpm build first`)

  // logger error/warn BẬT: worker BullMQ chạy trong context này — nuốt log là mù lỗi process job.
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] })
  try {
    const registry = app.get(SchedulerRegistry)
    registry.getCronJobs().forEach((job) => {
      try {
        job.stop()
      } catch {
        // ignore
      }
    })
    const container = app.get(ModulesContainer)
    const getByName = <T = any>(className: string): T => {
      for (const [, moduleRef] of container.entries()) {
        for (const [, wrapper] of moduleRef.providers.entries()) {
          const meta = wrapper.metatype as { name?: string } | undefined
          if (meta?.name === className && wrapper.instance) return wrapper.instance as T
        }
      }
      throw new Error(`Provider ${className} not found in DI container`)
    }
    const ctx: CronCtx = {
      get: <T>(clsOrToken: new (...a: any[]) => T) => app.get(clsOrToken),
      getByName,
      close: async () => {
        await app.close()
      }
    }
    return await fn(ctx)
  } finally {
    try {
      await app.close()
    } catch {
      // ignore — close có thể đã được gọi
    }
  }
}

// Mọi cron đều giữ Redis lock `cron:<name>` TTL 300–600s (chống chạy trùng đa-instance).
// Server flowtest cũng tick các cron này theo lịch → lock có thể ĐANG bị giữ khi test gọi .run()
// trực tiếp. Xoá lock trước mỗi lần gọi để deterministic (và để test được idempotency THẬT —
// dedup per-day của NotificationService — thay vì bị lock chặn hờ).
const CRON_LOCK_KEYS = [
  'cron:otp-cleanup',
  'cron:orphan-asset',
  'cron:deadline-warning',
  'cron:coowner-escalation',
  'cron:hiatus-too-long',
  'cron:payment-timebound-missed'
  // 'cron:board-scheduler' KHÔNG xoá — C-17..20 đợi server tick thật.
]

export const clearCronLocks = async (): Promise<void> => {
  // offlineQueue mặc định (true): lệnh del xếp hàng chờ connect xong — test không cần fail-fast.
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: 2 })
  try {
    await redis.del(...CRON_LOCK_KEYS)
  } finally {
    redis.disconnect()
  }
}

// Poll đến khi cond() true hoặc hết timeout. Trả về true nếu đạt.
export const waitUntil = async (
  cond: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 3000
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await cond()) return true
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return cond()
}
