import { TransferContractStatus } from '@prisma/client'
import { InvalidTransferStateException } from '../errors/transfer.error'
import { TransferContractStateService } from './transfer-contract-state.service'

describe('TransferContractStateService', () => {
  const context = {} as never
  const repo = { compareAndSetContractStatus: jest.fn() }
  const service = new TransferContractStateService(repo as never)

  beforeEach(() => jest.clearAllMocks())

  it('enforces the ordered A -> B -> Board signing path with CAS', async () => {
    repo.compareAndSetContractStatus.mockResolvedValue(true)

    await service.transition(context, 'contract-1', TransferContractStatus.A_SIGNED, TransferContractStatus.B_SIGNED)

    expect(repo.compareAndSetContractStatus).toHaveBeenCalledWith(
      context,
      'contract-1',
      TransferContractStatus.A_SIGNED,
      TransferContractStatus.B_SIGNED
    )
  })

  it('does not allow skipping directly from DRAFT to FULLY_EXECUTED', async () => {
    await expect(
      service.transition(context, 'contract-1', TransferContractStatus.DRAFT, TransferContractStatus.FULLY_EXECUTED)
    ).rejects.toBe(InvalidTransferStateException)
    expect(repo.compareAndSetContractStatus).not.toHaveBeenCalled()
  })

  it('turns a lost contract status CAS into a conflict', async () => {
    repo.compareAndSetContractStatus.mockResolvedValue(false)

    await expect(
      service.transition(context, 'contract-1', TransferContractStatus.DRAFT, TransferContractStatus.A_SIGNED)
    ).rejects.toBe(InvalidTransferStateException)
  })
})
