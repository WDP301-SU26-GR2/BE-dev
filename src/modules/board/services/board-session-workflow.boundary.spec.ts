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

  const makeIds = (n: number) => Array.from({ length: n }, (_, i) => `0123456789abcdef0123456${i}`)

  it('rejects a manual roster larger than the configured cap before touching persistence', async () => {
    const boardRepo = {
      getActiveConfig: jest.fn().mockResolvedValue({ boardTotalMembers: 5 }),
      findActiveSessionByTitle: jest.fn(),
      createSession: jest.fn()
    }
    const service = new BoardSessionWorkflowService(
      boardRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    )
    const dto = { title: 'Phien hop lon', startTime: new Date().toISOString(), allowedEditorIds: makeIds(7) }

    await expect(service.createSession('creator', dto as never)).rejects.toBe(Errors.RosterSizeTooLargeException)
    expect(boardRepo.findActiveSessionByTitle).not.toHaveBeenCalled()
    expect(boardRepo.createSession).not.toHaveBeenCalled()
  })

  it('accepts a manual roster equal to the configured cap', async () => {
    const boardRepo = {
      getActiveConfig: jest.fn().mockResolvedValue({ boardTotalMembers: 5 }),
      findActiveSessionByTitle: jest.fn().mockResolvedValue(null),
      createSession: jest.fn().mockResolvedValue({ id: SESSION_ID })
    }
    const notification = { notifySafe: jest.fn().mockResolvedValue(undefined) }
    const service = new BoardSessionWorkflowService(
      boardRepo as never,
      notification as never,
      {} as never,
      {} as never,
      {} as never
    )
    const dto = { title: 'Phien hop vua', startTime: new Date().toISOString(), allowedEditorIds: makeIds(5) }

    await expect(service.createSession('creator', dto as never)).resolves.toMatchObject({ id: SESSION_ID })
    expect(boardRepo.createSession).toHaveBeenCalled()
  })
})
