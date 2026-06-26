import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import type { Redis } from 'ioredis'
import { REDIS_CLIENT } from './redis.constant'

@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name)

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onModuleInit(): Promise<void> {
    await this.client.ping()
    this.logger.log('Redis connected (PING ok)')
  }

  getClient(): Redis {
    return this.client
  }

  async setNxEx(key: string, ttlSec: number, value = '1'): Promise<boolean> {
    const res = await this.client.set(key, value, 'EX', ttlSec, 'NX')
    return res === 'OK'
  }

  async eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown> {
    return await this.client.eval(script, keys.length, ...keys, ...args)
  }
}
