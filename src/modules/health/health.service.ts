import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { RedisService } from 'src/infrastructure/redis/redis.service'
import { ServiceNotReadyException } from './errors/health.errors'

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  liveness() {
    return { status: 'ok' as const }
  }

  async readiness() {
    try {
      const database = await this.prisma.$runCommandRaw({ ping: 1 })
      const databaseReady =
        typeof database === 'object' && database !== null && 'ok' in database && Number(database.ok) === 1
      const redisReady = await this.redis.ping()
      if (!databaseReady || !redisReady) throw ServiceNotReadyException
      return { status: 'ok' as const }
    } catch {
      throw ServiceNotReadyException
    }
  }
}
