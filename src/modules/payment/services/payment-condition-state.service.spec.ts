import { PaymentConditionStatus } from '@prisma/client'
import { createTransactionContext } from 'src/infrastructure/database/transaction-context'
import { PaymentConditionStateService } from './payment-condition-state.service'

describe('PaymentConditionStateService', () => {
  const condition = {
    id: 'condition-1',
    contractId: 'contract-1',
    status: PaymentConditionStatus.PENDING
  }

  const setup = () => {
    const repository = {
      compareAndSetStatus: jest.fn().mockResolvedValue({ ...condition, status: PaymentConditionStatus.DISABLED }),
      markPendingMissedInTransaction: jest.fn().mockResolvedValue({ count: 2 })
    }
    const audit = { record: jest.fn().mockResolvedValue(undefined) }
    return { service: new PaymentConditionStateService(repository as never, audit as never), repository, audit }
  }

  it('disables a pending condition through CAS and audits the owning contract', async () => {
    const { service, repository, audit } = setup()

    await service.disable(condition, 'editor-1')

    expect(repository.compareAndSetStatus).toHaveBeenCalledWith(
      condition.id,
      PaymentConditionStatus.PENDING,
      PaymentConditionStatus.DISABLED
    )
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'editor-1',
        entityId: condition.contractId,
        fromState: PaymentConditionStatus.PENDING,
        toState: PaymentConditionStatus.DISABLED
      })
    )
  })

  it('rejects a lost CAS without audit', async () => {
    const { service, repository, audit } = setup()
    repository.compareAndSetStatus.mockResolvedValueOnce(null)

    await expect(service.disable(condition, 'editor-1')).rejects.toMatchObject({ status: 400 })
    expect(audit.record).not.toHaveBeenCalled()
  })

  it('returns an already disabled condition without another write or audit', async () => {
    const { service, repository, audit } = setup()
    const disabled = { ...condition, status: PaymentConditionStatus.DISABLED }

    await expect(service.disable(disabled, 'editor-1')).resolves.toBe(disabled)
    expect(repository.compareAndSetStatus).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })

  it('rejects a non-pending condition before attempting CAS', async () => {
    const { service, repository, audit } = setup()

    await expect(
      service.disable({ ...condition, status: PaymentConditionStatus.MISSED }, 'editor-1')
    ).rejects.toMatchObject({ status: 400 })
    expect(repository.compareAndSetStatus).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })

  it('owns the transaction-aware pending-to-missed bulk transition', async () => {
    const { service, repository } = setup()
    const context = createTransactionContext({} as never)

    await service.markPendingMissedInTransaction(context, condition.contractId)

    expect(repository.markPendingMissedInTransaction).toHaveBeenCalledWith(context, condition.contractId)
  })
})
