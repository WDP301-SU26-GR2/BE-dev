import * as Errors from '../errors/board.errors'
import { BoardGovernanceService } from './board-governance.service'

const CONFIG_ID = '0123456789abcdef01234567'
const DECISION_ID = '1123456789abcdef01234567'

function setup() {
  const repository = {
    findDecisionById: jest.fn(),
    findSessionById: jest.fn(),
    createSeriesReport: jest.fn().mockResolvedValue({ id: 'report' }),
    findConfigById: jest.fn(),
    findFirstOpenSession: jest.fn(),
    updateConfig: jest.fn().mockResolvedValue({ id: CONFIG_ID })
  }
  return { repository, service: new BoardGovernanceService(repository as never) }
}

describe('BoardGovernanceService report authorization and config locking', () => {
  const report = {
    boardDecisionId: DECISION_ID,
    seriesId: 'series',
    reportType: 'PERFORMANCE',
    content: 'Analysis',
    attachments: []
  }

  it.each(['malformed', DECISION_ID])('rejects malformed or missing report decision: %s', async (decisionId) => {
    const fixture = setup()
    fixture.repository.findDecisionById.mockResolvedValue(null)

    await expect(fixture.service.createSeriesReport('editor', { ...report, boardDecisionId: decisionId })).rejects.toBe(
      Errors.DecisionNotFoundException
    )
    expect(fixture.repository.findDecisionById).toHaveBeenCalledTimes(decisionId === DECISION_ID ? 1 : 0)
  })

  it('rejects a decision whose parent session disappeared', async () => {
    const fixture = setup()
    fixture.repository.findDecisionById.mockResolvedValue({ boardSessionId: 'session' })
    fixture.repository.findSessionById.mockResolvedValue(null)

    await expect(fixture.service.createSeriesReport('editor', report)).rejects.toBe(Errors.SessionNotFoundException)
  })

  it('rejects reports after the session is concluded', async () => {
    const fixture = setup()
    fixture.repository.findDecisionById.mockResolvedValue({ boardSessionId: 'session' })
    fixture.repository.findSessionById.mockResolvedValue({ status: 'CONCLUDED', allowedEditorIds: ['editor'] })

    await expect(fixture.service.createSeriesReport('editor', report)).rejects.toBe(Errors.SessionClosedReportException)
    expect(fixture.repository.createSeriesReport).not.toHaveBeenCalled()
  })

  it('rejects an editor who was not invited to the session', async () => {
    const fixture = setup()
    fixture.repository.findDecisionById.mockResolvedValue({ boardSessionId: 'session' })
    fixture.repository.findSessionById.mockResolvedValue({ status: 'ACTIVE', allowedEditorIds: ['other'] })

    await expect(fixture.service.createSeriesReport('editor', report)).rejects.toBe(Errors.EditorNotInvitedException)
  })

  it('attributes an authorized report to its invited editor', async () => {
    const fixture = setup()
    fixture.repository.findDecisionById.mockResolvedValue({ boardSessionId: 'session' })
    fixture.repository.findSessionById.mockResolvedValue({ status: 'ACTIVE', allowedEditorIds: ['editor'] })

    await expect(fixture.service.createSeriesReport('editor', report)).resolves.toEqual({ id: 'report' })
    expect(fixture.repository.createSeriesReport).toHaveBeenCalledWith({ ...report, preparedBy: 'editor' })
  })

  it.each(['malformed', CONFIG_ID])('rejects malformed or missing config identity: %s', async (id) => {
    const fixture = setup()
    fixture.repository.findConfigById.mockResolvedValue(null)

    await expect(fixture.service.updateConfig(id, 'admin', {} as never)).rejects.toBe(
      Errors.BoardConfigNotFoundException
    )
    expect(fixture.repository.findConfigById).toHaveBeenCalledTimes(id === CONFIG_ID ? 1 : 0)
  })

  it('locks config changes while an active meeting exists', async () => {
    const fixture = setup()
    fixture.repository.findConfigById.mockResolvedValue({ id: CONFIG_ID })
    fixture.repository.findFirstOpenSession.mockResolvedValue({ id: 'session' })

    await expect(fixture.service.updateConfig(CONFIG_ID, 'admin', {} as never)).rejects.toBe(
      Errors.ConfigLockedException
    )
    expect(fixture.repository.updateConfig).not.toHaveBeenCalled()
  })

  it('persists an unlocked config update with actor attribution', async () => {
    const fixture = setup()
    fixture.repository.findConfigById.mockResolvedValue({ id: CONFIG_ID })
    fixture.repository.findFirstOpenSession.mockResolvedValue(null)
    const dto = {
      boardTotalMembers: 7,
      quorumMin: 5,
      approveMajorityRatio: 0.6,
      updatedBy: 'ignored-client'
    }

    await expect(fixture.service.updateConfig(CONFIG_ID, 'admin', dto)).resolves.toEqual({ id: CONFIG_ID })
    expect(fixture.repository.updateConfig).toHaveBeenCalledWith(CONFIG_ID, {
      ...dto,
      updatedBy: 'admin'
    })
  })
})
