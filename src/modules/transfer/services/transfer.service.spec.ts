import { TransferService } from './transfer.service'
import {
  ActiveTransferRequestAlreadyExistsException,
  InvalidTransferBoardDecisionException,
  InvalidTransferStateException,
  OnlyAppliesToRevenueShareException,
  TransferAccessDeniedException,
  UserHasAlreadySignedContractException,
  ValuationRequiredException
} from '../errors/transfer.error'
import { TRANSFER_REQUEST_STATUS } from '../transfer.constant'
import { CreateTransferContractSchema, TransferContractSchema } from '../schemas/transfer-schema'
import { AuditEntityType } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { RoleName } from 'src/core/security/constants/role.constant'
import { TransferAccessPolicy } from './transfer-access.policy'
import { TransferContractService } from './transfer-contract.service'
import { TransferNegotiationService } from './transfer-negotiation.service'
import { TransferRequestService } from './transfer-request.service'
import { TransferResourceLoader } from './transfer-resource-loader.service'
import { TransferContractQueryService } from './transfer-contract-query.service'
import { TransferSigningService } from './transfer-signing.service'
import { TransferTransactionService } from './transfer-transaction.service'

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    findTransferRequestById: jest.fn(),
    findSeriesAccessScope: jest.fn().mockResolvedValue({ editorId: 'editor-assigned' }),
    findActiveContractBySeriesId: jest.fn(),
    findActiveTransferRequestBySeriesId: jest.fn().mockResolvedValue(null),
    findTransferRequestsByEditor: jest.fn().mockResolvedValue([]),
    createTransferRequest: jest.fn(),
    findTransferContractById: jest.fn(),
    findUserById: jest.fn(),
    addTransferContractSignature: jest.fn(),
    updateTransferContractStatus: jest.fn(),
    terminateOldContract: jest.fn().mockResolvedValue({}),
    createNewContractFromTransfer: jest.fn().mockResolvedValue({ id: 'newK' }),
    updateSeriesOwnership: jest.fn().mockResolvedValue({}),
    requestStateTransition: jest.fn(),
    createTransferContract: jest.fn().mockResolvedValue({ id: 'tc1' }),
    createTransferContractInTransaction: jest.fn(),
    addSignatureInTransaction: jest.fn(),
    ...overrides
  }
}

function makeAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) }
}

function makeBoard(overrides: Record<string, unknown> = {}) {
  return {
    getTransferDecisionContext: jest.fn().mockResolvedValue({
      id: 'decision-1',
      boardSessionId: 'session-1',
      targetSeriesId: 's1',
      decisionType: 'TRANSFER',
      result: 'APPROVED',
      allowedEditorIds: ['board-1']
    }),
    findTerminalTransferDecisionContextsBySession: jest.fn(),
    ...overrides
  }
}

function makeOtp() {
  return { validateOtpCode: jest.fn(), burnOtp: jest.fn() }
}

