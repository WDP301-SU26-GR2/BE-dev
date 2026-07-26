import { Inject, Logger, OnApplicationShutdown } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets'
import { createAdapter } from '@socket.io/redis-adapter'
import type { Redis } from 'ioredis'
import { Server, Socket } from 'socket.io'
import { corsOrigins } from 'src/core/config/cors'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { REDIS_WS_CONNECTION } from 'src/infrastructure/redis/redis.constant'
import { RedisService } from 'src/infrastructure/redis/redis.service'
import { SurveyPeriodNotOpenException } from './errors/survey.errors'
import { VoteTallyService } from './services/vote-tally.service'

const TALLY_THROTTLE_SECONDS = 2

@WebSocketGateway({
  cors: { origin: corsOrigins() },
  namespace: 'vote'
})
export class VoteGateway implements OnGatewayInit, OnApplicationShutdown {
  private readonly logger = new Logger(VoteGateway.name)
  private subClient?: Redis

  @WebSocketServer()
  server!: Server

  constructor(
    @Inject(REDIS_WS_CONNECTION) private readonly wsRedis: Redis,
    private readonly voteTallyService: VoteTallyService,
    private readonly redisService: RedisService
  ) {}

  afterInit() {
    const pubClient: Redis = this.wsRedis
    const subClient = pubClient.duplicate()
    this.subClient = subClient
    const ioServer = (this.server as unknown as { server?: unknown }).server ?? this.server

    if (typeof (ioServer as { adapter?: unknown }).adapter === 'function') {
      ;(ioServer as Server).adapter(createAdapter(pubClient, subClient))
      this.logger.log('[Socket.IO] Vote Redis adapter initialized for horizontal scaling')
      return
    }

    this.logger.warn('[Socket.IO] Vote Redis adapter initialization skipped: adapter setter not found')
  }

  async onApplicationShutdown(): Promise<void> {
    const subClient = this.subClient
    this.subClient = undefined
    if (subClient && subClient.status !== 'end') await subClient.quit()
  }

  @SubscribeMessage('joinPeriod')
  async handleJoinPeriod(@MessageBody() data: { periodId?: string }, @ConnectedSocket() client: Socket) {
    const periodId = data?.periodId
    if (!periodId || !isObjectId(periodId)) return { status: 'INVALID' }

    try {
      const tally = await this.voteTallyService.getLiveTally(periodId)
      await client.join(`vote:${periodId}`)
      client.emit('voteTally', tally)
      return { status: 'SUCCESS' }
    } catch (error) {
      if (error === SurveyPeriodNotOpenException) return { status: 'CLOSED' }
      this.logger.warn(
        `[Realtime] vote join rejected for period ${periodId}: ${error instanceof Error ? error.message : String(error)}`
      )
      return { status: 'INVALID' }
    }
  }

  // Called strictly after ReaderVote has committed. Socket and Redis failures are
  // best-effort side effects and must never change the successful vote response.
  async broadcastTally(periodId: string): Promise<void> {
    try {
      const canBroadcast = await this.redisService.setNxEx(`vote:tally:throttle:${periodId}`, TALLY_THROTTLE_SECONDS)
      if (!canBroadcast) return

      const tally = await this.voteTallyService.getLiveTally(periodId)
      this.server.to(`vote:${periodId}`).emit('voteTally', tally)
    } catch (error) {
      this.logger.error(
        `[Realtime] vote tally broadcast failed for period ${periodId}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
