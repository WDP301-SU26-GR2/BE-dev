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
}