function make(
  repo: ReturnType<typeof makeRepo>,
  audit: ReturnType<typeof makeAudit> = makeAudit(),
  board: ReturnType<typeof makeBoard> = makeBoard(),
  otp: ReturnType<typeof makeOtp> = makeOtp(),
  requestNotifications: { notifySafe: jest.Mock } = { notifySafe: jest.fn() },
  contractNotifications: { notifySafe: jest.Mock } = { notifySafe: jest.fn() }
) {
  const context = {}
  repo.createTransferContractInTransaction.mockImplementation((_context: unknown, data: unknown) => {
    const result: unknown = repo.createTransferContract(data)
    return result
  })
  repo.addSignatureInTransaction.mockImplementation((_context: unknown, id: string, userId: string, role: string) => {
    const result: unknown = repo.addTransferContractSignature(id, userId, role)
    return result
  })
  const uow = { runInTransaction: jest.fn((work: (ctx: unknown) => unknown) => work(context)) }
  const contracts = {
    createReplacementDraft: jest.fn((_context: unknown, command: unknown) => {
      const result: unknown = repo.createNewContractFromTransfer(command)
      return result
    })
  }
  const series = {
    transferOwnership: jest.fn(async (_context: unknown, command: { seriesId: string } & Record<string, unknown>) => {
      const { seriesId, ...data } = command
      await repo.updateSeriesOwnership(seriesId, data)
    })
  }
  const signingOtp = {
    consumeSigningOtp: jest.fn(async (_context: unknown, command: { email: string; code: string; purpose: string }) => {
      await otp.validateOtpCode(command)
      await otp.burnOtp(command.email, command.purpose)
    })
  }
  const requestState = {
    transition: repo.requestStateTransition.mockImplementation(
      (_context: unknown, id: string, _from: string, to: string, patch?: object) =>
        Promise.resolve({ id, status: to, ...patch })
    )
  }
  const contractState = { transition: jest.fn() }
  const policy = new TransferAccessPolicy()
  const loader = new TransferResourceLoader(repo as never, board as never, policy)
  const transactions = new TransferTransactionService(
    uow as never,
    contracts as never,
    series,
    signingOtp,
    requestState as never,
    contractState as never
  )
  return new TransferService(
    new TransferRequestService(
      repo as never,
      audit as never,
      policy,
      loader,
      transactions,
      requestNotifications as never
    ),
    new TransferNegotiationService(repo as never, audit as never, policy, loader, transactions),
    new TransferContractService(
      repo as never,
      audit as never,
      policy,
      loader,
      transactions,
      contractNotifications as never
    ),
    new TransferSigningService(repo as never, audit as never, policy, loader, transactions, {
      notifySafe: jest.fn()
    } as never),
    new TransferContractQueryService(repo as never, policy, loader)
  )
}

