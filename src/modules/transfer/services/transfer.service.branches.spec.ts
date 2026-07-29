import { RoleName } from 'src/core/security/constants/role.constant'
import {
  InvalidStatusForScreeningException,
  InvalidTransferBoardDecisionException,
  InvalidTransferProposalException,
  InvalidTransferStateException,
  NoActiveContractFoundException,
  OnlyAppliesToRevenueShareException,
  RequestNotInNegotiatingStageException,
  RequesterAlreadyOwnsSeriesException,
  RequestingMangakaInactiveException,
  TransferAccessDeniedException,
  TransferContractNotFoundException,
  TransferRequestNotFoundException,
  UserOrEmailNotFoundException
} from '../errors/transfer.error'
import { TransferAccessPolicy } from './transfer-access.policy'
import { TransferContractService } from './transfer-contract.service'
import { TransferNegotiationService } from './transfer-negotiation.service'
import { TransferRequestService } from './transfer-request.service'
import { TransferResourceLoader } from './transfer-resource-loader.service'
import { TransferContractQueryService } from './transfer-contract-query.service'
import { TransferSigningService } from './transfer-signing.service'
import { TransferTransactionService } from './transfer-transaction.service'
import { TransferService } from './transfer.service'

const REQUEST_ID = '507f1f77bcf86cd799439011'
const CONTRACT_ID = '507f1f77bcf86cd799439012'

const actor = (userId: string, roleName: (typeof RoleName)[keyof typeof RoleName]) => ({ userId, roleName })

function setup(options: { transactionDependencies?: boolean } = { transactionDependencies: true }) {
  const request = {
    id: REQUEST_ID,
    seriesId: 'series-1',
    requestingMangakaId: 'mangaka-b',
    originalMangakaId: 'mangaka-a',
    originalContractType: 'REVENUE_SHARE',
    originalContractId: 'contract-old',
    status: 'SUBMITTED',
    boardDecisionId: 'decision-1'
  }
  const repo = {
    findActiveContractBySeriesId: jest.fn(),
    createTransferRequest: jest.fn().mockResolvedValue({ id: REQUEST_ID }),
    findTransferRequestsByMangaka: jest.fn().mockResolvedValue([{ id: REQUEST_ID }]),
    findTransferRequestById: jest.fn().mockResolvedValue(request),
    findSeriesAccessScope: jest.fn().mockResolvedValue({ editorId: 'editor-1' }),
    findPendingBoardRequests: jest.fn().mockResolvedValue([{ id: REQUEST_ID }]),
    createTransferContractInTransaction: jest.fn().mockResolvedValue({ id: CONTRACT_ID }),
    findTransferContractById: jest.fn(),
    findUserById: jest.fn().mockResolvedValue({ email: 'signer@example.com', status: 'ACTIVE' }),
    addSignatureInTransaction: jest.fn().mockResolvedValue({ id: 'signature-1' })
  }
  const board = {
    getTransferDecisionContext: jest.fn().mockResolvedValue({
      id: 'decision-1',
      boardSessionId: 'session-1',
      targetSeriesId: 'series-1',
      decisionType: 'TRANSFER',
      result: 'APPROVED',
      allowedEditorIds: ['board-1']
    }),
    findTerminalTransferDecisionContextsBySession: jest.fn()
  }
  const audit = { record: jest.fn().mockResolvedValue(undefined) }
  const notifications = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const context = {}
  const uow = { runInTransaction: jest.fn((work: (transaction: object) => unknown) => work(context)) }
  const contracts = { createReplacementDraft: jest.fn().mockResolvedValue({ id: 'replacement-1' }) }
  const series = { transferOwnership: jest.fn().mockResolvedValue(undefined) }
  const signingOtp = { consumeSigningOtp: jest.fn().mockResolvedValue(undefined) }
  const requestState = {
    transition: jest
      .fn()
      .mockImplementation((_context: unknown, id: string, _from: string, to: string, patch?: object) =>
        Promise.resolve({ ...request, id, status: to, ...patch })
      )
  }
  const contractState = { transition: jest.fn().mockResolvedValue(undefined) }
  const withTransactions = options.transactionDependencies !== false
  const policy = new TransferAccessPolicy()
  const loader = new TransferResourceLoader(repo as never, board as never, policy)
  const transactions = new TransferTransactionService(
    withTransactions ? (uow as never) : undefined,
    withTransactions ? (contracts as never) : undefined,
    withTransactions ? series : undefined,
    withTransactions ? signingOtp : undefined,
    withTransactions ? (requestState as never) : undefined,
    withTransactions ? (contractState as never) : undefined
  )
  const service = new TransferService(
    new TransferRequestService(repo as never, audit as never, policy, loader, transactions),
    new TransferNegotiationService(repo as never, audit as never, policy, loader, transactions),
    new TransferContractService(repo as never, audit as never, policy, loader, transactions, notifications as never),
    new TransferSigningService(repo as never, audit as never, policy, loader, transactions, notifications as never),
    new TransferContractQueryService(repo as never, policy, loader)
  )
  return {
    service,
    repo,
    board,
    audit,
    notifications,
    uow,
    contracts,
    series,
    signingOtp,
    requestState,
    contractState,
    request
  }
}

