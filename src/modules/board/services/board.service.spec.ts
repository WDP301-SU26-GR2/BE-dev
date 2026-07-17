import { BoardService } from './board.service'
import { DomainEvent } from 'src/core/events/domain-events'
import * as Errors from '../errors/board.errors'

const auditService = { record: jest.fn().mockResolvedValue(undefined) }
const boardSessionStateService = {
  transition: jest.fn().mockImplementation((id: string, status: string) => Promise.resolve({ id, status }))
}
const boardRosterService = { suggest: jest.fn() }
const boardMeetingService = { advancePhase: jest.fn(), listMessages: jest.fn() }

describe('BoardService.castVote → BoardDecisionFinalized emit idempotency', () => {
  const activeSession = {
    id: '012345678901234567890123',
    status: 'ACTIVE',
    phase: 'VOTING',
    allowedEditorIds: ['b1', 'b2', 'b3', 'b4']
  }

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
      boardSessionStateService as never,
      boardRosterService as never,
      boardMeetingService as never
    )
    return { service, eventBus, auditService: { record: auditService.record } }
  }

  it('emits once when result flips PENDING_QUORUM → APPROVED', async () => {
    const preVotes = [
      { voterId: 'b1', voteValue: 'APPROVE' },
      { voterId: 'b2', voteValue: 'APPROVE' }
    ]
    const pushedVotes = [...preVotes, { voterId: 'b3', voteValue: 'APPROVE' }]
    const { service, eventBus } = makeService('PENDING_QUORUM', preVotes, pushedVotes)
    await service.castVote('012345678901234567890124', 'b3', { voteValue: 'APPROVE' } as never)
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
    await expect(
      service.castVote('012345678901234567890124', 'b4', { voteValue: 'APPROVE' } as never)
    ).rejects.toMatchObject({ status: 409 })
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
      boardSessionStateService as never,
      boardRosterService as never,
      boardMeetingService as never
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
      boardSessionStateService as never,
      boardRosterService as never,
      boardMeetingService as never
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
      boardSessionStateService as never,
      boardRosterService as never,
      boardMeetingService as never
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
  const activeSession = {
    id: '012345678901234567890123',
    status: 'ACTIVE',
    phase: 'VOTING',
    allowedEditorIds: ['b1', 'b2', 'b3']
  }

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
      state as never,
      boardRosterService as never,
      boardMeetingService as never
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
      state as never,
      boardRosterService as never,
      boardMeetingService as never
    )
    await expect(service.castVote('garbage', 'b1', { voteValue: 'APPROVE' } as never)).rejects.toMatchObject({
      status: 404
    })
    expect(boardRepo.findDecisionById).not.toHaveBeenCalled()
  })

  it('castVote: flip PENDING_QUORUM → APPROVED records audit DECISION_FINALIZED', async () => {
    const preVotes = [{ voterId: 'b1', voteValue: 'APPROVE' }]
    const pushedVotes = [...preVotes, { voterId: 'b2', voteValue: 'APPROVE' }]
    const { service, audit } = makeService('PENDING_QUORUM', preVotes, pushedVotes)
    await service.castVote('012345678901234567890124', 'b2', { voteValue: 'APPROVE' } as never)
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DECISION_FINALIZED',
        fromState: 'PENDING_QUORUM',
        toState: 'APPROVED',
        entityId: '012345678901234567890124'
      })
    )
  })

  it.each(['APPROVED', 'REJECTED', 'EXPIRED'])(
    'castVote: terminal result %s → 409 before pushing a vote',
    async (result) => {
      const previousVote = { voterId: 'b1', voteValue: 'APPROVE' }
      const { service, boardRepo } = makeService(result, [previousVote], [previousVote])

      await expect(service.castVote('012345678901234567890124', 'b1', { voteValue: 'APPROVE' } as never)).rejects.toBe(
        Errors.DecisionAlreadyFinalizedException
      )
      expect(boardRepo.pushVoteToDecision).not.toHaveBeenCalled()
    }
  )

  it('castVote checks phase before terminal state', async () => {
    const { service, boardRepo } = makeService('APPROVED', [], [{ voterId: 'b1', voteValue: 'APPROVE' }])
    boardRepo.findSessionById.mockResolvedValue({ ...activeSession, phase: 'PRESENTING' })

    await expect(service.castVote('012345678901234567890124', 'b1', { voteValue: 'APPROVE' } as never)).rejects.toBe(
      Errors.VotingNotOpenException
    )
    expect(boardRepo.pushVoteToDecision).not.toHaveBeenCalled()
  })

  it('castVote rejects an ACTIVE roster member before VOTING without writing a vote', async () => {
    const { service, boardRepo } = makeService('PENDING', [], [{ voterId: 'b1', voteValue: 'APPROVE' }])
    boardRepo.findSessionById.mockResolvedValue({ ...activeSession, phase: 'PRESENTING' })

    await expect(service.castVote('012345678901234567890124', 'b1', { voteValue: 'APPROVE' } as never)).rejects.toBe(
      Errors.VotingNotOpenException
    )
    expect(boardRepo.pushVoteToDecision).not.toHaveBeenCalled()
  })

  it('castVote checks roster before phase so an outsider still receives 403 on PRESENTING', async () => {
    const { service, boardRepo } = makeService('PENDING', [], [{ voterId: 'outsider', voteValue: 'APPROVE' }])
    boardRepo.findSessionById.mockResolvedValue({ ...activeSession, phase: 'PRESENTING' })

    await expect(
      service.castVote('012345678901234567890124', 'outsider', { voteValue: 'APPROVE' } as never)
    ).rejects.toBe(Errors.VoterNotAllowedException)
    expect(boardRepo.pushVoteToDecision).not.toHaveBeenCalled()
  })
})

