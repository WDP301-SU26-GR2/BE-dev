import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Logger } from '@nestjs/common'

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'board'
})
export class BoardGateway {
  private readonly logger = new Logger(BoardGateway.name)

  @WebSocketServer()
  server!: Server

  /**
   * Đại biểu tham gia vào phòng của phiên họp cụ thể
   * Client emit: 'joinSession' với body { sessionId: string }
   */
  @SubscribeMessage('joinSession')
  handleJoinSession(@MessageBody() data: { sessionId: string }, @ConnectedSocket() client: Socket) {
    const roomName = `session_${data.sessionId}`
    client.join(roomName)
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
