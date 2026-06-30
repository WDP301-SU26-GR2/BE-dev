import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Logger } from '@nestjs/common'
import { createAdapter } from '@socket.io/redis-adapter'
import { RedisService } from 'src/infrastructure/redis/redis.service'
import type { Redis } from 'ioredis'

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'board'
})
export class BoardGateway implements OnGatewayInit {
  private readonly logger = new Logger(BoardGateway.name)

  @WebSocketServer()
  server!: Server

  constructor(private readonly redisService: RedisService) {}

  /**
   * Khởi tạo Redis Adapter cho Socket.IO
   * Cho phép scale horizontally với multiple server instances
   */
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

  /**
   * Đại biểu tham gia vào phòng của phiên họp cụ thể
   * Client emit: 'joinSession' với body { sessionId: string }
   */
  @SubscribeMessage('joinSession')
  async handleJoinSession(@MessageBody() data: { sessionId: string }, @ConnectedSocket() client: Socket) {
    const roomName = `session_${data.sessionId}`
    await client.join(roomName)
    this.logger.log(`[Socket] Client ${client.id} đã vào phòng: ${roomName}`)
    return { status: 'SUCCESS', message: `Đã kết nối vào phòng ${data.sessionId}` }
  }

  /**
   * Hàm phát sóng tiến độ biểu quyết toàn phòng
   * Được gọi từ tầng BoardService sau khi tính toán xong số liệu
   */
  broadcastVoteProgress(sessionId: string, progressData: any) {
    const roomName = `session_${sessionId}`
    this.server.to(roomName).emit('voteProgressUpdated', progressData)
    this.logger.log(`[Realtime] Đã phát sóng tiến độ mới cho phòng: ${roomName}`)
  }
}
