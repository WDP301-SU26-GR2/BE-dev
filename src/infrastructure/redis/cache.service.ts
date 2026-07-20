import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Redis } from 'ioredis'
import envConfig from 'src/core/config/envConfig'
import type { CacheNamespace } from './cache.constant'
import { REDIS_CLIENT } from './redis.constant'

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name)

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async getOrSet<T>(ns: CacheNamespace, suffix: string, ttlSec: number, loader: () => Promise<T>): Promise<T> {
    if (!envConfig.READ_CACHE_ENABLED) return loader()

    let key: string
    try {
      const version = (await this.client.get(`cache:ver:${ns}`)) ?? '0'
      key = `cache:${ns}:v${version}:${suffix}`
      const hit = await this.client.get(key)
      if (hit !== null) return JSON.parse(hit) as T
    } catch (error) {
      this.logger.warn(`Redis cache GET failed for namespace "${ns}"; falling back to loader`, error)
      return loader()
    }

    const value = await loader()
    try {
      await this.client.set(key!, JSON.stringify(value), 'EX', ttlSec)
    } catch (error) {
      this.logger.warn(`Redis cache SET failed for key "${key!}"`, error)
    }
    return value
  }

  async bumpVersion(ns: CacheNamespace): Promise<void> {
    try {
      await this.client.incr(`cache:ver:${ns}`)
    } catch (error) {
      this.logger.warn(`Redis cache version bump failed for namespace "${ns}"`, error)
    }
  }
}
