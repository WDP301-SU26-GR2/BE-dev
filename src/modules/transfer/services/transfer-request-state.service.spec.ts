import { TransferRequestStatus } from '@prisma/client'
import { InvalidTransferStateException } from '../errors/transfer.error'
import { TransferRequestStateService } from './transfer-request-state.service'

describe('TransferRequestStateService', () => {
  const context = {} as never
  const repo = {
    compareAndSetRequestStatus: jest.fn(),
    findRequestInTransaction: jest.fn().mockResolvedValue({ id: 'request-1' })
  }
  const service = new TransferRequestStateService(repo as never)

  beforeEach(() => jest.clearAllMocks())

  it('uses CAS for an allowed transition', async () => {
    repo.compareAndSetRequestStatus.mockResolvedValue(true)

    await service.transition(
      context,
      'request-1',
      TransferRequestStatus.UNDER_REVIEW,
      TransferRequestStatus.AWAITING_REPLACEMENT_SIGNATURES
    )

    expect(repo.compareAndSetRequestStatus).toHaveBeenCalledWith(
      context,
      'request-1',
      TransferRequestStatus.UNDER_REVIEW,
      TransferRequestStatus.AWAITING_REPLACEMENT_SIGNATURES
    )
    expect(repo.findRequestInTransaction).toHaveBeenCalledWith(context, 'request-1')
  })

  it('rejects an invalid lifecycle edge before writing', async () => {
    await expect(
      service.transition(context, 'request-1', TransferRequestStatus.COMPLETED, TransferRequestStatus.NEGOTIATING)
    ).rejects.toBe(InvalidTransferStateException)
    expect(repo.compareAndSetRequestStatus).not.toHaveBeenCalled()
  })

  it('turns a lost CAS race into a conflict', async () => {
    repo.compareAndSetRequestStatus.mockResolvedValue(false)
    await expect(
      service.transition(
        context,
        'request-1',
        TransferRequestStatus.UNDER_REVIEW,
        TransferRequestStatus.AWAITING_TRANSFER_SIGNATURES
      )
    ).rejects.toBe(InvalidTransferStateException)
    expect(repo.findRequestInTransaction).not.toHaveBeenCalled()
  })

  it('persists the authoritative decision id in the same CAS write', async () => {
    repo.compareAndSetRequestStatus.mockResolvedValue(true)

    await service.transition(
      context,
      'request-1',
      TransferRequestStatus.SUBMITTED,
      TransferRequestStatus.UNDER_REVIEW,
      { boardDecisionId: 'decision-1' }
    )

    expect(repo.compareAndSetRequestStatus).toHaveBeenCalledWith(
      context,
      'request-1',
      TransferRequestStatus.SUBMITTED,
      TransferRequestStatus.UNDER_REVIEW,
      { boardDecisionId: 'decision-1' }
    )
  })

  it('wins replacement completion using the authoritative CAS edge', async () => {
    repo.compareAndSetRequestStatus.mockResolvedValue(true)

    await expect(service.completeReplacement(context, 'request-1')).resolves.toBe(true)

    expect(repo.compareAndSetRequestStatus).toHaveBeenCalledWith(
      context,
      'request-1',
      TransferRequestStatus.AWAITING_REPLACEMENT_SIGNATURES,
      TransferRequestStatus.COMPLETED
    )
  })

  it('treats an already-completed replacement as an idempotent retry', async () => {
    repo.compareAndSetRequestStatus.mockResolvedValue(false)
    ;(repo as typeof repo & { findRequestStatus: jest.Mock }).findRequestStatus = jest
      .fn()
      .mockResolvedValue(TransferRequestStatus.COMPLETED)

    await expect(service.completeReplacement(context, 'request-1')).resolves.toBe(false)
  })

  it('rejects a lost completion CAS when the request is not already complete', async () => {
    repo.compareAndSetRequestStatus.mockResolvedValue(false)
    ;(repo as typeof repo & { findRequestStatus: jest.Mock }).findRequestStatus = jest
      .fn()
      .mockResolvedValue(TransferRequestStatus.UNDER_REVIEW)

    await expect(service.completeReplacement(context, 'request-1')).rejects.toBe(InvalidTransferStateException)
  })
})
