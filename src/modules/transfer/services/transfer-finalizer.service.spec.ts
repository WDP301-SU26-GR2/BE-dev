import { TransferFinalizerService } from './transfer-finalizer.service'

describe('TransferFinalizerService', () => {
  const context = {} as never
  const uow = { runInTransaction: jest.fn((work: (ctx: never) => unknown) => work(context)) }
  const requestState = { completeReplacement: jest.fn() }
  const contractPort = { activateReplacementAndTerminateOriginal: jest.fn() }
  const paymentPort = { markPendingConditionsMissed: jest.fn() }
  const seriesPort = { transferOwnership: jest.fn() }
  const effects = { publish: jest.fn(), acknowledge: jest.fn() }
  const service = new TransferFinalizerService(
    uow as never,
    requestState as never,
    contractPort as never,
    paymentPort,
    seriesPort,
    effects as never
  )

  beforeEach(() => jest.clearAllMocks())

  it('settles every authoritative write in one transaction, then acknowledges the outbox', async () => {
    requestState.completeReplacement.mockResolvedValue(true)
    await service.finalize({
      id: 'outbox-1',
      payload: {
        transferRequestId: 'request-1',
        originalContractId: 'old-contract',
        replacementContractId: 'new-contract',
        seriesId: 'series-1',
        toMangakaId: 'mangaka-b'
      }
    })

    expect(contractPort.activateReplacementAndTerminateOriginal).toHaveBeenCalledWith(context, {
      originalContractId: 'old-contract',
      replacementContractId: 'new-contract'
    })
    expect(paymentPort.markPendingConditionsMissed).toHaveBeenCalledWith(context, 'old-contract')
    expect(seriesPort.transferOwnership).toHaveBeenCalledWith(context, {
      seriesId: 'series-1',
      mangakaId: 'mangaka-b',
      coOwnerId: null,
      coOwnerApprovalRequired: false
    })
    expect(effects.publish).toHaveBeenCalledWith(
      expect.objectContaining({ transferRequestId: 'request-1', replacementContractId: 'new-contract' })
    )
    expect(effects.acknowledge).toHaveBeenCalledWith('outbox-1')
  })

  it('does not acknowledge the outbox when settlement fails', async () => {
    requestState.completeReplacement.mockResolvedValue(true)
    seriesPort.transferOwnership.mockRejectedValueOnce(new Error('injected failure'))

    await expect(
      service.finalize({
        id: 'outbox-1',
        payload: {
          transferRequestId: 'request-1',
          originalContractId: 'old-contract',
          replacementContractId: 'new-contract',
          seriesId: 'series-1',
          toMangakaId: 'mangaka-b'
        }
      })
    ).rejects.toThrow('injected failure')
    expect(effects.publish).not.toHaveBeenCalled()
    expect(effects.acknowledge).not.toHaveBeenCalled()
  })

  it('acknowledges an already-completed retry without repeating settlement', async () => {
    requestState.completeReplacement.mockResolvedValue(false)
    await service.finalize({
      id: 'outbox-1',
      payload: {
        transferRequestId: 'request-1',
        originalContractId: 'old-contract',
        replacementContractId: 'new-contract',
        seriesId: 'series-1',
        toMangakaId: 'mangaka-b'
      }
    })

    expect(contractPort.activateReplacementAndTerminateOriginal).not.toHaveBeenCalled()
    expect(effects.publish).not.toHaveBeenCalled()
    expect(effects.acknowledge).toHaveBeenCalledWith('outbox-1')
  })
})
