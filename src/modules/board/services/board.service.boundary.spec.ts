import { BoardService } from './board.service'

describe('BoardService Phase-3 orchestrator boundary', () => {
  it('delegates query and transfer semantic lookups to BoardQueryService', async () => {
    const query = {
      getConfig: jest.fn().mockResolvedValue({ id: 'config' }),
      getTransferDecisionContext: jest.fn().mockResolvedValue({ id: 'decision', decisionType: 'TRANSFER' }),
      getContractDecisionContext: jest.fn().mockResolvedValue({ id: 'contract-decision', decisionType: 'CONTRACT' }),
      findApprovedContractDecisionContext: jest.fn().mockResolvedValue({ id: 'contract-decision' }),
      findTerminalTransferDecisionContextsBySession: jest.fn().mockResolvedValue([{ id: 'decision' }])
    }
    const service = Reflect.construct(BoardService, [query, {}, {}, {}, {}, {}]) as BoardService

    await expect(service.getConfig()).resolves.toEqual({ id: 'config' })
    await expect(service.getTransferDecisionContext('decision')).resolves.toMatchObject({ decisionType: 'TRANSFER' })
    await expect(service.getContractDecisionContext('contract-decision')).resolves.toMatchObject({
      decisionType: 'CONTRACT'
    })
    await expect(
      service.findApprovedContractDecisionContext({
        targetSeriesId: 'series',
        resourceType: 'TRANSFER_CONTRACT',
        resourceId: 'contract'
      })
    ).resolves.toEqual({ id: 'contract-decision' })
    await expect(service.findTerminalTransferDecisionContextsBySession('session', 'series')).resolves.toEqual([
      { id: 'decision' }
    ])
    expect(query.getTransferDecisionContext).toHaveBeenCalledWith('decision')
    expect(query.findTerminalTransferDecisionContextsBySession).toHaveBeenCalledWith('session', 'series')
  })

  it('delegates every controller read contract without reshaping arguments', async () => {
    const query = {
      getSessions: jest.fn().mockResolvedValue([]),
      getSessionById: jest.fn().mockResolvedValue({ id: 'session' }),
      getDecisions: jest.fn().mockResolvedValue([]),
      getDecisionDetails: jest.fn().mockResolvedValue({ id: 'decision' }),
      getDecisionVotes: jest.fn().mockResolvedValue([]),
      getReports: jest.fn().mockResolvedValue([]),
      getReportById: jest.fn().mockResolvedValue({ id: 'report' })
    }
    const service = Reflect.construct(BoardService, [query, {}, {}, {}, {}, {}]) as BoardService

    await service.getSessions({ userId: 'member' }, { mine: true, status: 'ACTIVE' })
    await service.getSessionById('session')
    await service.getDecisions({ boardSessionId: 'session', targetSeriesId: 'series' }, 'member')
    await service.getDecisionDetails('decision')
    await service.getDecisionVotes('decision')
    await service.getReports({ seriesId: 'series', boardDecisionId: 'decision' })
    await service.getReportById('report')

    expect(query.getSessions).toHaveBeenCalledWith({ userId: 'member' }, { mine: true, status: 'ACTIVE' })
    expect(query.getDecisions).toHaveBeenCalledWith({ boardSessionId: 'session', targetSeriesId: 'series' }, 'member')
    expect(query.getReports).toHaveBeenCalledWith({ seriesId: 'series', boardDecisionId: 'decision' })
  })

  it('delegates each mutation group to one focused use-case service', async () => {
    const session = {
      createSession: jest.fn().mockResolvedValue({ id: 'session' }),
      suggestBoardMembers: jest.fn().mockResolvedValue({ items: [] }),
      startSessionManually: jest.fn().mockResolvedValue({ id: 'session', status: 'ACTIVE' }),
      concludeSession: jest.fn().mockResolvedValue({ id: 'session', status: 'CONCLUDED' })
    }
    const decision = {
      createDecision: jest.fn().mockResolvedValue({ id: 'decision' }),
      castVote: jest.fn().mockResolvedValue({ message: 'Vote cast successfully' })
    }
    const meeting = {
      advancePhase: jest.fn().mockResolvedValue({
        session: { id: 'session', phase: 'QA' },
        broadcast: { sessionId: 'session', phase: 'QA' }
      }),
      listMessages: jest.fn().mockResolvedValue({ items: [], total: 0 })
    }
    const gateway = { broadcastPhaseChanged: jest.fn() }
    const governance = {
      createSeriesReport: jest.fn().mockResolvedValue({ id: 'report' }),
      updateConfig: jest.fn().mockResolvedValue({ id: 'config' })
    }
    const service = Reflect.construct(BoardService, [
      {},
      session,
      decision,
      meeting,
      gateway,
      governance
    ]) as BoardService

    await service.createSession('creator', { title: 'Board', startTime: new Date() })
    await service.suggestBoardMembers('series', 3)
    await service.startSessionManually('session')
    await service.concludeSession('session', 'creator', 'EDITOR')
    await service.createDecision({ boardSessionId: 'session' } as never)
    await service.castVote('decision', 'member', { voteValue: 'APPROVE' })
    await service.advancePhase('session', 'creator', 'EDITOR', 'QA')
    await service.getSessionMessages('session', 'member', 'BOARD_MEMBER', { limit: 10, offset: 0 })
    await service.createSeriesReport('editor', { boardDecisionId: 'decision' } as never)
    await service.updateConfig('config', 'admin', {} as never)

    expect(session.createSession).toHaveBeenCalled()
    expect(decision.castVote).toHaveBeenCalledWith('decision', 'member', { voteValue: 'APPROVE' })
    expect(meeting.listMessages).toHaveBeenCalledWith('member', 'BOARD_MEMBER', 'session', {
      limit: 10,
      offset: 0
    })
    expect(gateway.broadcastPhaseChanged).toHaveBeenCalledWith('session', 'QA')
    expect(governance.updateConfig).toHaveBeenCalled()
  })

  it('stays below the documented orchestrator size and dependency limits', () => {
    expect(BoardService.length).toBeLessThanOrEqual(6)
  })
})
