import { ConditionType, ContractStatus, ContractType } from '@prisma/client'
import { PaymentConditionService } from './payment-condition.service'

describe('PaymentConditionService contract version invariant', () => {
  const dto = {
    conditionType: ConditionType.CHAPTER_MILESTONE,
    thresholdConfig: { chapter: 10 },
    payoutAmount: 1_000,
    isRecurring: false
  }

  function setup(status: ContractStatus) {
    const repo = {
      findContractById: jest.fn().mockResolvedValue({
        id: 'contract-1',
        editorId: 'editor-1',
        mangakaId: 'mangaka-1',
        status,
        contractType: ContractType.REVENUE_SHARE,
        valuationAmount: 10_000,
        publisherOwnershipPct: 70
      }),
      create: jest.fn().mockResolvedValue({ id: 'condition-1' }),
      findActiveConditionsByContract: jest.fn().mockResolvedValue([])
    }
    const service = new PaymentConditionService(repo as never, {} as never)
    return { service, repo }
  }

  it.each([ContractStatus.DRAFT, ContractStatus.BOARD_REVIEW])(
    'allows condition changes while the contract is %s',
    async (status) => {
      const { service, repo } = setup(status)
      await expect(service.createPaymentCondition('contract-1', 'editor-1', dto)).resolves.toMatchObject({
        id: 'condition-1'
      })
      expect(repo.create).toHaveBeenCalled()
    }
  )

  it.each([ContractStatus.AWAITING_MANGAKA, ContractStatus.ACTIVATION_PENDING, ContractStatus.FULLY_EXECUTED])(
    'locks condition changes while the contract is %s',
    async (status) => {
      const { service, repo } = setup(status)
      await expect(service.createPaymentCondition('contract-1', 'editor-1', dto)).rejects.toMatchObject({
        status: 409,
        response: {
          message: [{ message: 'Error.PaymentConditionContractLocked', path: 'contractId' }]
        }
      })
      expect(repo.create).not.toHaveBeenCalled()
    }
  )
})
