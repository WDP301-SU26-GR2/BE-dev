import { BoardSessionStateService } from './board-session-state.service'
import { SessionNotFoundException, InvalidBoardSessionTransitionException } from '../errors/board.errors'

function make() {
  const boardRepo = {
    findSessionById: jest.fn(),
    updateSessionStatus: jest.fn()
  }
  const auditService = { record: jest.fn().mockResolvedValue(undefined) }
  const svc = new BoardSessionStateService(boardRepo as never, auditService as never)
  return { svc, boardRepo, auditService }
}

describe('BoardSessionStateService.transition', () => {
  it('UPCOMING → ACTIVE ok', async () => {
    const { svc, boardRepo, auditService } = make()
    boardRepo.findSessionById.mockResolvedValue({ id: '012345678901234567890123', status: 'UPCOMING' })
    boardRepo.updateSessionStatus.mockResolvedValue({ status: 'ACTIVE' })
    await svc.transition('012345678901234567890123', 'ACTIVE', null)
    expect(boardRepo.updateSessionStatus).toHaveBeenCalled()
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SESSION_TRANSITION',
        fromState: 'UPCOMING',
        toState: 'ACTIVE'
      })
    )
  })

  it('ACTIVE → ACTIVE → InvalidBoardSessionTransitionException (409)', async () => {
    const { svc, boardRepo } = make()
    boardRepo.findSessionById.mockResolvedValue({ id: '012345678901234567890123', status: 'ACTIVE' })
    await expect(svc.transition('012345678901234567890123', 'ACTIVE', null)).rejects.toBe(
      InvalidBoardSessionTransitionException
    )
  })

  it('malformed id → SessionNotFoundException (404)', async () => {
    const { svc, boardRepo } = make()
    await expect(svc.transition('garbage', 'ACTIVE', null)).rejects.toBe(SessionNotFoundException)
    expect(boardRepo.findSessionById).not.toHaveBeenCalled()
  })

  it('session not found → SessionNotFoundException (404)', async () => {
    const { svc, boardRepo } = make()
    boardRepo.findSessionById.mockResolvedValue(null)
    await expect(svc.transition('012345678901234567890123', 'ACTIVE', null)).rejects.toBe(SessionNotFoundException)
    expect(boardRepo.updateSessionStatus).not.toHaveBeenCalled()
  })
})
