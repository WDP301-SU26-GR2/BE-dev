import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common'
import type { Redis } from 'ioredis'
import { REDIS_BULL_CONNECTION, REDIS_CLIENT, REDIS_WS_CONNECTION } from './redis.constant'

@Injectable()
export class RedisConnectionsLifecycle implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisConnectionsLifecycle.name)

  constructor(
    @Inject(REDIS_CLIENT) private readonly generalClient: Redis,
    @Inject(REDIS_BULL_CONNECTION) private readonly bullClient: Redis,
    @Inject(REDIS_WS_CONNECTION) private readonly websocketClient: Redis
  ) {}

  async onApplicationShutdown(): Promise<void> {
    const clients = [...new Set([this.generalClient, this.bullClient, this.websocketClient])]
    await Promise.all(
      clients.map(async (client) => {
        if (client.status === 'end') return
        try {
          await client.quit()
        } catch (error) {
          this.logger.warn('Redis QUIT failed during shutdown; disconnecting the socket', error)
          client.disconnect()
        }
      })
    )
  }
}
