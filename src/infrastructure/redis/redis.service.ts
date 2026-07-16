import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import type { Redis } from 'ioredis'
import { REDIS_CLIENT } from './redis.constant'

@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name)

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onModuleInit(): Promise<void> {
    if (this.client.status !== 'ready') {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Redis connect timeout')), 5000)
        const onReady = () => {
          clearTimeout(timer)
          this.client.off('error', onError)
          resolve()
        }
        const onError = (err: Error) => {
          clearTimeout(timer)
          this.client.off('ready', onReady)
          reject(err)
        }
        this.client.once('ready', onReady)
        this.client.once('error', onError)
      })
    }
    const pong = await this.client.ping()
    this.logger.log(`Redis connected (PING ${pong})`)
  }

  async setNxEx(key: string, ttlSec: number, value = '1'): Promise<boolean> {
    try {
      const res = await this.client.set(key, value, 'EX', ttlSec, 'NX')
      return res === 'OK'
    } catch (error) {
      this.logger.warn(`Redis SET NX EX failed for key "${key}"`, error)
      return false
    }
  }

  async eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown> {
    return await this.client.eval(script, keys.length, ...keys, ...args)
  }

  // Spec 15.1 hardening: atomic INCR + EXPIRE-on-first-incr (Lua) cho quota reservation.
  // null = Redis lỗi → caller FAIL-OPEN (triết lý AGENTS §10 — Redis blip không được khóa nghiệp vụ).
  async incrWithTtl(key: string, ttlSec: number): Promise<number | null> {
    try {
      const value = (await this.client.eval(
        "local v = redis.call('INCR', KEYS[1]) if v == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end return v",
        1,
        key,
        ttlSec
      )) as number
      return value
    } catch (error) {
      this.logger.warn(`Redis INCR (incrWithTtl) failed for key "${key}"`, error)
      return null
    }
  }

  // Refund reservation best-effort — nuốt lỗi (mirror setNxEx): refund fail chỉ làm quota chặt hơn, không vỡ flow.
  async decrSafe(key: string): Promise<void> {
    try {
      await this.client.decr(key)
    } catch (error) {
      this.logger.warn(`Redis DECR (decrSafe) failed for key "${key}"`, error)
    }
  }
}
