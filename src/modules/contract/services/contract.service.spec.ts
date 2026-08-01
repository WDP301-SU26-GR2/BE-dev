import { ContractStatus } from '@prisma/client'
import { DomainEvent } from 'src/core/events/domain-events'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ContractRepresentativeService } from './contract-representative.service'
import { ContractSigningService } from './contract-signing.service'
import { ContractWorkflowService } from './contract-workflow.service'

const CID = '507f1f77bcf86cd799439011'
const EDITOR = '507f1f77bcf86cd799439012'
const MANGAKA = '507f1f77bcf86cd799439013'
const BOARD_1 = '507f1f77bcf86cd799439014'
const BOARD_2 = '507f1f77bcf86cd799439015'

const makeContract = (patch: Record<string, unknown> = {}) => ({
  id: CID,
  seriesId: '507f1f77bcf86cd799439016',
  editorId: EDITOR,
  mangakaId: MANGAKA,
  status: ContractStatus.BOARD_REVIEW,
  representativeId: BOARD_1,
  representativeSignedAt: null,
  mangakaSignedAt: null,
  sourceTransferRequestId: null,
  ...patch
})

describe('ContractWorkflowService two-phase submit-review', () => {
  it('moves an editor-owned draft to BOARD_REVIEW, starts grace timer, notifies roster, and audits', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue(makeContract({ status: ContractStatus.DRAFT, representativeId: null })),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      setBoardReviewStarted: jest.fn().mockResolvedValue(makeContract({ status: ContractStatus.BOARD_REVIEW })),
      findRosterForContract: jest.fn().mockResolvedValue([BOARD_1, BOARD_2])
    }
    const notify = { notifySafe: jest.fn().mockResolvedValue(undefined) }
    const audit = { record: jest.fn().mockResolvedValue(undefined) }
    const service = new ContractWorkflowService(repo as never, notify as never, audit as never)

    await expect(service.submitForReview(CID, EDITOR)).resolves.toMatchObject({ status: ContractStatus.BOARD_REVIEW })

    expect(repo.updateStatus).toHaveBeenCalledWith(CID, ContractStatus.BOARD_REVIEW)
    expect(repo.setBoardReviewStarted).toHaveBeenCalledWith(CID)
    expect(notify.notifySafe).toHaveBeenCalledTimes(2)
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: EDITOR,
        fromState: ContractStatus.DRAFT,
        toState: ContractStatus.BOARD_REVIEW
      })
    )
  })

  it('rejects submit-review when the caller is not the owning editor', async () => {
    const repo = { findById: jest.fn().mockResolvedValue(makeContract({ status: ContractStatus.DRAFT })) }
    const service = new ContractWorkflowService(repo as never, {} as never, {} as never)

    await expect(service.submitForReview(CID, BOARD_1)).rejects.toMatchObject({ status: 403 })
  })
})

describe('ContractRepresentativeService claim/comment flow', () => {
  function setup(contract = makeContract({ representativeId: null })) {
    const repo = {
      findById: jest.fn().mockResolvedValue(contract),
      findRosterForContract: jest.fn().mockResolvedValue([BOARD_1, BOARD_2]),
      claimRepresentative: jest.fn().mockResolvedValue(makeContract({ representativeId: BOARD_1 })),
      releaseRepresentative: jest.fn().mockResolvedValue(true),
      assignRepresentative: jest.fn().mockResolvedValue(makeContract({ representativeId: BOARD_2 })),
      createComment: jest.fn().mockResolvedValue({ id: 'comment-1', contractId: CID, authorId: BOARD_1 }),
      findCommentsByContract: jest.fn().mockResolvedValue([{ id: 'comment-1' }])
    }
    const notify = { notifySafe: jest.fn().mockResolvedValue(undefined) }
    const audit = { record: jest.fn().mockResolvedValue(undefined) }
    const service = new ContractRepresentativeService(repo as never, notify as never, audit as never)
    return { service, repo, notify, audit }
  }

  it('allows only roster members to claim the representative slot atomically', async () => {
    const { service, repo } = setup()

    await expect(service.claim(CID, BOARD_1)).resolves.toMatchObject({ representativeId: BOARD_1 })
    expect(repo.claimRepresentative).toHaveBeenCalledWith(CID, BOARD_1)

    await expect(service.claim(CID, '507f1f77bcf86cd799439099')).rejects.toMatchObject({ status: 403 })
  })

  it('releases only the current unsigned representative', async () => {
    const { service, repo } = setup(makeContract({ representativeId: BOARD_1 }))

    await expect(service.release(CID, BOARD_1)).resolves.toMatchObject({ message: expect.any(String) })
    expect(repo.releaseRepresentative).toHaveBeenCalledWith(CID, BOARD_1)
  })

  it('lets a super admin assign only a roster member and notifies the assignee', async () => {
    const { service, repo, notify } = setup()

    await expect(service.assign(CID, EDITOR, BOARD_2)).resolves.toMatchObject({ representativeId: BOARD_2 })
    expect(repo.assignRepresentative).toHaveBeenCalledWith(CID, BOARD_2)
    expect(notify.notifySafe).toHaveBeenCalledWith(expect.objectContaining({ recipientId: BOARD_2 }))

    await expect(service.assign(CID, EDITOR, '507f1f77bcf86cd799439099')).rejects.toMatchObject({ status: 422 })
  })

  it('allows roster comments and scoped comment listing', async () => {
    const { service, repo } = setup(makeContract({ representativeId: BOARD_1 }))

    await expect(service.addComment(CID, BOARD_2, 'Giảm mốc chapter')).resolves.toMatchObject({ id: 'comment-1' })
    expect(repo.createComment).toHaveBeenCalledWith(CID, BOARD_2, 'Giảm mốc chapter')
    await expect(service.listComments(CID, EDITOR, RoleName.EDITOR)).resolves.toEqual({ data: [{ id: 'comment-1' }] })
  })
})