const actor = (userId: string, roleName: (typeof RoleName)[keyof typeof RoleName]) => ({ userId, roleName })

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
        requestingMangakaId: 'B',
        boardDecisionId: 'decision-1'
      })

      await make(repo).boardAssignFullBuyout('507f1f77bcf86cd799439011', actor('board-1', RoleName.BOARD_MEMBER), {
        valuationAmount: 5000,
        conditions: [{ description: 'B adds 5 chapters', type: 'RECURRING_CHAPTER', value: 5 }]
      })

      const arg = repo.createNewContractFromTransfer.mock.calls[0][0]
      expect(arg.valuationAmount).toBe(5000)
      expect(arg.conditions).toEqual([{ description: 'B adds 5 chapters', type: 'RECURRING_CHAPTER', value: 5 }])
      expect(repo.terminateOldContract).not.toHaveBeenCalled()
      expect(repo.updateSeriesOwnership).not.toHaveBeenCalled()
      expect(repo.requestStateTransition).toHaveBeenCalledWith(
        expect.anything(),
        '507f1f77bcf86cd799439011',
        'UNDER_REVIEW',
        'AWAITING_REPLACEMENT_SIGNATURES'
      )
    })

    // §v2 point 7: response phải mang replacementContractId + requestStatus để FE mở đúng hợp đồng thay thế.
    it('returns replacementContractId + requestStatus (not just a message)', async () => {
      const repo = makeRepo({ createNewContractFromTransfer: jest.fn().mockResolvedValue({ id: 'replacement-1' }) })
      repo.findTransferRequestById.mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        status: 'UNDER_REVIEW',
        originalContractType: 'FULL_BUYOUT',
        originalContractId: 'k0',
        originalContract: { editorId: 'editor-1' },
        seriesId: 's1',
        requestingMangakaId: 'B',
        originalMangakaId: 'A',
        boardDecisionId: 'decision-1'
      })

      const result = await make(repo).boardAssignFullBuyout(
        '507f1f77bcf86cd799439011',
        actor('board-1', RoleName.BOARD_MEMBER),
        { valuationAmount: 5000, conditions: [{ description: 'x', type: 'RECURRING_CHAPTER', value: 5 }] }
      )

      expect(result).toMatchObject({
        replacementContractId: 'replacement-1',
        requestStatus: TRANSFER_REQUEST_STATUS.AWAITING_REPLACEMENT_SIGNATURES
      })
    })

    // §v2 point 8: createReplacementDraft không đi qua luồng notify hợp đồng thường → phải tự báo.
    it('notifies new mangaka + editor + board roster with the replacement contract id', async () => {
      const repo = makeRepo({ createNewContractFromTransfer: jest.fn().mockResolvedValue({ id: 'replacement-1' }) })
      repo.findTransferRequestById.mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        status: 'UNDER_REVIEW',
        originalContractType: 'FULL_BUYOUT',
        originalContractId: 'k0',
        originalContract: { editorId: 'editor-1' },
        seriesId: 's1',
        requestingMangakaId: 'B',
        originalMangakaId: 'A',
        boardDecisionId: 'decision-1'
      })
      const contractNotify = { notifySafe: jest.fn() }
      await make(
        repo,
        makeAudit(),
        makeBoard(),
        makeOtp(),
        { notifySafe: jest.fn() },
        contractNotify
      ).boardAssignFullBuyout('507f1f77bcf86cd799439011', actor('board-1', RoleName.BOARD_MEMBER), {
        valuationAmount: 5000,
        conditions: [{ description: 'x', type: 'RECURRING_CHAPTER', value: 5 }]
      })

      const recipients = contractNotify.notifySafe.mock.calls.map((c) => (c[0] as { recipientId: string }).recipientId)
      expect(recipients).toEqual(expect.arrayContaining(['B', 'editor-1', 'board-1']))
      expect(contractNotify.notifySafe).toHaveBeenCalledWith(expect.objectContaining({ referenceId: 'replacement-1' }))
    })

    it('rejects when valuationAmount <= 0 (ValuationRequired)', async () => {
      const repo = makeRepo()
      repo.findTransferRequestById.mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        status: 'UNDER_REVIEW',
        originalContractType: 'FULL_BUYOUT',
        originalContractId: 'k0',
        seriesId: 's1',
        requestingMangakaId: 'B',
        boardDecisionId: 'decision-1'
      })

      await expect(
        make(repo).boardAssignFullBuyout('507f1f77bcf86cd799439011', actor('board-1', RoleName.BOARD_MEMBER), {
          valuationAmount: 0,
          conditions: [{ description: 'x', type: 'TIME_BOUND', value: 1 }]
        })
      ).rejects.toBe(ValuationRequiredException)
      expect(repo.createNewContractFromTransfer).not.toHaveBeenCalled()
    })
  })

  describe('createTransferContract (B-TRF-03)', () => {
    // §v2 point 2: chặn tạo hợp đồng khi Mangaka gốc CHƯA đồng ý (request chưa ACCEPTED).
    it('rejects when the request is still UNDER_REVIEW (original mangaka not yet accepted)', async () => {
      const repo = makeRepo()
      repo.findTransferRequestById.mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        status: 'UNDER_REVIEW',
        originalContractType: 'REVENUE_SHARE',
        seriesId: 's1'
      })

      await expect(
        make(repo).createTransferContract(actor('editor-assigned', RoleName.EDITOR), {
          transferRequestId: '507f1f77bcf86cd799439011'
        } as never)
      ).rejects.toBe(InvalidTransferStateException)
      expect(repo.createTransferContract).not.toHaveBeenCalled()
    })

    it('rejects when the original contract is not REVENUE_SHARE', async () => {
      const repo = makeRepo()
      repo.findTransferRequestById.mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        status: 'ACCEPTED',
        originalContractType: 'FULL_BUYOUT',
        seriesId: 's1'
      })

      await expect(
        make(repo).createTransferContract(actor('editor-assigned', RoleName.EDITOR), {
          transferRequestId: '507f1f77bcf86cd799439011'
        } as never)
      ).rejects.toBe(OnlyAppliesToRevenueShareException)
      expect(repo.createTransferContract).not.toHaveBeenCalled()
    })

    it('allows creating a transfer contract only when request is ACCEPTED (REVENUE_SHARE)', async () => {
      const repo = makeRepo()
      repo.findTransferRequestById.mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        status: 'ACCEPTED',
        originalContractType: 'REVENUE_SHARE',
        seriesId: 's1',
        originalMangakaId: 'A',
        requestingMangakaId: 'B'
      })

      await make(repo).createTransferContract(actor('editor-assigned', RoleName.EDITOR), {
        transferRequestId: '507f1f77bcf86cd799439011',
        transferType: 'PARTIAL_TRANSFER',
        transferAmount: 100,
        newOwnershipSplit: {},
        coOwnerApprovalRequired: true
      } as never)

      expect(repo.createTransferContract).toHaveBeenCalled()
      expect(repo.requestStateTransition).toHaveBeenCalledWith(
        expect.anything(),
        '507f1f77bcf86cd799439011',
        TRANSFER_REQUEST_STATUS.ACCEPTED,
        TRANSFER_REQUEST_STATUS.AWAITING_TRANSFER_SIGNATURES
      )
    })
  })

  describe('negotiation review (B-TRF-03) — §v2 point 1', () => {
    it('mangaka accept transitions NEGOTIATING → ACCEPTED (not back to UNDER_REVIEW)', async () => {
      const repo = makeRepo()
      repo.findTransferRequestById.mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        status: 'NEGOTIATING',
        originalContractType: 'REVENUE_SHARE',
        originalMangakaId: 'mangaka-a',
        requestingMangakaId: 'mangaka-b',
        seriesId: 's1'
      })

      await make(repo).mangakaAcceptTransfer('507f1f77bcf86cd799439011', actor('mangaka-a', RoleName.MANGAKA))

      expect(repo.requestStateTransition).toHaveBeenCalledWith(
        expect.anything(),
        '507f1f77bcf86cd799439011',
        TRANSFER_REQUEST_STATUS.NEGOTIATING,
        TRANSFER_REQUEST_STATUS.ACCEPTED
      )
    })

    it('mangaka reject transitions NEGOTIATING → REJECTED_BY_ORIGINAL_MANGAKA', async () => {
      const repo = makeRepo()
      repo.findTransferRequestById.mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        status: 'NEGOTIATING',
        originalContractType: 'REVENUE_SHARE',
        originalMangakaId: 'mangaka-a',
        requestingMangakaId: 'mangaka-b',
        seriesId: 's1'
      })

      await make(repo).mangakaRejectTransfer('507f1f77bcf86cd799439011', actor('mangaka-a', RoleName.MANGAKA))

      expect(repo.requestStateTransition).toHaveBeenCalledWith(
        expect.anything(),
        '507f1f77bcf86cd799439011',
        TRANSFER_REQUEST_STATUS.NEGOTIATING,
        TRANSFER_REQUEST_STATUS.REJECTED_BY_ORIGINAL_MANGAKA
      )
    })
  })
})