describe('BoardService read response enrichment (Spec 16)', () => {
  const SESSION_ID = 'a'.repeat(24)
  const DECISION_ID = 'b'.repeat(24)
  const CREATOR_ID = 'c'.repeat(24)
  const MEMBER_1 = 'd'.repeat(24)
  const MEMBER_2 = 'e'.repeat(24)
  const SERIES_ID = 'f'.repeat(24)

  function makeReadService() {
    const session = {
      id: SESSION_ID,
      creatorId: CREATOR_ID,
      allowedEditorIds: [MEMBER_1, MEMBER_2]
    }
    const decision = { id: DECISION_ID, targetSeriesId: SERIES_ID }
    const boardRepo = {
      findManySessions: jest.fn().mockResolvedValue([session]),
      findSessionById: jest.fn().mockResolvedValue(session),
      findUsersMiniByIds: jest.fn().mockResolvedValue([
        { id: CREATOR_ID, name: 'Creator Name', displayName: null, avatar: null },
        { id: MEMBER_1, name: 'Member One', displayName: 'Member DN', avatar: 'avatar.png' },
        { id: MEMBER_2, name: 'Member Two', displayName: null, avatar: null }
      ]),
      findManyDecisions: jest.fn().mockResolvedValue([decision]),
      findDecisionById: jest.fn().mockResolvedValue(decision),
      findSeriesTitlesByIds: jest.fn().mockResolvedValue([{ id: SERIES_ID, title: 'Series Title' }])
    }
    const service = new BoardService(
      boardRepo as never,
      { broadcastVoteProgress: jest.fn(), broadcastPhaseChanged: jest.fn() } as never,
      { notifySafe: jest.fn() } as never,
      { emit: jest.fn() } as never,
      { record: jest.fn() } as never,
      { transition: jest.fn() } as never,
      boardRosterService as never,
      boardMeetingService as never
    )
    return { service, boardRepo, session, decision }
  }

  it('enriches session list and detail with creator and ordered roster members in one batch query', async () => {
    const { service, boardRepo } = makeReadService()

    const sessions = await service.getSessions({ userId: MEMBER_1 }, { mine: true, status: 'ACTIVE' })
    const detail = await service.getSessionById(SESSION_ID)

    expect(boardRepo.findManySessions).toHaveBeenCalledWith({ participantId: MEMBER_1, status: 'ACTIVE' })
    expect(boardRepo.findUsersMiniByIds).toHaveBeenNthCalledWith(1, [CREATOR_ID, MEMBER_1, MEMBER_2])
    expect(sessions[0]).toMatchObject({
      creator: { id: CREATOR_ID, displayName: 'Creator Name', avatar: null },
      members: [
        { id: MEMBER_1, displayName: 'Member DN', avatar: 'avatar.png' },
        { id: MEMBER_2, displayName: 'Member Two', avatar: null }
      ]
    })
    expect(detail.creator.displayName).toBe('Creator Name')
    expect(detail.members).toHaveLength(2)
  })

  it('enriches decision list/detail with targetSeries and returns null when no target exists', async () => {
    const { service, boardRepo } = makeReadService()

    const decisions = await service.getDecisions()
    const detail = await service.getDecisionDetails(DECISION_ID)
    boardRepo.findDecisionById.mockResolvedValue({ id: DECISION_ID, targetSeriesId: null })
    const withoutTarget = await service.getDecisionDetails(DECISION_ID)

    expect(boardRepo.findSeriesTitlesByIds).toHaveBeenNthCalledWith(1, [SERIES_ID])
    expect(decisions[0].targetSeries).toEqual({ id: SERIES_ID, title: 'Series Title' })
    expect(detail.targetSeries).toEqual({ id: SERIES_ID, title: 'Series Title' })
    expect(withoutTarget.targetSeries).toBeNull()
  })

  it('passes both decision filters to the repository', async () => {
    const { service, boardRepo } = makeReadService()

    await service.getDecisions({ boardSessionId: SESSION_ID, targetSeriesId: SERIES_ID })

    expect(boardRepo.findManyDecisions).toHaveBeenCalledWith({
      boardSessionId: SESSION_ID,
      targetSeriesId: SERIES_ID
    })
  })

  it('returns an empty list for malformed targetSeriesId without calling the repository', async () => {
    const { service, boardRepo } = makeReadService()

    const result = await service.getDecisions({ targetSeriesId: 'garbage' })

    expect(result).toEqual([])
    expect(boardRepo.findManyDecisions).not.toHaveBeenCalled()
  })
})

