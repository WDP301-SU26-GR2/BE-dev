import { BoardService } from './board.service'
import { DomainEvent } from 'src/core/events/domain-events'

const auditService = { record: jest.fn().mockResolvedValue(undefined) }
const boardSessionStateService = {
  transition: jest.fn().mockImplementation((id: string, status: string) => Promise.resolve({ id, status }))
}

describe('BoardService.castVote → BoardDecisionFinalized emit idempotency', () => {
  const activeSession = { id: '012345678901234567890123', status: 'ACTIVE', allowedEditorIds: ['b1', 'b2', 'b3', 'b4'] }

  // preVotes = state BEFORE this vote (used for double-vote check + `before.result`);
  // pushedVotes = state AFTER pushVote (used to recompute counters).
  function makeService(preResult: string, preVotes: any[], pushedVotes: any[]) {
    const preDecision = {
      id: '012345678901234567890124',
      boardSessionId: '012345678901234567890123',
      decisionType: 'SERIALIZATION',
      targetSeriesId: 'ser1',
      details: { magazine: 'WJ' },
      result: preResult,
      votes: preVotes
    }
    const boardRepo = {
      findDecisionById: jest.fn().mockResolvedValue(preDecision),
      findSessionById: jest.fn().mockResolvedValue(activeSession),
      pushVoteToDecision: jest.fn().mockResolvedValue({ votes: pushedVotes }),
      getActiveConfig: jest.fn().mockResolvedValue({ quorumMin: 1, approveMajorityRatio: 0.5 }),
      updateDecisionCounters: jest.fn().mockResolvedValue({ id: '012345678901234567890124' })
    }
    const boardGateway = { broadcastVoteProgress: jest.fn() }
    const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
    const eventBus = { emit: jest.fn() }
    const service = new BoardService(
      boardRepo as never,
      boardGateway as never,
      notificationService as never,
      eventBus as never,
      auditService as never,
      boardSessionStateService as never
    )
    return { service, eventBus, auditService: { record: auditService.record } }
  }

  it('emits once when result flips PENDING_QUORUM → APPROVED', async () => {
    const { service, eventBus } = makeService('PENDING_QUORUM', [], [{ voterId: 'b1', voteValue: 'APPROVE' }])
    await service.castVote('012345678901234567890124', 'b1', { voteValue: 'APPROVE' } as never)
    expect(eventBus.emit).toHaveBeenCalledTimes(1)
    expect(eventBus.emit).toHaveBeenCalledWith(
      DomainEvent.BoardDecisionFinalized,
      expect.objectContaining({
        decisionId: '012345678901234567890124',
        decisionType: 'SERIALIZATION',
        targetSeriesId: 'ser1',
        result: 'APPROVED'
      })
    )
  })

  it('does NOT re-emit when the decision was already APPROVED', async () => {
    const preVotes = [
      { voterId: 'b1', voteValue: 'APPROVE' },
      { voterId: 'b2', voteValue: 'APPROVE' },
      { voterId: 'b3', voteValue: 'APPROVE' }
    ]
    const pushedVotes = [...preVotes, { voterId: 'b4', voteValue: 'APPROVE' }]
    const { service, eventBus } = makeService('APPROVED', preVotes, pushedVotes)
    await service.castVote('012345678901234567890124', 'b4', { voteValue: 'APPROVE' } as never)
    expect(eventBus.emit).not.toHaveBeenCalled()
  })
})

describe('BoardService notifications', () => {
  it('sends notifications when a board session is created (odd allowedEditorIds)', async () => {
    const boardRepo = {
      findActiveSessionByTitle: jest.fn().mockResolvedValue(null),
      createSession: jest.fn().mockResolvedValue({ id: 'session-1' })
    }
    const boardGateway = { broadcastVoteProgress: jest.fn() }
    const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
    const eventBus = { emit: jest.fn() }

    const service = new BoardService(
      boardRepo as never,
      boardGateway as never,
      notificationService as never,
      eventBus as never,
      auditService as never,
      boardSessionStateService as never
    )

    await service.createSession('editor-1', {
      title: 'Board meeting',
      description: 'desc',
      allowedEditorIds: ['board-1', 'board-2', 'board-3'],
      startTime: new Date('2030-01-01T00:00:00.000Z')
    })

    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'editor-1',
        type: 'BOARD',
        referenceType: 'BOARD_SESSION_CREATED'
      })
    )
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'board-1',
        type: 'BOARD',
        referenceType: 'BOARD_SESSION_CREATED'
      })
    )
  })
})

