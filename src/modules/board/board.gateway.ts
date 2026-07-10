import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Logger } from '@nestjs/common'
import { createAdapter } from '@socket.io/redis-adapter'
import { RedisService } from 'src/infrastructure/redis/redis.service'
import { TokenService } from 'src/infrastructure/token/token.service'
import { RoleName } from 'src/core/security/constants/role.constant'
import { BoardRepository } from './board.repo'
import type { Redis } from 'ioredis'

// Fix-1 G-9: guard sessionId (Prisma ObjectId) — chặn query thừa với input rác.
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'board'
})
export class BoardGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(BoardGateway.name)

  @WebSocketServer()
  server!: Server

  constructor(
    private readonly redisService: RedisService,
    private readonly tokenService: TokenService,
    private readonly boardRepo: BoardRepository
  ) {}

  afterInit() {
    const pubClient: Redis = this.redisService.getClient()
    const subClient: Redis = pubClient.duplicate()

    const ioServer = (this.server as unknown as { server?: unknown }).server ?? this.server
    if (typeof (ioServer as any).adapter === 'function') {
      ;(ioServer as any).adapter(createAdapter(pubClient, subClient))
      this.logger.log('[Socket.IO] Redis Adapter initialized for horizontal scaling')
    } else {
      this.logger.warn('[Socket.IO] Unable to initialize Redis Adapter: adapter setter not found on server instance')
    }
  }

  // Fix-1 G-9: verify JWT ngay lúc connect — thiếu/sai token → cắt kết nối.
  async handleConnection(client: Socket) {
    try {
      const raw =
        (client.handshake.auth?.token as string | undefined) ??
        (typeof client.handshake.headers.authorization === 'string'
          ? client.handshake.headers.authorization.replace(/^Bearer /, '')
          : undefined)
      if (!raw) throw new Error('missing token')
      const payload = await this.tokenService.verifyAccessToken(raw)
      client.data.userId = payload.userId
      client.data.roleName = payload.roleName
    } catch {
      this.logger.warn(`[Socket] Rejected unauthenticated connection ${client.id}`)
      client.disconnect(true)
    }
  }

  // Fix-1 G-9: chỉ roster/creator/SUPER_ADMIN được vào room phiên họp.
  @SubscribeMessage('joinSession')
  async handleJoinSession(@MessageBody() data: { sessionId: string }, @ConnectedSocket() client: Socket) {
    const { userId, roleName } = client.data as { userId?: string; roleName?: string }
    if (!userId) {
      client.disconnect(true)
      return { status: 'DENIED' }
    }
    if (!data?.sessionId || !OBJECT_ID_RE.test(data.sessionId)) return { status: 'DENIED' }
    const session = await this.boardRepo.findSessionById(data.sessionId)
    if (!session) return { status: 'DENIED' }
    const allowed =
      roleName === RoleName.SUPER_ADMIN || session.creatorId === userId || session.allowedEditorIds.includes(userId)
    if (!allowed) {
      this.logger.warn(`[Socket] joinSession DENIED user=${userId} session=${data.sessionId}`)
      return { status: 'DENIED' }
    }
    const roomName = `session_${data.sessionId}`
    await client.join(roomName)
    this.logger.log(`[Socket] Client ${client.id} đã vào phòng: ${roomName}`)
    return { status: 'SUCCESS', message: `Đã kết nối vào phòng ${data.sessionId}` }
  }

  broadcastVoteProgress(sessionId: string, progressData: any) {
    const roomName = `session_${sessionId}`
    this.server.to(roomName).emit('voteProgressUpdated', progressData)
    this.logger.log(`[Realtime] Đã phát sóng tiến độ mới cho phòng: ${roomName}`)
  }
}
