import { BoardQueryService } from './board-query.service'

const DECISION_ID = '507f1f77bcf86cd799439012'
const SESSION_ID = '507f1f77bcf86cd799439013'
const SERIES_ID = '507f191e810c19729de860ea'

function make(repoOverrides: Record<string, unknown>) {
  const boardRepo = {
    findDecisionById: jest.fn(),
    findSessionById: jest.fn(),
    findManyDecisions: jest.fn(),
    ...repoOverrides
  }
  const service = new BoardQueryService(boardRepo as never)
  return { service, boardRepo }
}

describe('BoardService transfer authorization query', () => {
  it('returns decision semantics with the union of decision and session rosters', async () => {
    const { service } = make({
      findDecisionById: jest.fn().mockResolvedValue({
        id: DECISION_ID,
        boardSessionId: SESSION_ID,
        targetSeriesId: SERIES_ID,
        decisionType: 'TRANSFER',
        result: 'APPROVED',
        allowedEditorIds: ['board-decision']
      }),
      findSessionById: jest.fn().mockResolvedValue({
        id: SESSION_ID,
        allowedEditorIds: ['board-session']
      })
    })

    await expect(service.getTransferDecisionContext(DECISION_ID)).resolves.toEqual({
      id: DECISION_ID,
      boardSessionId: SESSION_ID,
      targetSeriesId: SERIES_ID,
      transferRequestId: null,
      decisionType: 'TRANSFER',
      result: 'APPROVED',
      allowedEditorIds: ['board-decision', 'board-session']
    })
  })

  it('resolves compatibility session only to terminal TRANSFER decisions', async () => {
    const approved = {
      id: DECISION_ID,
      boardSessionId: SESSION_ID,
      targetSeriesId: SERIES_ID,
      decisionType: 'TRANSFER',
      result: 'APPROVED',
      allowedEditorIds: []
    }
    const { service, boardRepo } = make({
      findManyDecisions: jest
        .fn()
        .mockResolvedValue([
          approved,
          { ...approved, id: '507f1f77bcf86cd799439014', decisionType: 'CONTRACT' },
          { ...approved, id: '507f1f77bcf86cd799439015', result: 'PENDING' }
        ]),
      findDecisionById: jest.fn().mockResolvedValue(approved),
      findSessionById: jest.fn().mockResolvedValue({ id: SESSION_ID, allowedEditorIds: ['board-1'] })
    })

    await expect(service.findTerminalTransferDecisionContextsBySession(SESSION_ID, SERIES_ID)).resolves.toEqual([
      expect.objectContaining({ id: DECISION_ID, allowedEditorIds: ['board-1'] })
    ])
    expect(boardRepo.findManyDecisions).toHaveBeenCalledWith({
      boardSessionId: SESSION_ID,
      targetSeriesId: SERIES_ID
    })
  })
})