describe('TransferService branch coverage — request and Board lifecycle', () => {
  it('creates a request from the authoritative active contract', async () => {
    const { service, repo } = setup()
    repo.findActiveContractBySeriesId.mockResolvedValue({
      id: 'active-contract',
      mangakaId: 'mangaka-a',
      contractType: 'REVENUE_SHARE'
    })

    await service.createTransferRequest('mangaka-b', {
      seriesId: 'series-1',
      proposedType: 'PARTIAL_TRANSFER',
      proposedPercentage: 40,
      planDescription: 'continue publication'
    } as never)

    expect(repo.createTransferRequest).toHaveBeenCalledWith({
      seriesId: 'series-1',
      requestingMangakaId: 'mangaka-b',
      originalMangakaId: 'mangaka-a',
      originalContractType: 'REVENUE_SHARE',
      proposedType: 'PARTIAL_TRANSFER',
      proposedPercentage: 40,
      planDescription: 'continue publication',
      originalContractId: 'active-contract'
    })
  })

  it('rejects request creation without an active contract', async () => {
    const { service, repo } = setup()
    repo.findActiveContractBySeriesId.mockResolvedValue(null)

    await expect(
      service.createTransferRequest('mangaka-b', {
        seriesId: 'series-1',
        proposedType: 'PARTIAL_TRANSFER',
        planDescription: 'continue publication'
      } as never)
    ).rejects.toBe(NoActiveContractFoundException)
  })

  it('rejects an inactive requester and the current owner', async () => {
    const inactive = setup()
    inactive.repo.findUserById.mockResolvedValue({ email: 'inactive@example.com', status: 'INACTIVE' })
    inactive.repo.findActiveContractBySeriesId.mockResolvedValue({
      id: 'active-contract',
      mangakaId: 'mangaka-a',
      contractType: 'REVENUE_SHARE'
    })
    await expect(
      inactive.service.createTransferRequest('mangaka-b', {
        seriesId: 'series-1',
        proposedType: 'FULL_TRANSFER',
        planDescription: 'continue publication'
      } as never)
    ).rejects.toBe(RequestingMangakaInactiveException)
    expect(inactive.repo.createTransferRequest).not.toHaveBeenCalled()

    const owner = setup()
    owner.repo.findActiveContractBySeriesId.mockResolvedValue({
      id: 'active-contract',
      mangakaId: 'mangaka-b',
      contractType: 'REVENUE_SHARE'
    })
    await expect(
      owner.service.createTransferRequest('mangaka-b', {
        seriesId: 'series-1',
        proposedType: 'FULL_TRANSFER',
        planDescription: 'self transfer'
      } as never)
    ).rejects.toBe(RequesterAlreadyOwnsSeriesException)
    expect(owner.repo.createTransferRequest).not.toHaveBeenCalled()
  })

  it.each([
    ['partial transfer without a percentage', 'REVENUE_SHARE', 'PARTIAL_TRANSFER', undefined],
    ['partial transfer with a terminal percentage', 'REVENUE_SHARE', 'PARTIAL_TRANSFER', 100],
    ['full transfer with a percentage', 'REVENUE_SHARE', 'FULL_TRANSFER', 40],
    ['partial transfer of a full-buyout contract', 'FULL_BUYOUT', 'PARTIAL_TRANSFER', 40]
  ])('rejects %s', async (_label, contractType, proposedType, proposedPercentage) => {
    const { service, repo } = setup()
    repo.findActiveContractBySeriesId.mockResolvedValue({
      id: 'active-contract',
      mangakaId: 'mangaka-a',
      contractType
    })

    await expect(
      service.createTransferRequest('mangaka-b', {
        seriesId: 'series-1',
        proposedType,
        proposedPercentage,
        planDescription: 'invalid proposal'
      } as never)
    ).rejects.toBe(InvalidTransferProposalException)
    expect(repo.createTransferRequest).not.toHaveBeenCalled()
  })

  it('returns request lists from the repository', async () => {
    const { service } = setup()

    await expect(service.getTransferRequestsByMangaka('mangaka-b')).resolves.toEqual({ data: [{ id: REQUEST_ID }] })
    await expect(service.getPendingBoardRequests()).resolves.toEqual({ data: [{ id: REQUEST_ID }] })
  })

  it('rejects malformed, missing and unauthorized request detail access', async () => {
    const malformed = setup()
    await expect(
      malformed.service.getTransferRequestById('not-an-object-id', actor('mangaka-b', RoleName.MANGAKA))
    ).rejects.toBe(TransferRequestNotFoundException)

    const missing = setup()
    missing.repo.findTransferRequestById.mockResolvedValue(null)
    await expect(missing.service.getTransferRequestById(REQUEST_ID, actor('mangaka-b', RoleName.MANGAKA))).rejects.toBe(
      TransferRequestNotFoundException
    )

    const denied = setup()
    denied.repo.findSeriesAccessScope.mockResolvedValue(null)
    await expect(denied.service.getTransferRequestById(REQUEST_ID, actor('editor-1', RoleName.EDITOR))).rejects.toBe(
      TransferAccessDeniedException
    )
  })

  it('returns request detail to a participating Mangaka', async () => {
    const { service, request } = setup()
    await expect(service.getTransferRequestById(REQUEST_ID, actor('mangaka-b', RoleName.MANGAKA))).resolves.toBe(
      request
    )
  })

  it('supports the legacy session reference only when it resolves exactly one authoritative decision', async () => {
    const { service, board, requestState } = setup()
    board.findTerminalTransferDecisionContextsBySession.mockResolvedValueOnce([])

    await expect(
      service.boardApproveScreening(REQUEST_ID, actor('board-1', RoleName.BOARD_MEMBER), {
        boardSessionId: 'session-1'
      })
    ).rejects.toBe(InvalidTransferBoardDecisionException)

    board.findTerminalTransferDecisionContextsBySession.mockResolvedValueOnce([
      {
        id: 'decision-session',
        targetSeriesId: 'series-1',
        decisionType: 'TRANSFER',
        result: 'APPROVED',
        allowedEditorIds: ['board-1']
      }
    ])
    await service.boardApproveScreening(REQUEST_ID, actor('board-1', RoleName.BOARD_MEMBER), {
      boardSessionId: 'session-1'
    })
    expect(requestState.transition).toHaveBeenCalledWith(expect.anything(), REQUEST_ID, 'SUBMITTED', 'UNDER_REVIEW', {
      boardDecisionId: 'decision-session'
    })
  })

  it.each([
    ['wrong decision type', { decisionType: 'REPRINT' }],
    ['wrong target series', { targetSeriesId: 'series-other' }],
    ['wrong terminal result', { result: 'REJECTED' }]
  ])('rejects a Board decision with %s', async (_label, decisionPatch) => {
    const { service, board } = setup()
    board.getTransferDecisionContext.mockResolvedValue({
      id: 'decision-1',
      targetSeriesId: 'series-1',
      decisionType: 'TRANSFER',
      result: 'APPROVED',
      allowedEditorIds: ['board-1'],
      ...decisionPatch
    })

    await expect(
      service.boardApproveScreening(REQUEST_ID, actor('board-1', RoleName.BOARD_MEMBER), {
        boardDecisionId: 'decision-1'
      })
    ).rejects.toBe(InvalidTransferBoardDecisionException)
  })

  it('rejects screening a request outside SUBMITTED', async () => {
    const { service, repo, request } = setup()
    repo.findTransferRequestById.mockResolvedValue({ ...request, status: 'UNDER_REVIEW' })

    await expect(
      service.boardApproveScreening(REQUEST_ID, actor('board-1', RoleName.BOARD_MEMBER), {
        boardDecisionId: 'decision-1'
      })
    ).rejects.toBe(InvalidStatusForScreeningException)
  })

  it('records an authoritative Board rejection and actor audit', async () => {
    const { service, board, requestState, audit } = setup()
    board.getTransferDecisionContext.mockResolvedValue({
      id: 'decision-reject',
      targetSeriesId: 'series-1',
      decisionType: 'TRANSFER',
      result: 'REJECTED',
      allowedEditorIds: ['board-1']
    })

    await service.boardRejectScreening(REQUEST_ID, actor('board-1', RoleName.BOARD_MEMBER), {
      boardDecisionId: 'decision-reject'
    })

    expect(requestState.transition).toHaveBeenCalledWith(
      expect.anything(),
      REQUEST_ID,
      'SUBMITTED',
      'REJECTED_BY_BOARD',
      { boardDecisionId: 'decision-reject' }
    )
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'board-1' }))
  })

  // §84: Spec 27 đã cho A/B/Board *tra ra* được hợp đồng, nhưng không ai được BÁO là đã có bản
  // để ký. Hai người phải ký (A = originalMangaka, B = requestingMangaka) cần notification mang
  // theo transferContractId, nếu không họ phải tự đoán thời điểm vào xem.
  it('notifies both signing mangakas when the transfer contract is drafted', async () => {
    const { service, repo, notifications, request } = setup()
    repo.findTransferRequestById.mockResolvedValue({ ...request, status: 'UNDER_REVIEW' })

    await service.createTransferContract(actor('editor-1', RoleName.EDITOR), {
      transferRequestId: REQUEST_ID,
      transferType: 'FULL_TRANSFER',
      transferAmount: 1000,
      newOwnershipSplit: { publisher: 70, A: 0, B: 30 },
      coOwnerApprovalRequired: false
    } as never)

    const recipients = notifications.notifySafe.mock.calls.map((c) => (c[0] as { recipientId: string }).recipientId)
    expect(recipients).toEqual(expect.arrayContaining(['mangaka-a', 'mangaka-b']))
  })

  it('carries the transfer contract id in the drafted notification so signers can open it', async () => {
    const { service, repo, notifications, request } = setup()
    repo.findTransferRequestById.mockResolvedValue({ ...request, status: 'UNDER_REVIEW' })

    await service.createTransferContract(actor('editor-1', RoleName.EDITOR), {
      transferRequestId: REQUEST_ID,
      transferType: 'FULL_TRANSFER',
      transferAmount: 1000,
      newOwnershipSplit: { publisher: 70, A: 0, B: 30 },
      coOwnerApprovalRequired: false
    } as never)

    expect(notifications.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: CONTRACT_ID, referenceType: 'TRANSFER_CONTRACT_DRAFTED' })
    )
  })

  it('requires all transaction capabilities before a state-changing transaction', async () => {
    const { service, repo, request } = setup({ transactionDependencies: false })
    repo.findTransferRequestById.mockResolvedValue({ ...request, status: 'UNDER_REVIEW' })

    await expect(
      service.createTransferContract(actor('editor-1', RoleName.EDITOR), {
        transferRequestId: REQUEST_ID
      } as never)
    ).rejects.toThrow('Transfer transaction dependencies are not configured')
  })
})

