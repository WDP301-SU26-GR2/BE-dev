import * as Errors from '../errors/board.errors'
import { BoardSessionWorkflowService } from './board-session-workflow.service'

const SESSION_ID = '0123456789abcdef01234567'

describe('BoardSessionWorkflowService focused delegation', () => {
  it('delegates roster suggestions without repository access', async () => {
    const roster = { suggest: jest.fn().mockResolvedValue({ items: [{ userId: 'member' }] }) }
    const service = new BoardSessionWorkflowService({} as never, {} as never, {} as never, roster as never, {} as never)

    await expect(service.suggestBoardMembers('series', 5)).resolves.toEqual({ items: [{ userId: 'member' }] })
    expect(roster.suggest).toHaveBeenCalledWith('series', 5)
  })

  it('rejects malformed manual-start ids before state mutation', async () => {
    const state = { transition: jest.fn() }
    const service = new BoardSessionWorkflowService({} as never, {} as never, state as never, {} as never, {} as never)

    await expect(service.startSessionManually('malformed')).rejects.toBe(Errors.SessionNotFoundException)
    expect(state.transition).not.toHaveBeenCalled()
  })

  it('delegates a valid manual start to the single state writer', async () => {
    const state = { transition: jest.fn().mockResolvedValue({ id: SESSION_ID, status: 'ACTIVE' }) }
    const service = new BoardSessionWorkflowService({} as never, {} as never, state as never, {} as never, {} as never)

    await expect(service.startSessionManually(SESSION_ID)).resolves.toMatchObject({ status: 'ACTIVE' })
    expect(state.transition).toHaveBeenCalledWith(SESSION_ID, 'ACTIVE', null)
  })
})