describe('BoardService odd-size enforcement (B-BRD-05)', () => {
  function makeSessionService() {
    const boardRepo = {
      findActiveSessionByTitle: jest.fn().mockResolvedValue(null),
      createSession: jest.fn().mockResolvedValue({ id: 'session-1' })
    }
    const boardGateway = { broadcastVoteProgress: jest.fn() }
    const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
    const eventBus = { emit: jest.fn() }
    const service = new BoardService(
      boardRepo as never,
      boardGateway as never,
      notificationService as never,
      eventBus as never,
      auditService as never,
      boardSessionStateService as never
    )
    return { service, boardRepo }
  }

  function makeDecisionService(sessionOverride: { id: string; creatorId: string; allowedEditorIds: string[] } | null) {
    const boardRepo = {
      findSessionById: jest.fn().mockResolvedValue(sessionOverride),
      createDecision: jest.fn().mockResolvedValue({ id: 'decision-1' })
    }
    const boardGateway = { broadcastVoteProgress: jest.fn() }
    const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
    const eventBus = { emit: jest.fn() }
    const service = new BoardService(
      boardRepo as never,
      boardGateway as never,
      notificationService as never,
      eventBus as never,
      auditService as never,
      boardSessionStateService as never
    )
    return { service, boardRepo }
  }

  it('createSession: even allowedEditorIds → InvalidBoardMembersException (422)', async () => {
    // 4 items: passes schema .min(3), but hits service guard (4%2===0 → InvalidBoardMembersException).
    const { service, boardRepo } = makeSessionService()
    await expect(
      service.createSession('creator', {
        title: 'Smoke Spec7 Even 1',
        allowedEditorIds: ['board-1', 'board-2', 'editor-1', 'editor-2']
      } as never)
    ).rejects.toMatchObject({ status: 422 })
    expect(boardRepo.createSession).not.toHaveBeenCalled()
  })

  it('createSession: empty allowedEditorIds → InvalidBoardMembersException', async () => {
    const { service, boardRepo } = makeSessionService()
    await expect(
      service.createSession('creator', {
        title: 'S',
        allowedEditorIds: []
      } as never)
    ).rejects.toMatchObject({ status: 422 })
    expect(boardRepo.createSession).not.toHaveBeenCalled()
  })

  it('createSession: odd allowedEditorIds → OK', async () => {
    const { service, boardRepo } = makeSessionService()
    await service.createSession('creator', {
      title: 'Smoke Spec7 Odd 1',
      allowedEditorIds: ['board-1', 'board-2', 'board-3']
    } as never)
    expect(boardRepo.createSession).toHaveBeenCalled()
  })

  it('createDecision: session roster even → InvalidBoardMembersException', async () => {
    // 4 items: passes schema .min(3), but hits service guard (4%2===0 → InvalidBoardMembersException).
    const { service, boardRepo } = makeDecisionService({
      id: 's',
      creatorId: 'c',
      allowedEditorIds: ['a', 'b', 'c', 'd']
    })
    await expect(
      service.createDecision({
        boardSessionId: 's',
        decisionType: 'SERIALIZATION',
        targetSeriesId: '507f1f77bcf86cd799439011'
      } as never)
    ).rejects.toMatchObject({ status: 422 })
    expect(boardRepo.createDecision).not.toHaveBeenCalled()
  })

  it('createDecision: session roster odd → OK', async () => {
    const { service, boardRepo } = makeDecisionService({ id: 's', creatorId: 'c', allowedEditorIds: ['a', 'b', 'c'] })
    await service.createDecision({
      boardSessionId: 's',
      decisionType: 'SERIALIZATION',
      targetSeriesId: '507f1f77bcf86cd799439011'
    } as never)
    expect(boardRepo.createDecision).toHaveBeenCalled()
  })
})

describe('BoardService castVote ObjectId guard + DECISION_FINALIZED audit', () => {
  const activeSession = { id: '012345678901234567890123', status: 'ACTIVE', allowedEditorIds: ['b1', 'b2', 'b3'] }

  function makeService(preResult: string, preVotes: any[], pushedVotes: any[]) {
    const preDecision = {
      id: '012345678901234567890124',
      boardSessionId: '012345678901234567890123',
      decisionType: 'SERIALIZATION',
      targetSeriesId: 'ser1',
      details: { magazine: 'WJ' },
      result: preResult,
      votes: preVotes
    }
    const boardRepo = {
      findDecisionById: jest.fn().mockResolvedValue(preDecision),
      findSessionById: jest.fn().mockResolvedValue(activeSession),
      pushVoteToDecision: jest.fn().mockResolvedValue({ votes: pushedVotes }),
      getActiveConfig: jest.fn().mockResolvedValue({ quorumMin: 1, approveMajorityRatio: 0.5 }),
      updateDecisionCounters: jest.fn().mockResolvedValue({ id: '012345678901234567890124' })
    }
    const boardGateway = { broadcastVoteProgress: jest.fn() }
    const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
    const eventBus = { emit: jest.fn() }
    const audit = { record: jest.fn().mockResolvedValue(undefined) }
    const state = {
      transition: jest.fn().mockImplementation((id: string, status: string) => Promise.resolve({ id, status }))
    }
    const service = new BoardService(
      boardRepo as never,
      boardGateway as never,
      notificationService as never,
      eventBus as never,
      audit as never,
      state as never
    )
    return { service, boardRepo, audit, state }
  }

  it('castVote: malformed decisionId → 404 (no repo call, no 500)', async () => {
    const boardRepo = {
      findDecisionById: jest.fn(),
      findSessionById: jest.fn()
    }
    const boardGateway = { broadcastVoteProgress: jest.fn() }
    const notificationService = { notifySafe: jest.fn() }
    const eventBus = { emit: jest.fn() }
    const audit = { record: jest.fn() }
    const state = { transition: jest.fn() }
    const service = new BoardService(
      boardRepo as never,
      boardGateway as never,
      notificationService as never,
      eventBus as never,
      audit as never,
      state as never
    )
    await expect(service.castVote('garbage', 'b1', { voteValue: 'APPROVE' } as never)).rejects.toMatchObject({
      status: 404
    })
    expect(boardRepo.findDecisionById).not.toHaveBeenCalled()
  })

  it('castVote: flip PENDING_QUORUM → APPROVED records audit DECISION_FINALIZED', async () => {
    const { service, audit } = makeService('PENDING_QUORUM', [], [{ voterId: 'b1', voteValue: 'APPROVE' }])
    await service.castVote('012345678901234567890124', 'b1', { voteValue: 'APPROVE' } as never)
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DECISION_FINALIZED',
        fromState: 'PENDING_QUORUM',
        toState: 'APPROVED',
        entityId: '012345678901234567890124'
      })
    )
  })
})

