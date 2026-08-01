import { ConflictException } from '@nestjs/common'
import { ConditionType, ContractStatus, PaymentConditionStatus } from '@prisma/client'
import { createTransactionContext } from 'src/infrastructure/database/transaction-context'
import { ContractTransferAdapter } from './contract-transfer.adapter'

describe('ContractTransferAdapter', () => {
  const context = (client: object) => createTransactionContext(client as never)

  it('creates the replacement draft and its pending payment conditions in one transaction context', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'replacement',
      valuationAmount: 1_000,
      publisherOwnershipPct: 100,
      mangakaOwnershipPct: 0,
      terminationClause: null
    })
    const createVersion = jest.fn().mockResolvedValue({ id: 'version-1' })
    const adapter = new ContractTransferAdapter({} as never)

    await adapter.createReplacementDraft(
      context({ contract: { create }, contractVersion: { create: createVersion } }),
      {
        seriesId: 'series',
        mangakaId: 'new-mangaka',
        editorId: 'editor',
        editedById: 'board-member',
        boardDecisionId: 'decision',
        sourceTransferRequestId: 'request',
        contractType: 'FULL_BUYOUT',
        valuationAmount: 1_000,
        publisherOwnershipPct: 100,
        mangakaOwnershipPct: 0,
        conditions: [{ type: ConditionType.CHAPTER_MILESTONE, value: 500, description: 'On publication' }]
      } as never
    )

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceTransferRequestId: 'request',
        status: ContractStatus.DRAFT,
        publisherOwnershipPct: 100,
        mangakaOwnershipPct: 0,
        conditions: {
          create: [
            {
              conditionType: ConditionType.CHAPTER_MILESTONE,
              payoutAmount: 500,
              thresholdConfig: { description: 'On publication' },
              status: PaymentConditionStatus.PENDING
            }
          ]
        }
      })
    })
    expect(createVersion).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contractId: 'replacement',
        versionNumber: 1,
        valuationAmount: 1_000,
        editedById: 'board-member'
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
