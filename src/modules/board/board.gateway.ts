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
import { Inject, Logger } from '@nestjs/common'
import { createAdapter } from '@socket.io/redis-adapter'
import { REDIS_WS_CONNECTION } from 'src/infrastructure/redis/redis.constant'
import { TokenService } from 'src/infrastructure/token/token.service'
import { RoleName } from 'src/core/security/constants/role.constant'
import { corsOrigins } from 'src/core/config/cors'
import { BoardRepository } from './board.repo'
import { BoardMeetingService } from './services/board-meeting.service'
import type { Redis } from 'ioredis'
import { $Enums } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'

// Fix-1 G-9: guard sessionId (Prisma ObjectId) — chặn query thừa với input rác.

interface BoardSocketData {
  userId?: string
  roleName?: string
}

interface BoardServerToClientEvents {
  phaseChanged: (payload: { sessionId: string; phase: string }) => void
  messageReceived: (message: unknown) => void
  voteProgressUpdated: (progress: BoardVoteProgress) => void
}

interface BoardClientToServerEvents {
  joinSession: (payload: { sessionId: string }) => void
  sendMessage: (payload: { sessionId: string; content: string }) => void
}

interface BoardVoteProgress {
  decisionId: string
  approveCount: number
  rejectCount: number
  totalVotes: number
  quorumMet: boolean
  result: $Enums.BoardDecisionResult | null
}

interface AdapterConfigurable {
  adapter: (adapter: ReturnType<typeof createAdapter>) => unknown
}

function isAdapterConfigurable(value: unknown): value is AdapterConfigurable {
  if (typeof value !== 'object' || value === null || !('adapter' in value)) return false
  return typeof value.adapter === 'function'
}

function readStringField(value: unknown, field: string): string {
  if (typeof value !== 'object' || value === null || !(field in value)) return ''
  const fieldValue = (value as Record<string, unknown>)[field]
  return typeof fieldValue === 'string' ? fieldValue : ''
}

@WebSocketGateway({
  cors: { origin: corsOrigins() },
  namespace: 'board'
})
export class BoardGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(BoardGateway.name)

  @WebSocketServer()
  server!: Server<BoardClientToServerEvents, BoardServerToClientEvents, Record<string, never>, BoardSocketData>

  constructor(
    @Inject(REDIS_WS_CONNECTION) private readonly wsRedis: Redis,
    private readonly tokenService: TokenService,
    private readonly boardRepo: BoardRepository,
    private readonly boardMeetingService: BoardMeetingService
  ) {}

  afterInit() {
    const pubClient: Redis = this.wsRedis
    const subClient: Redis = pubClient.duplicate()

    const ioServer = (this.server as unknown as { server?: unknown }).server ?? this.server
    if (isAdapterConfigurable(ioServer)) {
      ioServer.adapter(createAdapter(pubClient, subClient))
      this.logger.log('[Socket.IO] Redis Adapter initialized for horizontal scaling')
    } else {
      this.logger.warn('[Socket.IO] Unable to initialize Redis Adapter: adapter setter not found on server instance')
    }
  }

  // Fix-1 G-9: verify JWT ngay lúc connect — thiếu/sai token → cắt kết nối.
  async handleConnection(
    client: Socket<BoardClientToServerEvents, BoardServerToClientEvents, Record<string, never>, BoardSocketData>
  ) {
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
  async handleJoinSession(
    @MessageBody() data: unknown,
    @ConnectedSocket()
    client: Socket<BoardClientToServerEvents, BoardServerToClientEvents, Record<string, never>, BoardSocketData>
  ) {
    const { userId, roleName } = client.data
    const sessionId = readStringField(data, 'sessionId')
    if (!userId) {
      client.disconnect(true)
      return { status: 'DENIED' }
    }
    if (!sessionId || !isObjectId(sessionId)) return { status: 'DENIED' }
    const session = await this.boardRepo.findSessionById(sessionId)
    if (!session) return { status: 'DENIED' }
    const allowed =
      roleName === RoleName.SUPER_ADMIN || session.creatorId === userId || session.allowedEditorIds.includes(userId)
    if (!allowed) {
      this.logger.warn(`[Socket] joinSession DENIED user=${userId} session=${sessionId}`)
      return { status: 'DENIED' }
    }
    const roomName = `session_${sessionId}`
    await client.join(roomName)
    this.logger.log(`[Socket] Client ${client.id} đã vào phòng: ${roomName}`)
    return { status: 'SUCCESS', message: `Đã kết nối vào phòng ${sessionId}` }
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody() data: unknown,
    @ConnectedSocket()
    client: Socket<BoardClientToServerEvents, BoardServerToClientEvents, Record<string, never>, BoardSocketData>
  ) {
    const { userId, roleName } = client.data
    if (!userId) {
      client.disconnect(true)
      return { status: 'DENIED', reason: 'NOT_PARTICIPANT' }
    }

    try {
      const result = await this.boardMeetingService.sendMessage(
        userId,
        roleName,
        readStringField(data, 'sessionId'),
        readStringField(data, 'content')
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
  broadcastVoteProgress(sessionId: string, progressData: BoardVoteProgress) {
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