describe('BoardService.castVote quorum by session roster (Spec 17)', () => {
  const DECISION_ID = '012345678901234567890124'
  const SESSION_ID = '012345678901234567890123'

  function makeVote(value: 'APPROVE' | 'REJECT' | 'ABSTAIN', index: number) {
    return { voterId: `b${index + 1}`, voteValue: value }
  }

  function makeService(rosterSize: number, voteValues: Array<'APPROVE' | 'REJECT' | 'ABSTAIN'>) {
    const pushedVotes = voteValues.map(makeVote)
    const preVotes = pushedVotes.slice(0, -1)
    const voterId = pushedVotes.at(-1)!.voterId
    const decision = {
      id: DECISION_ID,
      boardSessionId: SESSION_ID,
      decisionType: 'SERIALIZATION',
      targetSeriesId: 'ser1',
      details: null,
      result: 'PENDING',
      votes: preVotes
    }
    const boardRepo = {
      findDecisionById: jest.fn().mockResolvedValue(decision),
      findSessionById: jest.fn().mockResolvedValue({
        id: SESSION_ID,
        status: 'ACTIVE',
        phase: 'VOTING',
        allowedEditorIds: Array.from({ length: rosterSize }, (_, index) => `b${index + 1}`)
      }),
      pushVoteToDecision: jest.fn().mockResolvedValue({ votes: pushedVotes }),
      getActiveConfig: jest.fn().mockResolvedValue({ quorumMin: 99, approveMajorityRatio: 0.5 }),
      updateDecisionCounters: jest
        .fn()
        .mockImplementation((_id, counters) => Promise.resolve({ id: DECISION_ID, ...counters }))
    }
    const service = new BoardService(
      boardRepo as never,
      { broadcastVoteProgress: jest.fn() } as never,
      { notifySafe: jest.fn() } as never,
      { emit: jest.fn() } as never,
      { record: jest.fn() } as never,
      boardSessionStateService as never,
      boardRosterService as never,
      boardMeetingService as never
    )
    return { service, boardRepo, voterId, voteValue: pushedVotes.at(-1)!.voteValue }
  }

  it.each([
    { rosterSize: 3, votes: ['APPROVE', 'APPROVE'], expected: 'APPROVED' },
    { rosterSize: 3, votes: ['APPROVE', 'REJECT'], expected: 'PENDING' },
    { rosterSize: 3, votes: ['REJECT', 'REJECT'], expected: 'REJECTED' },
    { rosterSize: 3, votes: ['APPROVE', 'REJECT', 'ABSTAIN'], expected: 'REJECTED' },
    { rosterSize: 5, votes: ['APPROVE', 'APPROVE', 'APPROVE', 'REJECT'], expected: 'APPROVED' },
    { rosterSize: 5, votes: ['APPROVE', 'APPROVE', 'REJECT', 'REJECT'], expected: 'PENDING' },
    { rosterSize: 5, votes: ['APPROVE', 'REJECT', 'REJECT', 'REJECT'], expected: 'REJECTED' }
  ] as const)('roster $rosterSize with $votes → $expected', async ({ rosterSize, votes, expected }) => {
    const { service, boardRepo, voterId, voteValue } = makeService(rosterSize, [...votes])

    await service.castVote(DECISION_ID, voterId, { voteValue })

    expect(boardRepo.updateDecisionCounters).toHaveBeenCalledWith(
      DECISION_ID,
      expect.objectContaining({ result: expected })
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
      stateService as never,
      boardRosterService as never,
      boardMeetingService as never
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

describe('BoardService.createSession — roster source (Spec 12)', () => {
  const SERIES_ID = '012345678901234567890124'

  function makeCreateDeps() {
    const boardRepo = {
      findActiveSessionByTitle: jest.fn().mockResolvedValue(null),
      createSession: jest.fn().mockResolvedValue({ id: '012345678901234567890123' })
    }
    const boardRosterService = { suggest: jest.fn() }
    const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
    const service = new BoardService(
      boardRepo as never,
      { broadcastVoteProgress: jest.fn() } as never,
      notificationService as never,
      { emit: jest.fn() } as never,
      { record: jest.fn() } as never,
      { transition: jest.fn() } as never,
      boardRosterService as never,
      boardMeetingService as never
    )
    return { service, boardRepo, boardRosterService }
  }

  const baseDto: any = { title: 'Pitch X', startTime: new Date() }

  it('auto-assigns the roster when allowedEditorIds is omitted and seriesId is given', async () => {
    const { service, boardRepo, boardRosterService } = makeCreateDeps()
    boardRosterService.suggest.mockResolvedValue({
      items: [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }],
      size: 3
    })
    await service.createSession('creator', { ...baseDto, seriesId: SERIES_ID })
    expect(boardRosterService.suggest).toHaveBeenCalledWith(SERIES_ID, undefined)
    expect(boardRepo.createSession).toHaveBeenCalledWith('creator', expect.anything(), ['a', 'b', 'c'])
  })

  it('passes rosterSize through to the engine', async () => {
    const { service, boardRosterService } = makeCreateDeps()
    boardRosterService.suggest.mockResolvedValue({
      items: [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }, { userId: 'd' }, { userId: 'e' }],
      size: 5
    })
    await service.createSession('creator', { ...baseDto, seriesId: SERIES_ID, rosterSize: 5 })
    expect(boardRosterService.suggest).toHaveBeenCalledWith(SERIES_ID, 5)
  })

  it('does NOT auto-assign when allowedEditorIds is provided (backward-compatible)', async () => {
    const { service, boardRepo, boardRosterService } = makeCreateDeps()
    await service.createSession('creator', { ...baseDto, allowedEditorIds: ['x', 'y', 'z'] })
    expect(boardRosterService.suggest).not.toHaveBeenCalled()
    expect(boardRepo.createSession).toHaveBeenCalledWith('creator', expect.anything(), ['x', 'y', 'z'])
  })

  it('throws when neither allowedEditorIds nor seriesId is given', async () => {
    const { service } = makeCreateDeps()
    await expect(service.createSession('creator', { ...baseDto })).rejects.toBe(Errors.RosterSourceRequiredException)
  })

  it('still rejects an EVEN roster passed by hand (B-BRD-05 defense-in-depth)', async () => {
    const { service } = makeCreateDeps()
    await expect(service.createSession('creator', { ...baseDto, allowedEditorIds: ['x', 'y'] })).rejects.toBe(
      Errors.InvalidBoardMembersException
    )
  })
})
