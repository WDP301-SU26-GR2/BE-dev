import { ContractStatus } from '@prisma/client'
import { createTransactionContext } from 'src/infrastructure/database/transaction-context'
import { ContractWorkflowService } from './contract-workflow.service'

describe('ContractWorkflowService transfer settlement capability', () => {
  const setup = () => {
    const repository = { compareAndSetStatusInTransaction: jest.fn().mockResolvedValue(true) }
    const service = new ContractWorkflowService(repository as never, {} as never, {} as never)
    return { service, repository }
  }

  it('owns both contract CAS transitions in the caller transaction', async () => {
    const { service, repository } = setup()
    const context = createTransactionContext({} as never)

    await service.activateReplacementAndTerminateOriginal(context, {
      originalContractId: 'old',
      replacementContractId: 'new'
    })

    expect(repository.compareAndSetStatusInTransaction).toHaveBeenNthCalledWith(
      1,
      context,
      'old',
      ContractStatus.FULLY_EXECUTED,
      ContractStatus.TERMINATED
    )
    expect(repository.compareAndSetStatusInTransaction).toHaveBeenNthCalledWith(
      2,
      context,
      'new',
      ContractStatus.ACTIVATION_PENDING,
      ContractStatus.FULLY_EXECUTED
    )
  })

  it('throws on a lost replacement CAS so the outer transaction rolls back the original transition', async () => {
    const { service, repository } = setup()
    repository.compareAndSetStatusInTransaction.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    await expect(
      service.activateReplacementAndTerminateOriginal(createTransactionContext({} as never), {
        originalContractId: 'old',
        replacementContractId: 'new'
      })
    ).rejects.toMatchObject({ status: 409 })
  })
})
