import { OutboxEventType } from '@prisma/client'
import { createTransactionContext } from './transaction-context'
import { OutboxRepo } from './outbox.repo'

const command = {
  type: OutboxEventType.TRANSFER_REPLACEMENT_READY,
  aggregateId: 'transfer-1',
  payload: { transferRequestId: 'transfer-1' }
} as const

function client() {
  return {
    outboxEvent: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn()
    }
  }
}

describe('OutboxRepo idempotency and retry contracts', () => {
  it('enqueues idempotently inside the supplied transaction boundary', async () => {
    const prisma = client()
    const tx = client()
    const repo = new OutboxRepo(prisma as never)
    tx.outboxEvent.upsert.mockResolvedValue({ id: 'event-1' })

    await repo.enqueue(createTransactionContext(tx as never), command)

    expect(tx.outboxEvent.upsert).toHaveBeenCalledWith({
      where: {
        type_aggregateId: {
          type: OutboxEventType.TRANSFER_REPLACEMENT_READY,
          aggregateId: 'transfer-1'
        }
      },
      update: {},
      create: command
    })
    expect(prisma.outboxEvent.upsert).not.toHaveBeenCalled()
  })

  it('supports an existing Prisma transaction client without manufacturing a context', async () => {
    const prisma = client()
    const tx = client()
    const repo = new OutboxRepo(prisma as never)

    await repo.enqueueWithClient(tx as never, command)

    expect(tx.outboxEvent.upsert).toHaveBeenCalledWith({
      where: {
        type_aggregateId: {
          type: OutboxEventType.TRANSFER_REPLACEMENT_READY,
          aggregateId: 'transfer-1'
        }
      },
      update: {},
      create: command
    })
  })

  it('rejects a forged or expired transaction context before any database write', () => {
    const prisma = client()
    const repo = new OutboxRepo(prisma as never)

    expect(() => repo.enqueue({} as never, command)).toThrow('Transaction context is no longer valid')
    expect(prisma.outboxEvent.upsert).not.toHaveBeenCalled()
  })

  it('defaults the ready-event batch to twenty', async () => {
    const prisma = client()
    const repo = new OutboxRepo(prisma as never)

    await repo.findPending(OutboxEventType.TRANSFER_REPLACEMENT_READY)

    expect(prisma.outboxEvent.findMany).toHaveBeenCalledWith({
      where: {
        type: OutboxEventType.TRANSFER_REPLACEMENT_READY,
        processedAt: { isSet: false },
        availableAt: { lte: expect.any(Date) }
      },
      orderBy: { createdAt: 'asc' },
      take: 20
    })
  })

  it('honors a smaller bounded ready-event batch', async () => {
    const prisma = client()
    const repo = new OutboxRepo(prisma as never)

    await repo.findPending(OutboxEventType.TRANSFER_REPLACEMENT_READY, 5)

    expect(prisma.outboxEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }))
  })

  it('marks an event processed only if another worker has not already completed it', async () => {
    const prisma = client()
    const repo = new OutboxRepo(prisma as never)

    await repo.markProcessed('event-1')

    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: 'event-1', processedAt: { isSet: false } },
      data: { processedAt: expect.any(Date), lastError: null }
    })
  })

  it('records bounded failure diagnostics and schedules a retry without leaking an unbounded payload', async () => {
    const prisma = client()
    const repo = new OutboxRepo(prisma as never)
    const failure = 'x'.repeat(1_200)
    const before = Date.now()

    await repo.markFailed('event-1', failure)

    const call = prisma.outboxEvent.update.mock.calls[0][0]
    expect(call).toMatchObject({
      where: { id: 'event-1' },
      data: {
        attempts: { increment: 1 },
        lastError: 'x'.repeat(1_000),
        availableAt: expect.any(Date)
      }
    })
    expect(call.data.availableAt.getTime()).toBeGreaterThanOrEqual(before + 5_000)
  })
})