describe('TransferService branch coverage — negotiation lifecycle', () => {
  it('enforces assigned-editor access and revenue-share contract type when negotiation starts', async () => {
    const denied = setup()
    await expect(denied.service.startNegotiation(REQUEST_ID, actor('editor-other', RoleName.EDITOR))).rejects.toBe(
      TransferAccessDeniedException
    )

    const wrongType = setup()
    wrongType.repo.findTransferRequestById.mockResolvedValue({
      ...wrongType.request,
      originalContractType: 'FULL_BUYOUT'
    })
    await expect(wrongType.service.startNegotiation(REQUEST_ID, actor('editor-1', RoleName.EDITOR))).rejects.toBe(
      OnlyAppliesToRevenueShareException
    )
  })

  it('moves a revenue-share request into negotiation and audits the editor', async () => {
    const { service, repo, request, requestState, audit } = setup()
    repo.findTransferRequestById.mockResolvedValue({ ...request, status: 'UNDER_REVIEW' })

    await service.startNegotiation(REQUEST_ID, actor('editor-1', RoleName.EDITOR))

    expect(requestState.transition).toHaveBeenCalledWith(expect.anything(), REQUEST_ID, 'UNDER_REVIEW', 'NEGOTIATING')
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'editor-1', toState: 'NEGOTIATING' }))
  })

  it('lets only one concurrent negotiation transition win and audits only the committed winner', async () => {
    const { service, repo, request, requestState, audit } = setup()
    repo.findTransferRequestById.mockResolvedValue({ ...request, status: 'UNDER_REVIEW' })
    let claimed = false
    requestState.transition.mockImplementation(async () => {
      if (claimed) throw InvalidTransferStateException
      claimed = true
      await Promise.resolve()
      return { ...request, status: 'NEGOTIATING' }
    })

    const results = await Promise.allSettled([
      service.startNegotiation(REQUEST_ID, actor('editor-1', RoleName.EDITOR)),
      service.startNegotiation(REQUEST_ID, actor('editor-1', RoleName.EDITOR))
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(audit.record).toHaveBeenCalledTimes(1)
  })

  it('does not audit a request transition when the transactional CAS fails', async () => {
    const { service, repo, request, requestState, audit } = setup()
    repo.findTransferRequestById.mockResolvedValue({ ...request, status: 'UNDER_REVIEW' })
    requestState.transition.mockRejectedValue(InvalidTransferStateException)

    await expect(service.startNegotiation(REQUEST_ID, actor('editor-1', RoleName.EDITOR))).rejects.toBe(
      InvalidTransferStateException
    )
    expect(audit.record).not.toHaveBeenCalled()
  })

  it.each([
    ['accept', 'mangakaAcceptTransfer'],
    ['reject', 'mangakaRejectTransfer']
  ])('allows only the original Mangaka to %s during negotiation', async (_label, method) => {
    const denied = setup()
    denied.repo.findTransferRequestById.mockResolvedValue({ ...denied.request, status: 'NEGOTIATING' })
    await expect(
      denied.service[method as 'mangakaAcceptTransfer'](REQUEST_ID, actor('mangaka-b', RoleName.MANGAKA))
    ).rejects.toBe(TransferAccessDeniedException)

    const wrongState = setup()
    await expect(
      wrongState.service[method as 'mangakaAcceptTransfer'](REQUEST_ID, actor('mangaka-a', RoleName.MANGAKA))
    ).rejects.toBe(RequestNotInNegotiatingStageException)
  })

  it('applies both original-Mangaka negotiation outcomes with actor audit', async () => {
    const accepted = setup()
    accepted.repo.findTransferRequestById.mockResolvedValue({ ...accepted.request, status: 'NEGOTIATING' })
    await accepted.service.mangakaAcceptTransfer(REQUEST_ID, actor('mangaka-a', RoleName.MANGAKA))
    expect(accepted.requestState.transition).toHaveBeenCalledWith(
      expect.anything(),
      REQUEST_ID,
      'NEGOTIATING',
      'UNDER_REVIEW'
    )

    const rejected = setup()
    rejected.repo.findTransferRequestById.mockResolvedValue({ ...rejected.request, status: 'NEGOTIATING' })
    await rejected.service.mangakaRejectTransfer(REQUEST_ID, actor('mangaka-a', RoleName.MANGAKA))
    expect(rejected.requestState.transition).toHaveBeenCalledWith(
      expect.anything(),
      REQUEST_ID,
      'NEGOTIATING',
      'REJECTED_BY_ORIGINAL_MANGAKA'
    )
  })
})