describe('ContractSigningService representative and Mangaka phase', () => {
  function setup(contract = makeContract()) {
    const repo = {
      findById: jest.fn().mockResolvedValue(contract),
      recordRepresentativeSignatureAndSettle: jest
        .fn()
        .mockResolvedValue({ signed: true, contract: makeContract({ status: ContractStatus.AWAITING_MANGAKA }) }),
      recordMangakaAcceptAndSettle: jest.fn().mockResolvedValue({
        signed: true,
        executedNow: true,
        contract: makeContract({ status: ContractStatus.FULLY_EXECUTED })
      }),
      updateStatus: jest.fn().mockResolvedValue(makeContract({ status: ContractStatus.REJECTED_BY_MANGAKA }))
    }
    const otp = { validateOtpCode: jest.fn().mockResolvedValue(undefined) }
    const notify = { notifySafe: jest.fn().mockResolvedValue(undefined) }
    const events = { emit: jest.fn() }
    const audit = { record: jest.fn().mockResolvedValue(undefined) }
    const service = new ContractSigningService(
      repo as never,
      otp as never,
      notify as never,
      events as never,
      audit as never
    )
    return { service, repo, otp, notify, events, audit }
  }

  it('representative OTP-sign moves BOARD_REVIEW to AWAITING_MANGAKA', async () => {
    const { service, repo, otp, notify } = setup()

    await expect(service.signByRepresentativeWithOtp(CID, BOARD_1, 'b@example.test', '123456')).resolves.toMatchObject({
      status: ContractStatus.AWAITING_MANGAKA
    })

    expect(otp.validateOtpCode).toHaveBeenCalledWith({
      email: 'b@example.test',
      code: '123456',
      purpose: 'SIGNING_CONTRACT'
    })
    expect(repo.recordRepresentativeSignatureAndSettle).toHaveBeenCalledWith(CID, BOARD_1)
    expect(notify.notifySafe).toHaveBeenCalledWith(expect.objectContaining({ recipientId: MANGAKA }))
  })

  it('Mangaka accept executes an ordinary contract and emits ContractExecuted', async () => {
    const { service, repo, events } = setup(makeContract({ status: ContractStatus.AWAITING_MANGAKA }))

    await expect(service.signByMangakaWithOtp(CID, MANGAKA, 'm@example.test', '123456')).resolves.toMatchObject({
      status: ContractStatus.FULLY_EXECUTED
    })

    expect(repo.recordMangakaAcceptAndSettle).toHaveBeenCalledWith(CID, ContractStatus.FULLY_EXECUTED)
    expect(events.emit).toHaveBeenCalledWith(DomainEvent.ContractExecuted, expect.objectContaining({ contractId: CID }))
  })

  it('Mangaka accept parks a transfer replacement in ACTIVATION_PENDING without ContractExecuted', async () => {
    const { service, repo, events } = setup(
      makeContract({
        status: ContractStatus.AWAITING_MANGAKA,
        sourceTransferRequestId: '507f1f77bcf86cd799439017'
      })
    )
    repo.recordMangakaAcceptAndSettle.mockResolvedValue({
      signed: true,
      executedNow: false,
      contract: makeContract({ status: ContractStatus.ACTIVATION_PENDING })
    })

    await service.signByMangakaWithOtp(CID, MANGAKA, 'm@example.test', '123456')

    expect(repo.recordMangakaAcceptAndSettle).toHaveBeenCalledWith(CID, ContractStatus.ACTIVATION_PENDING)
    expect(events.emit).not.toHaveBeenCalled()
  })

  it('Mangaka reject records a reason and returns REJECTED_BY_MANGAKA', async () => {
    const { service, repo } = setup(makeContract({ status: ContractStatus.AWAITING_MANGAKA }))

    await expect(service.rejectByMangaka(CID, MANGAKA, 'Giá thấp')).resolves.toMatchObject({
      status: ContractStatus.REJECTED_BY_MANGAKA
    })
    expect(repo.updateStatus).toHaveBeenCalledWith(
      CID,
      ContractStatus.REJECTED_BY_MANGAKA,
      expect.objectContaining({ rejectionReason: 'Giá thấp', mangakaRejectedAt: expect.any(Date) })
    )
  })

  it('status progress exposes the single representative block instead of boardProgress', async () => {
    const signedAt = new Date('2026-08-01T00:00:00.000Z')
    const { service } = setup(makeContract({ representativeSignedAt: signedAt }))

    await expect(service.checkContractStatus(CID, EDITOR, RoleName.EDITOR)).resolves.toEqual({
      id: CID,
      status: ContractStatus.BOARD_REVIEW,
      mangaka: { id: MANGAKA, isSigned: false, signedAt: null },
      representative: { id: BOARD_1, claimed: true, signed: true, signedAt }
    })
  })
})
