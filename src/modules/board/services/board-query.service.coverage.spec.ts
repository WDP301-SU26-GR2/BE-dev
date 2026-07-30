import { $Enums } from '@prisma/client'
import * as Errors from '../errors/board.errors'
import { BoardQueryService } from './board-query.service'

const SESSION_ID = '0123456789abcdef01234567'
const DECISION_ID = '1123456789abcdef01234567'
const SERIES_ID = '2123456789abcdef01234567'
const REPORT_ID = '3123456789abcdef01234567'

function makeRepository() {
  return {
    getActiveConfig: jest.fn(),
    findManySessions: jest.fn().mockResolvedValue([]),
    findSessionById: jest.fn(),
    findManyDecisions: jest.fn().mockResolvedValue([]),
    findDecisionById: jest.fn(),
    findManyReports: jest.fn().mockResolvedValue([]),
    findReportById: jest.fn(),
    findUsersMiniByIds: jest.fn().mockResolvedValue([]),
    findSeriesTitlesByIds: jest.fn().mockResolvedValue([]),
    findMemberSessionIds: jest.fn().mockResolvedValue([])
  }
}

describe('BoardQueryService business query and transfer contexts', () => {
  it('returns the active config and rejects a missing config', async () => {
    const repository = makeRepository()
    const config = { id: 'config', quorumMin: 3 }
    repository.getActiveConfig.mockResolvedValueOnce(config).mockResolvedValueOnce(null)
    const service = new BoardQueryService(repository as never)

    await expect(service.getConfig()).resolves.toBe(config)
    await expect(service.getConfig()).rejects.toBe(Errors.BoardConfigNotFoundException)
  })

  it.each([
    { caller: undefined, query: undefined, expected: { participantId: undefined, status: undefined } },
    {
      caller: { userId: 'member' },
      query: { mine: false as const, status: $Enums.BoardSessionStatus.ACTIVE },
      expected: { participantId: undefined, status: $Enums.BoardSessionStatus.ACTIVE }
    },
    {
      caller: { userId: 'member' },
      query: { mine: true as const, status: $Enums.BoardSessionStatus.CONCLUDED },
      expected: { participantId: 'member', status: $Enums.BoardSessionStatus.CONCLUDED }
    },
    {
      caller: undefined,
      query: { mine: true as const },
      expected: { participantId: undefined, status: undefined }
    }
  ])('scopes session queries without leaking another participant: $expected', async ({ caller, query, expected }) => {
    const repository = makeRepository()
    const service = new BoardQueryService(repository as never)

    await service.getSessions(caller, query)

    expect(repository.findManySessions).toHaveBeenCalledWith(expected)
  })

  it('rejects a missing session after validating its ObjectId', async () => {
    const repository = makeRepository()
    repository.findSessionById.mockResolvedValue(null)
    const service = new BoardQueryService(repository as never)

    await expect(service.getSessionById(SESSION_ID)).rejects.toBe(Errors.SessionNotFoundException)
  })

  it('enriches session detail, de-duplicates users and omits unresolved roster members', async () => {
    const repository = makeRepository()
    repository.findSessionById.mockResolvedValue({
      id: SESSION_ID,
      creatorId: 'creator',
      allowedEditorIds: ['creator', 'member', 'missing', 'member']
    })
    repository.findUsersMiniByIds.mockResolvedValue([
      { id: 'creator', name: 'Creator', displayName: '', avatar: undefined },
      { id: 'member', name: 'Member', displayName: null, avatar: 'avatar.png' }
    ])
    const service = new BoardQueryService(repository as never)

    const result = await service.getSessionById(SESSION_ID)

    expect(repository.findUsersMiniByIds).toHaveBeenCalledWith(['creator', 'member', 'missing'])
    expect(result).toMatchObject({
      creator: { id: 'creator', displayName: '', avatar: null },
      members: [
        { id: 'creator', displayName: '', avatar: null },
        { id: 'member', displayName: 'Member', avatar: 'avatar.png' },
        { id: 'member', displayName: 'Member', avatar: 'avatar.png' }
      ]
    })
  })

  it.each([
    { query: { boardSessionId: 'bad' }, invalid: 'boardSessionId' },
    { query: { targetSeriesId: 'bad' }, invalid: 'targetSeriesId' },
    { query: { boardSessionId: SESSION_ID, targetSeriesId: 'bad' }, invalid: 'targetSeriesId' }
  ])('returns no decisions for malformed $invalid without repository access', async ({ query }) => {
    const repository = makeRepository()
    const service = new BoardQueryService(repository as never)

    await expect(service.getDecisions(query)).resolves.toEqual([])
    expect(repository.findManyDecisions).not.toHaveBeenCalled()
  })

  it('enriches decisions with unique series lookups and a null for unresolved or absent series', async () => {
    const repository = makeRepository()
    repository.findManyDecisions.mockResolvedValue([
      { id: 'd1', targetSeriesId: SERIES_ID },
      { id: 'd2', targetSeriesId: SERIES_ID },
      { id: 'd3', targetSeriesId: '4123456789abcdef01234567' },
      { id: 'd4', targetSeriesId: null }
    ])
    repository.findSeriesTitlesByIds.mockResolvedValue([{ id: SERIES_ID, title: 'Found' }])
    const service = new BoardQueryService(repository as never)

    const result = await service.getDecisions({ boardSessionId: SESSION_ID })

    expect(repository.findSeriesTitlesByIds).toHaveBeenCalledWith([SERIES_ID, '4123456789abcdef01234567'])
    expect(result.map((row) => row.targetSeries)).toEqual([
      { id: SERIES_ID, title: 'Found' },
      { id: SERIES_ID, title: 'Found' },
      null,
      null
    ])
  })

  it.each(['bad-id', DECISION_ID])('rejects decision detail when malformed or absent: %s', async (id) => {
    const repository = makeRepository()
    repository.findDecisionById.mockResolvedValue(null)
    const service = new BoardQueryService(repository as never)

    await expect(service.getDecisionDetails(id)).rejects.toBe(Errors.DecisionNotFoundException)
    expect(repository.findDecisionById).toHaveBeenCalledTimes(id === DECISION_ID ? 1 : 0)
  })

  it('returns decision votes and normalizes a legacy missing vote array', async () => {
    const repository = makeRepository()
    repository.findDecisionById
      .mockResolvedValueOnce({ id: DECISION_ID, votes: [{ voterId: 'member', voteValue: 'APPROVE' }] })
      .mockResolvedValueOnce({ id: DECISION_ID })
    const service = new BoardQueryService(repository as never)

    await expect(service.getDecisionVotes(DECISION_ID)).resolves.toEqual([{ voterId: 'member', voteValue: 'APPROVE' }])
    await expect(service.getDecisionVotes(DECISION_ID)).resolves.toEqual([])
  })

  it.each(['bad-id', DECISION_ID])('rejects vote lookup when decision is malformed or absent: %s', async (id) => {
    const repository = makeRepository()
    repository.findDecisionById.mockResolvedValue(null)
    const service = new BoardQueryService(repository as never)

    await expect(service.getDecisionVotes(id)).rejects.toBe(Errors.DecisionNotFoundException)
    expect(repository.findDecisionById).toHaveBeenCalledTimes(id === DECISION_ID ? 1 : 0)
  })

  it.each([
    { query: { seriesId: 'bad' }, invalid: 'seriesId' },
    { query: { boardDecisionId: 'bad' }, invalid: 'boardDecisionId' },
    { query: { seriesId: SERIES_ID, boardDecisionId: 'bad' }, invalid: 'boardDecisionId' }
  ])('returns no reports for malformed $invalid without repository access', async ({ query }) => {
    const repository = makeRepository()
    const service = new BoardQueryService(repository as never)

    await expect(service.getReports(query)).resolves.toEqual([])
    expect(repository.findManyReports).not.toHaveBeenCalled()
  })

  it('passes valid report filters through unchanged', async () => {
    const repository = makeRepository()
    repository.findManyReports.mockResolvedValue([{ id: REPORT_ID }])
    const service = new BoardQueryService(repository as never)

    await expect(service.getReports({ seriesId: SERIES_ID, boardDecisionId: DECISION_ID })).resolves.toEqual([
      { id: REPORT_ID }
    ])
    expect(repository.findManyReports).toHaveBeenCalledWith({
      seriesId: SERIES_ID,
      boardDecisionId: DECISION_ID
    })
  })

  it.each(['bad-id', REPORT_ID])('rejects report detail when malformed or absent: %s', async (id) => {
    const repository = makeRepository()
    repository.findReportById.mockResolvedValue(null)
    const service = new BoardQueryService(repository as never)

    await expect(service.getReportById(id)).rejects.toBe(Errors.ReportNotFoundException)
    expect(repository.findReportById).toHaveBeenCalledTimes(id === REPORT_ID ? 1 : 0)
  })

  it('returns report detail when found', async () => {
    const repository = makeRepository()
    const report = { id: REPORT_ID, seriesId: SERIES_ID }
    repository.findReportById.mockResolvedValue(report)
    const service = new BoardQueryService(repository as never)

    await expect(service.getReportById(REPORT_ID)).resolves.toBe(report)
  })

  it.each([
    { id: 'bad', decision: undefined, session: undefined },
    { id: DECISION_ID, decision: null, session: undefined },
    {
      id: DECISION_ID,
      decision: { id: DECISION_ID, boardSessionId: SESSION_ID },
      session: null
    }
  ])('returns null for unusable transfer decision context %#', async ({ id, decision, session }) => {
    const repository = makeRepository()
    repository.findDecisionById.mockResolvedValue(decision)
    repository.findSessionById.mockResolvedValue(session)
    const service = new BoardQueryService(repository as never)

    await expect(service.getTransferDecisionContext(id)).resolves.toBeNull()
  })

  // §v2 point 10: GET /board/decisions?mine=true chỉ trả decision thuộc phiên mà caller trong roster.
  it('mine=true restricts decisions to sessions where the caller is a roster member', async () => {
    const repository = makeRepository()
    repository.findMemberSessionIds.mockResolvedValue([{ id: 'sess-1' }, { id: 'sess-2' }])
    repository.findManyDecisions.mockResolvedValue([{ id: 'd1', targetSeriesId: null }])
    const service = new BoardQueryService(repository as never)

    await service.getDecisions({ mine: 'true' }, 'user-1')

    expect(repository.findMemberSessionIds).toHaveBeenCalledWith('user-1')
    expect(repository.findManyDecisions).toHaveBeenCalledWith(
      expect.objectContaining({ boardSessionIds: ['sess-1', 'sess-2'] })
    )
  })

  it('mine=true returns [] without querying decisions when the caller is in no roster', async () => {
    const repository = makeRepository()
    repository.findMemberSessionIds.mockResolvedValue([])
    const service = new BoardQueryService(repository as never)

    await expect(service.getDecisions({ mine: 'true' }, 'user-1')).resolves.toEqual([])
    expect(repository.findManyDecisions).not.toHaveBeenCalled()
  })

  it('builds a de-duplicated transfer context from decision and session editors', async () => {
    const repository = makeRepository()
    repository.findDecisionById.mockResolvedValue({
      id: DECISION_ID,
      boardSessionId: SESSION_ID,
      targetSeriesId: undefined,
      decisionType: undefined,
      result: undefined,
      allowedEditorIds: ['decision-member', 'shared']
    })
    repository.findSessionById.mockResolvedValue({
      id: SESSION_ID,
      allowedEditorIds: ['session-member', 'shared']
    })
    const service = new BoardQueryService(repository as never)

    await expect(service.getTransferDecisionContext(DECISION_ID)).resolves.toEqual({
      id: DECISION_ID,
      boardSessionId: SESSION_ID,
      targetSeriesId: null,
      transferRequestId: null,
      decisionType: null,
      result: null,
      allowedEditorIds: ['decision-member', 'shared', 'session-member']
    })
  })

  it.each([
    { sessionId: 'bad', seriesId: SERIES_ID },
    { sessionId: SESSION_ID, seriesId: 'bad' }
  ])('rejects malformed terminal transfer context filters', async ({ sessionId, seriesId }) => {
    const repository = makeRepository()
    const service = new BoardQueryService(repository as never)

    await expect(service.findTerminalTransferDecisionContextsBySession(sessionId, seriesId)).resolves.toEqual([])
    expect(repository.findManyDecisions).not.toHaveBeenCalled()
  })

  it('returns only terminal TRANSFER contexts and drops contexts whose session disappeared', async () => {
    const secondDecisionId = '5123456789abcdef01234567'
    const repository = makeRepository()
    repository.findManyDecisions.mockResolvedValue([
      {
        id: DECISION_ID,
        boardSessionId: SESSION_ID,
        targetSeriesId: SERIES_ID,
        decisionType: $Enums.DecisionType.TRANSFER,
        result: $Enums.BoardDecisionResult.APPROVED
      },
      {
        id: secondDecisionId,
        boardSessionId: SESSION_ID,
        targetSeriesId: SERIES_ID,
        decisionType: $Enums.DecisionType.TRANSFER,
        result: $Enums.BoardDecisionResult.REJECTED
      },
      {
        id: '6123456789abcdef01234567',
        decisionType: $Enums.DecisionType.TRANSFER,
        result: $Enums.BoardDecisionResult.PENDING
      },
      {
        id: '7123456789abcdef01234567',
        decisionType: $Enums.DecisionType.SERIALIZATION,
        result: $Enums.BoardDecisionResult.APPROVED
      }
    ])
    repository.findDecisionById.mockImplementation((id: string) =>
      Promise.resolve({
        id,
        boardSessionId: id === DECISION_ID ? SESSION_ID : '8123456789abcdef01234567',
        targetSeriesId: SERIES_ID,
        decisionType: $Enums.DecisionType.TRANSFER,
        result: id === DECISION_ID ? $Enums.BoardDecisionResult.APPROVED : $Enums.BoardDecisionResult.REJECTED,
        allowedEditorIds: []
      })
    )
    repository.findSessionById.mockImplementation((id: string) =>
      Promise.resolve(id === SESSION_ID ? { allowedEditorIds: ['member'] } : null)
    )
    const service = new BoardQueryService(repository as never)

    const result = await service.findTerminalTransferDecisionContextsBySession(SESSION_ID, SERIES_ID)

    expect(repository.findManyDecisions).toHaveBeenCalledWith({
      boardSessionId: SESSION_ID,
      targetSeriesId: SERIES_ID
    })
    expect(repository.findDecisionById).toHaveBeenCalledTimes(2)
    expect(result).toEqual([
      expect.objectContaining({
        id: DECISION_ID,
        result: $Enums.BoardDecisionResult.APPROVED,
        allowedEditorIds: ['member']
      })
    ])
  })
})
