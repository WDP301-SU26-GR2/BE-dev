import { DomainEvent } from 'src/core/events/domain-events'
import { TransferSettlementEffectsService } from './transfer-settlement-effects.service'

describe('TransferSettlementEffectsService', () => {
  const audit = { record: jest.fn() }
  const notifications = { notifySafe: jest.fn() }
  const events = { emit: jest.fn() }
  const outbox = { markProcessed: jest.fn() }
  const service = new TransferSettlementEffectsService(
    audit as never,
    notifications as never,
    events as never,
    outbox as never
  )
  const payload = {
    transferRequestId: 'request-1',
    originalContractId: 'old-contract',
    replacementContractId: 'new-contract',
    seriesId: 'series-1',
    toMangakaId: 'mangaka-b'
  }

  beforeEach(() => jest.clearAllMocks())

  it('publishes settlement effects only after the finalizer transaction returns', async () => {
    await service.publish(payload)

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'request-1', action: 'SETTLEMENT_COMPLETED' })
    )
    expect(notifications.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'mangaka-b', referenceId: 'request-1' })
    )
    expect(events.emit).toHaveBeenCalledWith(DomainEvent.ContractExecuted, {
      contractId: 'new-contract',
      seriesId: 'series-1'
    })
  })

  it('acknowledges the durable outbox event separately', async () => {
    await service.acknowledge('outbox-1')

    expect(outbox.markProcessed).toHaveBeenCalledWith('outbox-1')
  })
})
