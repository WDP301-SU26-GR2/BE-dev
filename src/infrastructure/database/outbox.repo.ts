import { Injectable } from '@nestjs/common'
import { OutboxEventType, Prisma } from '@prisma/client'
import { PrismaService } from './prisma.service'
import { TransactionContext, transactionClient } from './transaction-context'

@Injectable()
export class OutboxRepo {
  constructor(private readonly prisma: PrismaService) {}

  enqueue(
    context: TransactionContext,
    command: { type: OutboxEventType; aggregateId: string; payload: Prisma.InputJsonValue }
  ) {
    return transactionClient(context).outboxEvent.upsert({
      where: { type_aggregateId: { type: command.type, aggregateId: command.aggregateId } },
      update: {},
      create: command
    })
  }

  enqueueWithClient(
    client: Prisma.TransactionClient,
    command: { type: OutboxEventType; aggregateId: string; payload: Prisma.InputJsonValue }
  ) {
    return client.outboxEvent.upsert({
      where: { type_aggregateId: { type: command.type, aggregateId: command.aggregateId } },
      update: {},
      create: command
    })
  }

  // §v2 point 9: maxAttempts (tuỳ chọn) loại bỏ event đã vượt trần thử (dead-letter) khỏi vòng retry.
  findPending(type: OutboxEventType, take = 20, maxAttempts?: number) {
    return this.prisma.outboxEvent.findMany({
      where: {
        type,
        processedAt: { isSet: false },
        availableAt: { lte: new Date() },
        ...(maxAttempts != null ? { attempts: { lt: maxAttempts } } : {})
      },
      orderBy: { createdAt: 'asc' },
      take
    })
  }

  markProcessed(id: string) {
    return this.prisma.outboxEvent.updateMany({
      where: { id, processedAt: { isSet: false } },
      data: { processedAt: new Date(), lastError: null }
    })
  }

  markFailed(id: string, error: string) {
    return this.prisma.outboxEvent.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
        lastError: error.slice(0, 1000),
        availableAt: new Date(Date.now() + 5000)
      }
    })
  }
}