describe('BoardService.concludeSession (Fix-2 G-7)', () => {
  const SESSION_ID = '012345678901234567890123'

  function makeConcludeService(decisions: any[], sessionOverride: any = {}) {
    const boardRepo = {
      findSessionById: jest.fn().mockResolvedValue({
        id: SESSION_ID,
        status: 'ACTIVE',
        creatorId: 'creator1',
        allowedEditorIds: ['b1', 'b2', 'b3'],
        ...sessionOverride
      }),
      findNonTerminalDecisionsBySession: jest.fn().mockResolvedValue(decisions),
      updateDecisionCounters: jest.fn().mockResolvedValue({}),
      findDecisionById: jest.fn(),
      getActiveConfig: jest.fn(),
      pushVoteToDecision: jest.fn()
    }
    const boardGateway = { broadcastVoteProgress: jest.fn() }
    const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
    const eventBus = { emit: jest.fn() }
    const audit = { record: jest.fn().mockResolvedValue(undefined) }
    const stateService = {
      transition: jest.fn().mockResolvedValue({ id: SESSION_ID, status: 'CONCLUDED' })
    }
    const service = new BoardService(
      boardRepo as never,
      boardGateway as never,
      notificationService as never,
      eventBus as never,
      audit as never,
      stateService as never
    )
    return { service, boardRepo, notificationService, eventBus, audit, stateService }
  }

  it('creator concludes -> transition CONCLUDED, expires pending decisions, audits, notifies, no domain event', async () => {
    const d = makeConcludeService([
      { id: 'dec1', result: 'PENDING_QUORUM' },
      { id: 'dec2', result: null }
    ])
    await d.service.concludeSession(SESSION_ID, 'creator1', 'EDITOR')
    expect(d.stateService.transition).toHaveBeenCalledWith(SESSION_ID, 'CONCLUDED', 'creator1')
    expect(d.boardRepo.updateDecisionCounters).toHaveBeenCalledWith(
      'dec1',
      expect.objectContaining({ result: 'EXPIRED' })
    )
    expect(d.boardRepo.updateDecisionCounters).toHaveBeenCalledWith(
      'dec2',
      expect.objectContaining({ result: 'EXPIRED' })
    )
    expect(d.audit.record).toHaveBeenCalledTimes(2)
    expect(d.notificationService.notifySafe).toHaveBeenCalled()
    expect(d.eventBus.emit).not.toHaveBeenCalled()
  })

  it('non-creator non-admin -> 403 NotSessionCreator, nothing mutated', async () => {
    const d = makeConcludeService([])
    await expect(d.service.concludeSession(SESSION_ID, 'someone-else', 'EDITOR')).rejects.toMatchObject({
      status: 403
    })
    expect(d.stateService.transition).not.toHaveBeenCalled()
  })

  it('SUPER_ADMIN may conclude any session', async () => {
    const d = makeConcludeService([])
    await d.service.concludeSession(SESSION_ID, 'admin1', 'SUPER_ADMIN')
    expect(d.stateService.transition).toHaveBeenCalled()
  })

  it('system actor skips the creator check', async () => {
    const d = makeConcludeService([])
    await d.service.concludeSession(SESSION_ID, null, null)
    expect(d.stateService.transition).toHaveBeenCalledWith(SESSION_ID, 'CONCLUDED', null)
  })

  it('no pending decisions -> still concludes, no decision writes', async () => {
    const d = makeConcludeService([])
    await d.service.concludeSession(SESSION_ID, 'creator1', 'EDITOR')
    expect(d.boardRepo.updateDecisionCounters).not.toHaveBeenCalled()
    expect(d.notificationService.notifySafe).toHaveBeenCalled()
  })
})