describe('createTransferRequest — §v2 point 6 active-request guard', () => {
  const SERIES = '507f191e810c19729de860ea'
  const baseDto = { seriesId: SERIES, planDescription: 'plan', proposedType: 'FULL_TRANSFER' }

  function reqRepo(overrides: Record<string, unknown> = {}) {
    return makeRepo({
      findUserById: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      findActiveContractBySeriesId: jest
        .fn()
        .mockResolvedValue({ id: 'k0', mangakaId: 'A', contractType: 'REVENUE_SHARE' }),
      findActiveTransferRequestBySeriesId: jest.fn().mockResolvedValue(null),
      createTransferRequest: jest.fn().mockResolvedValue({ id: 'req1' }),
      ...overrides
    })
  }

  it('creates the request when no active transfer request exists for the series', async () => {
    const repo = reqRepo()
    await make(repo).createTransferRequest('B', baseDto as never)
    expect(repo.findActiveTransferRequestBySeriesId).toHaveBeenCalledWith(SERIES)
    expect(repo.createTransferRequest).toHaveBeenCalled()
  })

  it('rejects a second active transfer request for the same series (409)', async () => {
    const repo = reqRepo({ findActiveTransferRequestBySeriesId: jest.fn().mockResolvedValue({ id: 'existing' }) })
    await expect(make(repo).createTransferRequest('B', baseDto as never)).rejects.toBe(
      ActiveTransferRequestAlreadyExistsException
    )
    expect(repo.createTransferRequest).not.toHaveBeenCalled()
  })
})

