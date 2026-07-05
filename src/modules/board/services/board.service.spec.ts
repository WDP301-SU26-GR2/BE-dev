import { BoardService } from './board.service'

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
    } as any)

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