describe('TransferService branch coverage — signature authorization and final ownership', () => {
  const contract = {
    id: CONTRACT_ID,
    transferRequestId: REQUEST_ID,
    seriesId: 'series-1',
    fromMangakaId: 'mangaka-a',
    toMangakaId: 'mangaka-b',
    transferType: 'FULL_TRANSFER',
    status: 'DRAFT',
    signatures: []
  }

  it('rejects malformed, missing and structurally detached contracts', async () => {
    const malformed = setup()
    await expect(
      malformed.service.signTransferContract('bad-id', actor('mangaka-a', RoleName.MANGAKA), { otpCode: '123456' })
    ).rejects.toBe(TransferContractNotFoundException)

    const missing = setup()
    missing.repo.findTransferContractById.mockResolvedValue(null)
    await expect(
      missing.service.signTransferContract(CONTRACT_ID, actor('mangaka-a', RoleName.MANGAKA), { otpCode: '123456' })
    ).rejects.toBe(TransferContractNotFoundException)

    const detached = setup()
    detached.repo.findTransferContractById.mockResolvedValue({ ...contract, seriesId: null })
    await expect(
      detached.service.signTransferContract(CONTRACT_ID, actor('mangaka-a', RoleName.MANGAKA), { otpCode: '123456' })
    ).rejects.toBe(TransferAccessDeniedException)
  })

  it('rejects an actor without a server-derived signer role', async () => {
    const { service, repo } = setup()
    repo.findTransferContractById.mockResolvedValue(contract)

    await expect(
      service.signTransferContract(CONTRACT_ID, actor('mangaka-other', RoleName.MANGAKA), { otpCode: '123456' })
    ).rejects.toBe(TransferAccessDeniedException)
  })

  it.each([
    ['missing user', null],
    ['missing email', { email: null }]
  ])('rejects a valid signer with %s before OTP consumption', async (_label, user) => {
    const { service, repo, signingOtp } = setup()
    repo.findTransferContractById.mockResolvedValue(contract)
    repo.findUserById.mockResolvedValue(user)

    await expect(
      service.signTransferContract(CONTRACT_ID, actor('mangaka-a', RoleName.MANGAKA), { otpCode: '123456' })
    ).rejects.toBe(UserOrEmailNotFoundException)
    expect(signingOtp.consumeSigningOtp).not.toHaveBeenCalled()
  })

  it('records Mangaka A signature and advances only the contract signing state', async () => {
    const { service, repo, contractState, requestState } = setup()
    repo.findTransferContractById.mockResolvedValue({ ...contract, signatures: undefined })

    await service.signTransferContract(CONTRACT_ID, actor('mangaka-a', RoleName.MANGAKA), { otpCode: '123456' })

    expect(contractState.transition).toHaveBeenCalledWith(expect.anything(), CONTRACT_ID, 'DRAFT', 'A_SIGNED')
    expect(requestState.transition).not.toHaveBeenCalled()
  })

  // §84: chuỗi ký A → B → Hội đồng trước đây không phát notification nào ⇒ ký xong người kế tiếp
  // không biết đến lượt mình, hợp đồng nằm im vô thời hạn.
  it('tells Mangaka B it is their turn after Mangaka A signs', async () => {
    const { service, repo, notifications } = setup()
    repo.findTransferContractById.mockResolvedValue({ ...contract, signatures: undefined })

    await service.signTransferContract(CONTRACT_ID, actor('mangaka-a', RoleName.MANGAKA), { otpCode: '123456' })

    expect(notifications.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'mangaka-b',
        referenceId: CONTRACT_ID,
        referenceType: 'TRANSFER_CONTRACT_AWAITING_SIGNATURE'
      })
    )
  })

  it('tells the Board roster it is their turn after Mangaka B signs', async () => {
    const { service, repo, notifications } = setup()
    repo.findTransferContractById.mockResolvedValue({ ...contract, status: 'A_SIGNED', signatures: [] })

    await service.signTransferContract(CONTRACT_ID, actor('mangaka-b', RoleName.MANGAKA), { otpCode: '123456' })

    expect(notifications.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'board-1',
        referenceId: CONTRACT_ID,
        referenceType: 'TRANSFER_CONTRACT_AWAITING_SIGNATURE'
      })
    )
  })

  it.each([
    ['full transfer', 'FULL_TRANSFER', null, false],
    ['partial transfer', 'PARTIAL_TRANSFER', 'mangaka-a', true]
  ])(
    'Board signature fully executes a %s and derives ownership flags',
    async (_label, transferType, coOwnerId, coOwnerApprovalRequired) => {
      const { service, repo, series, requestState, contractState } = setup()
      repo.findTransferContractById.mockResolvedValue({
        ...contract,
        transferType,
        status: 'B_SIGNED'
      })

      await service.signTransferContract(CONTRACT_ID, actor('board-1', RoleName.BOARD_MEMBER), { otpCode: '123456' })

      expect(contractState.transition).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        CONTRACT_ID,
        'B_SIGNED',
        'BOARD_SIGNED'
      )
      expect(contractState.transition).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        CONTRACT_ID,
        'BOARD_SIGNED',
        'FULLY_EXECUTED'
      )
      expect(series.transferOwnership).toHaveBeenCalledWith(expect.anything(), {
        seriesId: 'series-1',
        mangakaId: 'mangaka-b',
        coOwnerId,
        coOwnerApprovalRequired
      })
      expect(requestState.transition).toHaveBeenCalledWith(
        expect.anything(),
        REQUEST_ID,
        'AWAITING_TRANSFER_SIGNATURES',
        'COMPLETED'
      )
    }
  )

  it('protects signature reads and maps an absent signature collection to an empty list', async () => {
    const malformed = setup()
    await expect(malformed.service.getSignatures('bad-id', actor('admin', RoleName.SUPER_ADMIN))).rejects.toBe(
      TransferContractNotFoundException
    )

    const missing = setup()
    missing.repo.findTransferContractById.mockResolvedValue(null)
    await expect(missing.service.getSignatures(CONTRACT_ID, actor('admin', RoleName.SUPER_ADMIN))).rejects.toBe(
      TransferContractNotFoundException
    )

    const detached = setup()
    detached.repo.findTransferContractById.mockResolvedValue({ ...contract, transferRequestId: null })
    await expect(detached.service.getSignatures(CONTRACT_ID, actor('admin', RoleName.SUPER_ADMIN))).rejects.toBe(
      TransferAccessDeniedException
    )

    const denied = setup()
    denied.repo.findTransferContractById.mockResolvedValue(contract)
    await expect(denied.service.getSignatures(CONTRACT_ID, actor('editor-other', RoleName.EDITOR))).rejects.toBe(
      TransferAccessDeniedException
    )

    const allowed = setup()
    allowed.repo.findTransferContractById.mockResolvedValue({ ...contract, signatures: undefined })
    allowed.repo.findSeriesAccessScope.mockResolvedValue(null)
    allowed.repo.findTransferRequestById.mockResolvedValue({ ...allowed.request, boardDecisionId: null })
    await expect(allowed.service.getSignatures(CONTRACT_ID, actor('admin', RoleName.SUPER_ADMIN))).resolves.toEqual({
      signatures: []
    })
  })
})