describe('board screening notifications — §v2 point 4', () => {
  const REQUEST_ID = '507f1f77bcf86cd799439011'
  const SERIES_ID = '507f191e810c19729de860ea'
  const request = {
    id: REQUEST_ID,
    seriesId: SERIES_ID,
    requestingMangakaId: 'mangaka-b',
    originalMangakaId: 'mangaka-a',
    status: 'SUBMITTED',
    originalContractType: 'REVENUE_SHARE'
  }
  const boardApproved = makeBoard({
    getTransferDecisionContext: jest.fn().mockResolvedValue({
      id: 'd1',
      decisionType: 'TRANSFER',
      result: 'APPROVED',
      targetSeriesId: SERIES_ID,
      allowedEditorIds: ['board-1']
    })
  })
  const boardRejected = makeBoard({
    getTransferDecisionContext: jest.fn().mockResolvedValue({
      id: 'd1',
      decisionType: 'TRANSFER',
      result: 'REJECTED',
      targetSeriesId: SERIES_ID,
      allowedEditorIds: ['board-1']
    })
  })

  it('notifies editor + requesting + original mangaka on APPROVE, with request.id and APPROVED referenceType', async () => {
    const repo = makeRepo({
      findTransferRequestById: jest.fn().mockResolvedValue(request),
      findSeriesAccessScope: jest.fn().mockResolvedValue({ editorId: 'editor-1' })
    })
    const notify = { notifySafe: jest.fn() }
    await make(repo, makeAudit(), boardApproved, makeOtp(), notify).boardApproveScreening(
      REQUEST_ID,
      actor('board-1', RoleName.BOARD_MEMBER),
      { boardDecisionId: 'd1' }
    )
    const recipients = notify.notifySafe.mock.calls.map((c) => (c[0] as { recipientId: string }).recipientId)
    expect(recipients).toEqual(expect.arrayContaining(['editor-1', 'mangaka-b', 'mangaka-a']))
    expect(notify.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: REQUEST_ID, referenceType: 'TRANSFER_REQUEST_APPROVED' })
    )
  })

  it('notifies editor + requesting mangaka on REJECT (not original), with REJECTED referenceType', async () => {
    const repo = makeRepo({
      findTransferRequestById: jest.fn().mockResolvedValue(request),
      findSeriesAccessScope: jest.fn().mockResolvedValue({ editorId: 'editor-1' })
    })
    const notify = { notifySafe: jest.fn() }
    await make(repo, makeAudit(), boardRejected, makeOtp(), notify).boardRejectScreening(
      REQUEST_ID,
      actor('board-1', RoleName.BOARD_MEMBER),
      { boardDecisionId: 'd1' }
    )
    const recipients = notify.notifySafe.mock.calls.map((c) => (c[0] as { recipientId: string }).recipientId)
    expect(recipients).toEqual(expect.arrayContaining(['editor-1', 'mangaka-b']))
    expect(recipients).not.toContain('mangaka-a')
    expect(notify.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: REQUEST_ID, referenceType: 'TRANSFER_REQUEST_REJECTED' })
    )
  })
})

describe('getAssignedEditorRequests — §v2 point 3', () => {
  it('delegates to the editor-scoped repo lookup with the status filter and wraps in {data}', async () => {
    const repo = makeRepo({
      findTransferRequestsByEditor: jest.fn().mockResolvedValue([{ id: 'r1' }])
    })
    const result = await make(repo).getAssignedEditorRequests('editor-1', 'ACCEPTED')
    expect(repo.findTransferRequestsByEditor).toHaveBeenCalledWith('editor-1', 'ACCEPTED')
    expect(result).toEqual({ data: [{ id: 'r1' }] })
  })
})

describe('TransferService — AuditService wiring (Spec 11 / Task 13)', () => {
  const REQ_ID = '507f1f77bcf86cd799439011'

  it('startNegotiation records the real actor', async () => {
    const repo = makeRepo()
    repo.findTransferRequestById.mockResolvedValue({
      id: REQ_ID,
      status: 'UNDER_REVIEW',
      originalContractType: 'REVENUE_SHARE'
    })
    const audit = makeAudit()
    await make(repo, audit).startNegotiation(REQ_ID, actor('editor-assigned', RoleName.EDITOR))

    expect(repo.requestStateTransition).toHaveBeenCalledWith(
      expect.anything(),
      REQ_ID,
      TRANSFER_REQUEST_STATUS.UNDER_REVIEW,
      TRANSFER_REQUEST_STATUS.NEGOTIATING
    )
    expect(audit.record).toHaveBeenCalledWith({
      actorId: 'editor-assigned',
      entityType: AuditEntityType.TRANSFER_REQUEST,
      entityId: REQ_ID,
      action: 'TRANSITION',
      fromState: 'UNDER_REVIEW',
      toState: TRANSFER_REQUEST_STATUS.NEGOTIATING
    })
  })
})

