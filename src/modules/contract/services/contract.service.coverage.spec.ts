import { ContractStatus, ContractType } from '@prisma/client'
import { ContractDraftService } from './contract-draft.service'

const CID = '507f1f77bcf86cd799439021'
const EDITOR = '507f1f77bcf86cd799439022'
const MANGAKA = '507f1f77bcf86cd799439023'

const baseContract = {
  id: CID,
  seriesId: '507f1f77bcf86cd799439024',
  mangakaId: MANGAKA,
  editorId: EDITOR,
  status: ContractStatus.BOARD_REVIEW,
  contractType: ContractType.REVENUE_SHARE,
  valuationAmount: 1_000,
  publisherOwnershipPct: 70,
  mangakaOwnershipPct: 30,
  terminationClause: 'breach',
  contractStart: new Date('2026-01-01T00:00:00.000Z'),
  contractEnd: new Date('2027-01-01T00:00:00.000Z')
}

function setup(contract: Record<string, unknown> = baseContract) {
  const repo = {
    findById: jest.fn().mockResolvedValue(contract),
    updateAndLogVersion: jest.fn().mockResolvedValue({ ...contract, terminationClause: 'updated' }),
    redraftClone: jest.fn().mockResolvedValue({
      ...contract,
      id: '507f1f77bcf86cd799439099',
      status: ContractStatus.DRAFT,
      supersedesContractId: CID
    }),
    findSeriesForContractCreation: jest.fn(),
    findBoardDecisionForContractCreation: jest.fn(),
    findBlockingContractForCreation: jest.fn(),
    createDraft: jest.fn()
  }
  const notification = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const payment = { assertExistingConditionsWithinNewCap: jest.fn().mockResolvedValue(undefined) }
  const service = new ContractDraftService(repo as never, notification as never, payment as never)
  return { service, repo, notification, payment }
}

describe('ContractDraftService update invariants for two-phase money validation', () => {
  it('updates an owned BOARD_REVIEW contract without forcing negotiation or resetting signatures', async () => {
    const { service, repo, payment } = setup()

    await expect(
      service.editorUpdateContract(CID, EDITOR, { terminationClause: 'updated' }, 'rep comment addressed')
    ).resolves.toMatchObject({ terminationClause: 'updated' })

    expect(repo.updateAndLogVersion).toHaveBeenCalledWith(
      CID,
      { terminationClause: 'updated' },
      EDITOR,
      'rep comment addressed'
    )
    expect(payment.assertExistingConditionsWithinNewCap).not.toHaveBeenCalled()
  })

  it('re-checks existing payment conditions when valuation or ownership cap changes', async () => {
    const { service, payment } = setup()

    await service.editorUpdateContract(CID, EDITOR, { publisherOwnershipPct: 60, mangakaOwnershipPct: 40 }, 'rebalance')

    expect(payment.assertExistingConditionsWithinNewCap).toHaveBeenCalledWith(CID, {
      contractType: ContractType.REVENUE_SHARE,
      valuationAmount: 1_000,
      publisherOwnershipPct: 60
    })
  })

  it('rejects an update that makes REVENUE_SHARE ownership invalid after merge', async () => {
    const { service, repo } = setup()

    await expect(service.editorUpdateContract(CID, EDITOR, { mangakaOwnershipPct: 0 })).rejects.toMatchObject({
      status: 422
    })
    expect(repo.updateAndLogVersion).not.toHaveBeenCalled()
  })

  it('rejects updates once the contract is waiting for Mangaka', async () => {
    const { service } = setup({ ...baseContract, status: ContractStatus.AWAITING_MANGAKA })

    await expect(service.editorUpdateContract(CID, EDITOR, { terminationClause: 'too late' })).rejects.toMatchObject({
      status: 409
    })
  })

  it('redrafts only a Mangaka-rejected contract and links the replacement', async () => {
    const { service, repo } = setup({ ...baseContract, status: ContractStatus.REJECTED_BY_MANGAKA })

    await expect(service.redraft(CID, EDITOR)).resolves.toMatchObject({
      status: ContractStatus.DRAFT,
      supersedesContractId: CID
    })
    expect(repo.redraftClone).toHaveBeenCalledWith(CID, EDITOR)
  })
})
