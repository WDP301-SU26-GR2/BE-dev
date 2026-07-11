import { TransferService } from './transfer.service'
import { InvalidTransferStateException, ValuationRequiredException } from '../errors/transfer.error'
import { TRANSFER_REQUEST_STATUS } from '../transfer.constant'
import { AuditEntityType } from '@prisma/client'

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    findTransferRequestById: jest.fn(),
    terminateOldContract: jest.fn().mockResolvedValue({}),
    createNewContractFromTransfer: jest.fn().mockResolvedValue({ id: 'newK' }),
    updateSeriesOwnership: jest.fn().mockResolvedValue({}),
    updateTransferRequest: jest.fn().mockResolvedValue({}),
    createTransferContract: jest.fn().mockResolvedValue({ id: 'tc1' }),
    ...overrides
  }
}

function makeAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) }
}

function make(repo: any, audit: any = makeAudit()) {
  return new TransferService(repo as never, { validateOtpCode: jest.fn(), burnOtp: jest.fn() } as never, audit as never)
}

describe('TransferService — Part 2 hardening', () => {
  describe('boardAssignFullBuyout (B-TRF-02)', () => {
    it('uses Board-provided valuationAmount + conditions (not a hardcoded value)', async () => {
      const repo = makeRepo()
      repo.findTransferRequestById.mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        status: 'UNDER_REVIEW',
        originalContractType: 'FULL_BUYOUT',
        originalContractId: 'k0',
        seriesId: 's1',
        requestingMangakaId: 'B'
      })

      await make(repo).boardAssignFullBuyout('507f1f77bcf86cd799439011', {
        boardSessionId: 'bs1',
        valuationAmount: 5000,
        conditions: [{ description: 'B adds 5 chapters', type: 'RECURRING_CHAPTER', value: 5 }]
      })

      const arg = repo.createNewContractFromTransfer.mock.calls[0][0]
      expect(arg.valuationAmount).toBe(5000)
      expect(arg.conditions).toEqual([{ description: 'B adds 5 chapters', type: 'RECURRING_CHAPTER', value: 5 }])
    })

    it('rejects when valuationAmount <= 0 (ValuationRequired)', async () => {
      const repo = makeRepo()
      repo.findTransferRequestById.mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        status: 'UNDER_REVIEW',
        originalContractType: 'FULL_BUYOUT',
        originalContractId: 'k0',
        seriesId: 's1',
        requestingMangakaId: 'B'
      })

      await expect(
        make(repo).boardAssignFullBuyout('507f1f77bcf86cd799439011', {
          boardSessionId: 'bs1',
          valuationAmount: 0,
          conditions: [{ description: 'x', type: 'TIME_BOUND', value: 1 }]
        })
      ).rejects.toBe(ValuationRequiredException)
      expect(repo.createNewContractFromTransfer).not.toHaveBeenCalled()
    })
  })

  describe('createTransferContract (B-TRF-03)', () => {
    it('rejects when the request is not UNDER_REVIEW (e.g. still NEGOTIATING)', async () => {
      const repo = makeRepo()
      repo.findTransferRequestById.mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        status: 'NEGOTIATING',
        seriesId: 's1'
      })

      await expect(
        make(repo).createTransferContract({ transferRequestId: '507f1f77bcf86cd799439011' } as never)
      ).rejects.toBe(InvalidTransferStateException)
      expect(repo.createTransferContract).not.toHaveBeenCalled()
    })

    it('allows creating a transfer contract when request is UNDER_REVIEW', async () => {
      const repo = makeRepo()
      repo.findTransferRequestById.mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        status: 'UNDER_REVIEW',
        seriesId: 's1',
        originalMangakaId: 'A',
        requestingMangakaId: 'B'
      })

      await make(repo).createTransferContract({
        transferRequestId: '507f1f77bcf86cd799439011',
        transferType: 'PARTIAL_TRANSFER',
        transferAmount: 100,
        newOwnershipSplit: {},
        coOwnerApprovalRequired: true
      } as never)

      expect(repo.createTransferContract).toHaveBeenCalled()
    })
  })
})

describe('TransferService — AuditService wiring (Spec 11 / Task 13)', () => {
  const REQ_ID = '507f1f77bcf86cd799439011'

  it('startNegotiation records TRANSITION with fromState=current status, toState=NEGOTIATING, actorId=null', async () => {
    const repo = makeRepo()
    repo.findTransferRequestById.mockResolvedValue({
      id: REQ_ID,
      status: 'UNDER_REVIEW',
      originalContractType: 'REVENUE_SHARE'
    })
    const audit = makeAudit()
    await make(repo, audit).startNegotiation(REQ_ID)

    expect(repo.updateTransferRequest).toHaveBeenCalledWith(REQ_ID, { status: TRANSFER_REQUEST_STATUS.NEGOTIATING })
    expect(audit.record).toHaveBeenCalledWith({
      actorId: null,
      entityType: AuditEntityType.TRANSFER_REQUEST,
      entityId: REQ_ID,
      action: 'TRANSITION',
      fromState: 'UNDER_REVIEW',
      toState: TRANSFER_REQUEST_STATUS.NEGOTIATING
    })
  })
})
