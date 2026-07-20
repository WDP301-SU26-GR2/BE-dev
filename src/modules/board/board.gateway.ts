import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnApplicationShutdown
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Inject, Logger } from '@nestjs/common'
import { createAdapter } from '@socket.io/redis-adapter'
import { REDIS_WS_CONNECTION } from 'src/infrastructure/redis/redis.constant'
import { TokenService } from 'src/infrastructure/token/token.service'
import { RoleName } from 'src/core/security/constants/role.constant'
import { corsOrigins } from 'src/core/config/cors'
import { BoardRepository } from './board.repo'
import { BoardMeetingService } from './services/board-meeting.service'
import type { Redis } from 'ioredis'

// Fix-1 G-9: guard sessionId (Prisma ObjectId) — chặn query thừa với input rác.
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@WebSocketGateway({
  cors: { origin: corsOrigins() },
  namespace: 'board'
})
export class BoardGateway implements OnGatewayInit, OnGatewayConnection, OnApplicationShutdown {
  private readonly logger = new Logger(BoardGateway.name)
  private subClient: Redis | null = null

  @WebSocketServer()
  server!: Server

  constructor(
    @Inject(REDIS_WS_CONNECTION) private readonly wsRedis: Redis,
    private readonly tokenService: TokenService,
    private readonly boardRepo: BoardRepository,
    private readonly boardMeetingService: BoardMeetingService
  ) {}

  afterInit() {
    const pubClient: Redis = this.wsRedis
    const subClient: Redis = pubClient.duplicate()
    this.subClient = subClient

    const ioServer = (this.server as unknown as { server?: unknown }).server ?? this.server
    if (typeof (ioServer as any).adapter === 'function') {
      ;(ioServer as any).adapter(createAdapter(pubClient, subClient))
      this.logger.log('[Socket.IO] Redis Adapter initialized for horizontal scaling')
    } else {
      this.logger.warn('[Socket.IO] Unable to initialize Redis Adapter: adapter setter not found on server instance')
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.subClient || this.subClient.status === 'end') return
    try {
      await this.subClient.quit()
    } catch (error) {
      this.logger.warn('[Socket.IO] Redis subscriber QUIT failed; disconnecting the socket', error)
      this.subClient.disconnect()
    } finally {
      this.subClient = null
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

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody() data: { sessionId: string; content: string },
    @ConnectedSocket() client: Socket
  ) {
    const { userId, roleName } = client.data as { userId?: string; roleName?: string }
    if (!userId) {
      client.disconnect(true)
      return { status: 'DENIED', reason: 'NOT_PARTICIPANT' }
    }

    try {
      const result = await this.boardMeetingService.sendMessage(
        userId,
        roleName,
        data?.sessionId ?? '',
        data?.content ?? ''
      )
      if (result.status !== 'SUCCESS') return result

      const message = { ...result.message, createdAt: result.message.createdAt.toISOString() }
      this.broadcastMessageReceived(message.sessionId, message)
      return { status: 'SUCCESS', message }
    } catch (error) {
      this.logger.error(`[Socket] sendMessage failed — ${error instanceof Error ? error.message : String(error)}`)
      return { status: 'ERROR' }
    }
  }

  broadcastPhaseChanged(sessionId: string, phase: string) {
    try {
      this.server.to(`session_${sessionId}`).emit('phaseChanged', { sessionId, phase })
    } catch (error) {
      this.logger.error(
        `[Realtime] phaseChanged broadcast thất bại session ${sessionId} — ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  broadcastMessageReceived(sessionId: string, message: unknown) {
    try {
      this.server.to(`session_${sessionId}`).emit('messageReceived', message)
    } catch (error) {
      this.logger.error(
        `[Realtime] messageReceived broadcast thất bại session ${sessionId} — ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  // Realtime hardening (audit 2026-07-11): broadcast là side-effect SAU khi vote đã ghi DB —
  // lỗi socket (server chưa init / adapter hỏng) tuyệt đối không được làm castVote trả 500.
  broadcastVoteProgress(sessionId: string, progressData: any) {
    try {
      const roomName = `session_${sessionId}`
      this.server.to(roomName).emit('voteProgressUpdated', progressData)
      this.logger.log(`[Realtime] Đã phát sóng tiến độ mới cho phòng: ${roomName}`)
    } catch (error) {
      this.logger.error(
        `[Realtime] broadcast thất bại cho session ${sessionId} — ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
