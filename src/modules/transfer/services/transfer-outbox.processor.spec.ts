import { OutboxEventType } from '@prisma/client'
import { TransferOutboxProcessor } from './transfer-outbox.processor'

describe('TransferOutboxProcessor', () => {
  const event = (id: string) => ({ id, payload: { transferRequestId: `request-${id}` } })
  const outbox = {
    findPending: jest.fn(),
    markFailed: jest.fn()
  }
  const finalizer = {
    finalize: jest.fn()
  }
  let processor: TransferOutboxProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    processor = new TransferOutboxProcessor(outbox as never, finalizer as never)
  })

  it('loads only replacement-ready events and finalizes every pending event', async () => {
    const pending = [event('one'), event('two')]
    outbox.findPending.mockResolvedValue(pending)
    finalizer.finalize.mockResolvedValue(undefined)

    await processor.process()

    expect(outbox.findPending).toHaveBeenCalledWith(OutboxEventType.TRANSFER_REPLACEMENT_READY)
    expect(finalizer.finalize).toHaveBeenNthCalledWith(1, pending[0])
    expect(finalizer.finalize).toHaveBeenNthCalledWith(2, pending[1])
    expect(outbox.markFailed).not.toHaveBeenCalled()
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