describe('TransferService — object authorization and authoritative BoardDecision', () => {
  const REQUEST_ID = '507f1f77bcf86cd799439011'
  const SERIES_ID = '507f191e810c19729de860ea'
  const DECISION_ID = '507f1f77bcf86cd799439012'
  const request = {
    id: REQUEST_ID,
    seriesId: SERIES_ID,
    requestingMangakaId: 'mangaka-b',
    originalMangakaId: 'mangaka-a',
    status: 'SUBMITTED',
    originalContractType: 'REVENUE_SHARE'
  }

  it.each([
    ['unrelated Mangaka', actor('mangaka-c', RoleName.MANGAKA)],
    ['unassigned Editor', actor('editor-other', RoleName.EDITOR)]
  ])('denies request detail to %s', async (_label, deniedActor) => {
    const repo = makeRepo({ findTransferRequestById: jest.fn().mockResolvedValue(request) })
    await expect(make(repo).getTransferRequestById(REQUEST_ID, deniedActor)).rejects.toBe(TransferAccessDeniedException)
  })

  it('requires a terminal TRANSFER decision for the same series and expected result', async () => {
    const repo = makeRepo({ findTransferRequestById: jest.fn().mockResolvedValue(request) })
    const board = makeBoard({
      getTransferDecisionContext: jest.fn().mockResolvedValue({
        id: DECISION_ID,
        decisionType: 'TRANSFER',
        result: 'REJECTED',
        targetSeriesId: SERIES_ID,
        allowedEditorIds: ['board-1']
      })
    })

    await expect(
      make(repo, makeAudit(), board).boardApproveScreening(REQUEST_ID, actor('board-1', RoleName.BOARD_MEMBER), {
        boardDecisionId: DECISION_ID
      })
    ).rejects.toBe(InvalidTransferBoardDecisionException)
    expect(repo.requestStateTransition).not.toHaveBeenCalled()
  })

  it('stores the authoritative decision id and audits the board actor', async () => {
    const repo = makeRepo({ findTransferRequestById: jest.fn().mockResolvedValue(request) })
    const audit = makeAudit()
    const board = makeBoard({
      getTransferDecisionContext: jest.fn().mockResolvedValue({
        id: DECISION_ID,
        decisionType: 'TRANSFER',
        result: 'APPROVED',
        targetSeriesId: SERIES_ID,
        allowedEditorIds: ['board-1']
      })
    })

    await make(repo, audit, board).boardApproveScreening(REQUEST_ID, actor('board-1', RoleName.BOARD_MEMBER), {
      boardDecisionId: DECISION_ID
    })

    expect(repo.requestStateTransition).toHaveBeenCalledWith(
      expect.anything(),
      REQUEST_ID,
      TRANSFER_REQUEST_STATUS.SUBMITTED,
      TRANSFER_REQUEST_STATUS.UNDER_REVIEW,
      { boardDecisionId: DECISION_ID }
    )
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'board-1' }))
  })

  // §v2 point 5: một decision TRANSFER phải gắn đúng request nó được tạo cho; decision của request khác bị chặn.
  it('rejects a TRANSFER decision bound to a different transfer request', async () => {
    const repo = makeRepo({ findTransferRequestById: jest.fn().mockResolvedValue(request) })
    const board = makeBoard({
      getTransferDecisionContext: jest.fn().mockResolvedValue({
        id: DECISION_ID,
        decisionType: 'TRANSFER',
        result: 'APPROVED',
        targetSeriesId: SERIES_ID,
        transferRequestId: 'a-different-request-id',
        allowedEditorIds: ['board-1']
      })
    })

    await expect(
      make(repo, makeAudit(), board).boardApproveScreening(REQUEST_ID, actor('board-1', RoleName.BOARD_MEMBER), {
        boardDecisionId: DECISION_ID
      })
    ).rejects.toBe(InvalidTransferBoardDecisionException)
    expect(repo.requestStateTransition).not.toHaveBeenCalled()
  })

  it('accepts a TRANSFER decision bound to this request', async () => {
    const repo = makeRepo({ findTransferRequestById: jest.fn().mockResolvedValue(request) })
    const board = makeBoard({
      getTransferDecisionContext: jest.fn().mockResolvedValue({
        id: DECISION_ID,
        decisionType: 'TRANSFER',
        result: 'APPROVED',
        targetSeriesId: SERIES_ID,
        transferRequestId: REQUEST_ID,
        allowedEditorIds: ['board-1']
      })
    })

    await make(repo, makeAudit(), board).boardApproveScreening(REQUEST_ID, actor('board-1', RoleName.BOARD_MEMBER), {
      boardDecisionId: DECISION_ID
    })

    expect(repo.requestStateTransition).toHaveBeenCalled()
  })

  it('rejects a Board actor outside the decision roster', async () => {
    const repo = makeRepo({ findTransferRequestById: jest.fn().mockResolvedValue(request) })
    const board = makeBoard({
      getTransferDecisionContext: jest.fn().mockResolvedValue({
        id: DECISION_ID,
        decisionType: 'TRANSFER',
        result: 'APPROVED',
        targetSeriesId: SERIES_ID,
        allowedEditorIds: ['board-1']
      })
    })

    await expect(
      make(repo, makeAudit(), board).boardApproveScreening(REQUEST_ID, actor('board-other', RoleName.BOARD_MEMBER), {
        boardDecisionId: DECISION_ID
      })
    ).rejects.toBe(TransferAccessDeniedException)
  })
})

