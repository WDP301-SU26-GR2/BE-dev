import { BoardService } from './board.service'
import { DomainEvent } from 'src/core/events/domain-events'

describe('BoardService.castVote → BoardDecisionFinalized emit idempotency', () => {
  const activeSession = { id: 's', status: 'ACTIVE', allowedEditorIds: ['b1', 'b2', 'b3', 'b4'] }

  // preVotes = state BEFORE this vote (used for double-vote check + `before.result`);
  // pushedVotes = state AFTER pushVote (used to recompute counters).
  function makeService(preResult: string, preVotes: any[], pushedVotes: any[]) {
    const preDecision = {
      id: 'd1',
      boardSessionId: 's',
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
      updateDecisionCounters: jest.fn().mockResolvedValue({ id: 'd1' })
    }
    const boardGateway = { broadcastVoteProgress: jest.fn() }
    const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
    const eventBus = { emit: jest.fn() }
    const service = new BoardService(
      boardRepo as never,
      boardGateway as never,
      notificationService as never,
      eventBus as never
    )
    return { service, eventBus }
  }

  it('emits once when result flips PENDING_QUORUM → APPROVED', async () => {
    const { service, eventBus } = makeService('PENDING_QUORUM', [], [{ voterId: 'b1', voteValue: 'APPROVE' }])
    await service.castVote('d1', 'b1', { voteValue: 'APPROVE' } as never)
    expect(eventBus.emit).toHaveBeenCalledTimes(1)
    expect(eventBus.emit).toHaveBeenCalledWith(
      DomainEvent.BoardDecisionFinalized,
      expect.objectContaining({
        decisionId: 'd1',
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
    await service.castVote('d1', 'b4', { voteValue: 'APPROVE' } as never)
    expect(eventBus.emit).not.toHaveBeenCalled()
  })
})

describe('BoardService notifications', () => {
  it('sends notifications when a board session is created', async () => {
    const boardRepo = {
      findActiveSessionByTitle: jest.fn().mockResolvedValue(null),
      createSession: jest.fn().mockResolvedValue({ id: 'session-1' })
    }
    const boardGateway = { broadcastVoteProgress: jest.fn() }
    const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }

    const service = new BoardService(boardRepo as never, boardGateway as never, notificationService as never)

    await service.createSession('editor-1', {
      title: 'Board meeting',
      description: 'desc',
      allowedEditorIds: ['board-1', 'board-2'],
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
