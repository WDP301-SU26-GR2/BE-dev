import { ConflictException } from '@nestjs/common'
import { ContractStatus, PaymentConditionStatus } from '@prisma/client'
import { createTransactionContext } from 'src/infrastructure/database/transaction-context'
import { ContractTransferAdapter } from './contract-transfer.adapter'

describe('ContractTransferAdapter', () => {
  const context = (client: object) => createTransactionContext(client as never)

  it('creates the replacement draft and its pending payment conditions in one transaction context', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'replacement' })
    const adapter = new ContractTransferAdapter({} as never)

    await adapter.createReplacementDraft(context({ contract: { create } }), {
      seriesId: 'series',
      mangakaId: 'new-mangaka',
      editorId: 'editor',
      boardDecisionId: 'decision',
      sourceTransferRequestId: 'request',
      contractType: 'FULL_BUYOUT',
      valuationAmount: 1_000,
      conditions: [{ type: 'MILESTONE', value: 500, description: 'On publication' }]
    } as never)

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceTransferRequestId: 'request',
        status: ContractStatus.DRAFT,
        conditions: {
          create: [
            {
              conditionType: 'MILESTONE',
              payoutAmount: 500,
              thresholdConfig: { description: 'On publication' },
              status: PaymentConditionStatus.PENDING
            }
          ]
        }
      })
    })
  })

  it('atomically terminates the original and activates the replacement', async () => {
    const workflow = { activateReplacementAndTerminateOriginal: jest.fn().mockResolvedValue(undefined) }
    const adapter = new ContractTransferAdapter(workflow as never)
    const transaction = context({})

    await expect(
      adapter.activateReplacementAndTerminateOriginal(transaction, {
        originalContractId: 'old',
        replacementContractId: 'new'
      })
    ).resolves.toBeUndefined()

    expect(workflow.activateReplacementAndTerminateOriginal).toHaveBeenCalledWith(transaction, {
      originalContractId: 'old',
      replacementContractId: 'new'
    })
  })

  it.each([
    [0, 1],
    [1, 0]
  ])('rejects partial activation when update counts are %s and %s', async (oldCount, replacementCount) => {
    const workflow = {
      activateReplacementAndTerminateOriginal: jest
        .fn()
        .mockRejectedValue(new ConflictException(`${oldCount}:${replacementCount}`))
    }
    const adapter = new ContractTransferAdapter(workflow as never)

    await expect(
      adapter.activateReplacementAndTerminateOriginal(context({}), {
        originalContractId: 'old',
        replacementContractId: 'new'
      })
    ).rejects.toBeInstanceOf(ConflictException)
  })
})