describe('TransferService — server-derived signer role and OTP ordering', () => {
  const CONTRACT_ID = '507f1f77bcf86cd799439021'
  const REQUEST_ID = '507f1f77bcf86cd799439011'
  const contract = {
    id: CONTRACT_ID,
    transferRequestId: REQUEST_ID,
    seriesId: '507f191e810c19729de860ea',
    fromMangakaId: 'mangaka-a',
    toMangakaId: 'mangaka-b',
    transferType: 'PARTIAL_TRANSFER',
    status: 'A_SIGNED',
    signatures: []
  }
  const request = {
    id: REQUEST_ID,
    seriesId: contract.seriesId,
    boardDecisionId: '507f1f77bcf86cd799439012',
    requestingMangakaId: 'mangaka-b',
    originalMangakaId: 'mangaka-a'
  }

  function signingDeps(overrides: Record<string, unknown> = {}) {
    const repo = makeRepo({
      findTransferContractById: jest.fn().mockResolvedValue(contract),
      findTransferRequestById: jest.fn().mockResolvedValue(request),
      findUserById: jest.fn().mockResolvedValue({ email: 'b@example.test' }),
      addTransferContractSignature: jest.fn().mockResolvedValue({}),
      ...overrides
    })
    const board = makeBoard({
      getTransferDecisionContext: jest.fn().mockResolvedValue({
        id: request.boardDecisionId,
        allowedEditorIds: ['board-1']
      })
    })
    return { repo, board, otp: makeOtp() }
  }

  it('records Mangaka B as MANGAKA_B even when a legacy client tries to spoof MANGAKA_A', async () => {
    const { repo, board, otp } = signingDeps({
      findTransferContractById: jest
        .fn()
        .mockResolvedValueOnce(contract)
        .mockResolvedValueOnce({
          ...contract,
          signatures: [{ userId: 'mangaka-b', role: 'MANGAKA_B' }]
        })
    })
    await make(repo, makeAudit(), board, otp).signTransferContract(CONTRACT_ID, actor('mangaka-b', RoleName.MANGAKA), {
      otpCode: '123456'
    })
    expect(repo.addTransferContractSignature).toHaveBeenCalledWith(CONTRACT_ID, 'mangaka-b', 'MANGAKA_B')
  })

  it.each([
    ['unrelated Mangaka', actor('mangaka-c', RoleName.MANGAKA)],
    ['unrostered Board', actor('board-other', RoleName.BOARD_MEMBER)]
  ])('denies %s before any OTP call', async (_label, deniedActor) => {
    const { repo, board, otp } = signingDeps()
    await expect(
      make(repo, makeAudit(), board, otp).signTransferContract(CONTRACT_ID, deniedActor, { otpCode: '123456' })
    ).rejects.toBe(TransferAccessDeniedException)
    expect(otp.validateOtpCode).not.toHaveBeenCalled()
    expect(otp.burnOtp).not.toHaveBeenCalled()
  })

  it('checks duplicate signature before validating or burning OTP', async () => {
    const { repo, board, otp } = signingDeps({
      findTransferContractById: jest.fn().mockResolvedValue({
        ...contract,
        signatures: [{ userId: 'mangaka-b', role: 'MANGAKA_B' }]
      })
    })
    await expect(
      make(repo, makeAudit(), board, otp).signTransferContract(CONTRACT_ID, actor('mangaka-b', RoleName.MANGAKA), {
        otpCode: '123456'
      })
    ).rejects.toBe(UserHasAlreadySignedContractException)
    expect(otp.validateOtpCode).not.toHaveBeenCalled()
    expect(otp.burnOtp).not.toHaveBeenCalled()
  })

  it('maps a concurrent unique-signature race to the transfer duplicate-signature error', async () => {
    const duplicate = new PrismaClientKnownRequestError('duplicate signature', {
      code: 'P2002',
      clientVersion: '6.19.3'
    })
    const { repo, board, otp } = signingDeps({
      addTransferContractSignature: jest.fn().mockRejectedValue(duplicate)
    })

    await expect(
      make(repo, makeAudit(), board, otp).signTransferContract(CONTRACT_ID, actor('mangaka-b', RoleName.MANGAKA), {
        otpCode: '123456'
      })
    ).rejects.toBe(UserHasAlreadySignedContractException)
  })

  it('rejects Mangaka B before A has signed without consuming OTP', async () => {
    const { repo, board, otp } = signingDeps({
      findTransferContractById: jest.fn().mockResolvedValue({ ...contract, status: 'DRAFT' })
    })
    await expect(
      make(repo, makeAudit(), board, otp).signTransferContract(CONTRACT_ID, actor('mangaka-b', RoleName.MANGAKA), {
        otpCode: '123456'
      })
    ).rejects.toBe(InvalidTransferStateException)
    expect(otp.validateOtpCode).not.toHaveBeenCalled()
    expect(otp.burnOtp).not.toHaveBeenCalled()
  })
})

