import { OutboxEventType } from '@prisma/client'
import { MAX_TRANSFER_SETTLEMENT_ATTEMPTS } from '../transfer.constant'
import { TransferOutboxProcessor } from './transfer-outbox.processor'

describe('TransferOutboxProcessor', () => {
  const event = (id: string, attempts = 0) => ({ id, attempts, payload: { transferRequestId: `request-${id}` } })
  const outbox = {
    findPending: jest.fn(),
    markFailed: jest.fn()
  }
  const finalizer = {
    finalize: jest.fn()
  }
  const audit = { record: jest.fn().mockResolvedValue(undefined) }
  let processor: TransferOutboxProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    processor = new TransferOutboxProcessor(outbox as never, finalizer as never, audit as never)
  })

  it('loads only replacement-ready events under the attempt cap and finalizes every pending event', async () => {
    const pending = [event('one'), event('two')]
    outbox.findPending.mockResolvedValue(pending)
    finalizer.finalize.mockResolvedValue(undefined)

    await processor.process()

    // §v2 point 9: bỏ qua event đã vượt trần thử (dead-letter) — findPending nhận maxAttempts.
    expect(outbox.findPending).toHaveBeenCalledWith(
      OutboxEventType.TRANSFER_REPLACEMENT_READY,
      20,
      MAX_TRANSFER_SETTLEMENT_ATTEMPTS
    )
    expect(finalizer.finalize).toHaveBeenNthCalledWith(1, pending[0])
    expect(finalizer.finalize).toHaveBeenNthCalledWith(2, pending[1])
    expect(outbox.markFailed).not.toHaveBeenCalled()
  })

  it('dead-letters (audit) an event whose failure reaches the attempt cap', async () => {
    outbox.findPending.mockResolvedValue([event('poison', MAX_TRANSFER_SETTLEMENT_ATTEMPTS - 1)])
    finalizer.finalize.mockRejectedValueOnce(new Error('still failing'))

    await processor.process()

    expect(outbox.markFailed).toHaveBeenCalledWith('poison', 'still failing')
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SETTLEMENT_DEAD_LETTER', entityId: 'request-poison' })
    )
  })

  it('does not dead-letter a failure still under the attempt cap', async () => {
    outbox.findPending.mockResolvedValue([event('retryable', 0)])
    finalizer.finalize.mockRejectedValueOnce(new Error('transient'))

    await processor.process()

    expect(outbox.markFailed).toHaveBeenCalledWith('retryable', 'transient')
    expect(audit.record).not.toHaveBeenCalled()
  })

  it('records a failed event and continues with the next event', async () => {
    const pending = [event('failed'), event('next')]
    outbox.findPending.mockResolvedValue(pending)
    finalizer.finalize.mockRejectedValueOnce(new Error('injected settlement failure')).mockResolvedValueOnce(undefined)

    await processor.process()

    expect(outbox.markFailed).toHaveBeenCalledWith('failed', 'injected settlement failure')
    expect(finalizer.finalize).toHaveBeenCalledTimes(2)
    expect(finalizer.finalize).toHaveBeenLastCalledWith(pending[1])
  })

  it('normalizes a non-Error rejection before recording the failure', async () => {
    outbox.findPending.mockResolvedValue([event('failed')])
    finalizer.finalize.mockRejectedValueOnce('database unavailable')

    await processor.process()

    expect(outbox.markFailed).toHaveBeenCalledWith('failed', 'database unavailable')
  })

  it('does not overlap polling while an earlier invocation is still running', async () => {
    let resolvePending: ((events: ReturnType<typeof event>[]) => void) | undefined
    outbox.findPending.mockImplementation(
      () =>
        new Promise<ReturnType<typeof event>[]>((resolve) => {
          resolvePending = resolve
        })
    )

    const first = processor.process()
    await Promise.resolve()
    await processor.process()

    expect(outbox.findPending).toHaveBeenCalledTimes(1)
    resolvePending?.([])
    await first

    outbox.findPending.mockResolvedValueOnce([])
    await processor.process()
    expect(outbox.findPending).toHaveBeenCalledTimes(2)
  })

  it('releases the polling guard when loading pending events fails', async () => {
    outbox.findPending.mockRejectedValueOnce(new Error('outbox unavailable')).mockResolvedValueOnce([])

    await expect(processor.process()).rejects.toThrow('outbox unavailable')
    await expect(processor.process()).resolves.toBeUndefined()

    expect(outbox.findPending).toHaveBeenCalledTimes(2)
  })
})