// FINDING-BE-003 (flowtest 2026-07-11): createTransferContract từng nhận split tổng ≠ 100
// → thêm refine ở CreateTransferContractSchema (PB-09: newOwnershipSplit tổng PHẢI = 100).
describe('CreateTransferContractSchema — ownership split validation (PB-09)', () => {
  const base = {
    transferRequestId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    transferAmount: 5000,
    transferType: 'PARTIAL_TRANSFER',
    coOwnerApprovalRequired: false
  }

  it('split tổng = 100 → parse OK', () => {
    const r = CreateTransferContractSchema.safeParse({ ...base, newOwnershipSplit: { publisher: 70, A: 10, B: 20 } })
    expect(r.success).toBe(true)
  })

  it('split tổng = 90 → fail Error.InvalidOwnershipSplit', () => {
    const r = CreateTransferContractSchema.safeParse({ ...base, newOwnershipSplit: { A: 60, B: 30 } })
    expect(r.success).toBe(false)
    expect(JSON.stringify(r.success ? [] : r.error.issues)).toContain('Error.InvalidOwnershipSplit')
  })

  it('split có giá trị âm/quá 100 → fail', () => {
    const r = CreateTransferContractSchema.safeParse({ ...base, newOwnershipSplit: { A: -10, B: 110 } })
    expect(r.success).toBe(false)
  })

  it('uses the same ownership split validation for transfer contract responses', () => {
    const response = {
      id: 'contract-id',
      newOwnershipSplit: { publisher: 70, A: 10, B: 20 },
      coOwnerApprovalRequired: false,
      status: 'DRAFT',
      createdAt: new Date()
    }

    expect(TransferContractSchema.safeParse(response).success).toBe(true)
    expect(
      TransferContractSchema.safeParse({ ...response, newOwnershipSplit: { publisher: 60, A: 10, B: 20 } }).success
    ).toBe(false)
  })
})
