import { BoardGateway } from './board.gateway'
import { RoleName } from 'src/core/security/constants/role.constant'
import { createAdapter } from '@socket.io/redis-adapter'

const redisAdapter = { name: 'redis-adapter' }

jest.mock('@socket.io/redis-adapter', () => ({ createAdapter: jest.fn() }))

const SESSION_ID = '0123456789abcdef01234567'

function makeDeps() {
  const subRedis = {} as any
  return {
    wsRedis: { duplicate: jest.fn().mockReturnValue(subRedis) } as any,
    subRedis,
    tokenService: { verifyAccessToken: jest.fn() } as any,
    boardRepo: { findSessionById: jest.fn() } as any,
    boardMeetingService: { sendMessage: jest.fn() } as any
  }
}
function makeGateway(d: ReturnType<typeof makeDeps>) {
  return new BoardGateway(d.wsRedis, d.tokenService, d.boardRepo, d.boardMeetingService)
}
function makeSocket(token?: string) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return {
    id: 'sock1',
    handshake: { auth: token ? { token } : {}, headers: {} },
    data: {} as Record<string, any>,
    disconnect: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined)
  } as any
}

describe('BoardGateway auth (Fix-1 G-9)', () => {
  it('afterInit duplicates the injected WS Redis client and installs its adapter', () => {
    const d = makeDeps()
    const gateway = makeGateway(d)
    const adapterSetter = jest.fn()
    gateway.server = { adapter: adapterSetter } as any
    ;(createAdapter as jest.Mock).mockReturnValue(redisAdapter)

    gateway.afterInit()

    expect(d.wsRedis.duplicate).toHaveBeenCalledTimes(1)
    expect(createAdapter).toHaveBeenCalledWith(d.wsRedis, d.subRedis)
    expect(adapterSetter).toHaveBeenCalledWith(redisAdapter)
  })

  it('closes the duplicated Redis subscriber during application shutdown', async () => {
    const subscriber = { status: 'ready', quit: jest.fn().mockResolvedValue('OK'), disconnect: jest.fn() }
    redis.duplicate.mockReturnValue(subscriber)
    gateway.afterInit()

    await gateway.onApplicationShutdown()

    expect(subscriber.quit).toHaveBeenCalledTimes(1)
  })

  it('handleConnection without token → disconnect(true)', async () => {
    const d = makeDeps()
    const socket = makeSocket()
    await makeGateway(d).handleConnection(socket)
    expect(socket.disconnect).toHaveBeenCalledWith(true)
  })

  it('handleConnection with invalid token → disconnect(true)', async () => {
    const d = makeDeps()
    d.tokenService.verifyAccessToken.mockRejectedValue(new Error('bad'))
    const socket = makeSocket('bad-token')
    await makeGateway(d).handleConnection(socket)
    expect(socket.disconnect).toHaveBeenCalledWith(true)
  })

  it('handleConnection with valid token → stores userId/roleName, no disconnect', async () => {
    const d = makeDeps()
    d.tokenService.verifyAccessToken.mockResolvedValue({ userId: 'u1', roleName: RoleName.BOARD_MEMBER })
    const socket = makeSocket('good')
    await makeGateway(d).handleConnection(socket)
    expect(socket.data.userId).toBe('u1')
    expect(socket.data.roleName).toBe(RoleName.BOARD_MEMBER)
    expect(socket.disconnect).not.toHaveBeenCalled()
  })

  it('joinSession: malformed sessionId → DENIED, repo untouched', async () => {
    const d = makeDeps()
    const socket = makeSocket()
    socket.data = { userId: 'u1', roleName: RoleName.BOARD_MEMBER }
    const res = await makeGateway(d).handleJoinSession({ sessionId: 'garbage' }, socket)
    expect(res).toMatchObject({ status: 'DENIED' })
    expect(d.boardRepo.findSessionById).not.toHaveBeenCalled()
  })

  it('joinSession: session not found → DENIED', async () => {
    const d = makeDeps()
    d.boardRepo.findSessionById.mockResolvedValue(null)
    const socket = makeSocket()
    socket.data = { userId: 'u1', roleName: RoleName.BOARD_MEMBER }
    const res = await makeGateway(d).handleJoinSession({ sessionId: SESSION_ID }, socket)
    expect(res).toMatchObject({ status: 'DENIED' })
  })

  it('joinSession: outsider (not roster/creator/admin) → DENIED, no join', async () => {
    const d = makeDeps()
    d.boardRepo.findSessionById.mockResolvedValue({ id: SESSION_ID, creatorId: 'c1', allowedEditorIds: ['m1', 'm2'] })
    const socket = makeSocket()
    socket.data = { userId: 'outsider', roleName: RoleName.ASSISTANT }
    const res = await makeGateway(d).handleJoinSession({ sessionId: SESSION_ID }, socket)
    expect(res).toMatchObject({ status: 'DENIED' })
    expect(socket.join).not.toHaveBeenCalled()
  })

  it.each([
    ['roster member', 'm1', RoleName.BOARD_MEMBER],
    ['creator', 'c1', RoleName.EDITOR],
    ['super admin', 'anyone', RoleName.SUPER_ADMIN]
  ])('joinSession: %s → SUCCESS + joins room', async (_label, userId, roleName) => {
    const d = makeDeps()
    d.boardRepo.findSessionById.mockResolvedValue({ id: SESSION_ID, creatorId: 'c1', allowedEditorIds: ['m1', 'm2'] })
    const socket = makeSocket()
    socket.data = { userId, roleName }
    const res = await makeGateway(d).handleJoinSession({ sessionId: SESSION_ID }, socket)
    expect(res).toMatchObject({ status: 'SUCCESS' })
    expect(socket.join).toHaveBeenCalledWith(`session_${SESSION_ID}`)
  })

  it('joinSession: no userId in socket.data (chưa handshake) → DENIED + disconnect', async () => {
    const d = makeDeps()
    const socket = makeSocket()
    // no socket.data.userId
    const res = await makeGateway(d).handleJoinSession({ sessionId: SESSION_ID }, socket)
    expect(res).toMatchObject({ status: 'DENIED' })
    expect(socket.disconnect).toHaveBeenCalledWith(true)
  })

  it('sendMessage: successful persistence broadcasts and returns an ISO timestamp', async () => {
    const d = makeDeps()
    const createdAt = new Date('2026-07-17T08:00:00.000Z')
    d.boardMeetingService.sendMessage.mockResolvedValue({
      status: 'SUCCESS',
      message: {
        id: 'message-1',
        sessionId: SESSION_ID,
        sender: { id: 'u1', displayName: 'Board Member', avatar: null },
        content: 'Question',
        phase: 'QA',
        createdAt
      }
    })
    const gateway = makeGateway(d)
    const broadcast = jest.spyOn(gateway, 'broadcastMessageReceived').mockImplementation()
    const socket = makeSocket()
    socket.data = { userId: 'u1', roleName: RoleName.BOARD_MEMBER }

    const result = await gateway.handleSendMessage({ sessionId: SESSION_ID, content: 'Question' }, socket)

    expect(d.boardMeetingService.sendMessage).toHaveBeenCalledWith('u1', RoleName.BOARD_MEMBER, SESSION_ID, 'Question')
    expect(broadcast).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ id: 'message-1', createdAt: createdAt.toISOString() })
    )
    expect(result).toEqual({
      status: 'SUCCESS',
      message: expect.objectContaining({ id: 'message-1', createdAt: createdAt.toISOString() })
    })
  })

  it('sendMessage: no userId in socket.data returns DENIED and disconnects', async () => {
    const d = makeDeps()
    const socket = makeSocket()

    const result = await makeGateway(d).handleSendMessage({ sessionId: SESSION_ID, content: 'Question' }, socket)

    expect(result).toEqual({ status: 'DENIED', reason: 'NOT_PARTICIPANT' })
    expect(socket.disconnect).toHaveBeenCalledWith(true)
    expect(d.boardMeetingService.sendMessage).not.toHaveBeenCalled()
  })

  it('broadcast methods emit their public event contracts to the session room', () => {
    const gateway = makeGateway(makeDeps())
    const emit = jest.fn()
    const to = jest.fn().mockReturnValue({ emit })
    gateway.server = { to } as any

    gateway.broadcastPhaseChanged(SESSION_ID, 'VOTING')
    gateway.broadcastMessageReceived(SESSION_ID, { id: 'message-1' })

    expect(to).toHaveBeenNthCalledWith(1, `session_${SESSION_ID}`)
    expect(emit).toHaveBeenNthCalledWith(1, 'phaseChanged', { sessionId: SESSION_ID, phase: 'VOTING' })
    expect(to).toHaveBeenNthCalledWith(2, `session_${SESSION_ID}`)
    expect(emit).toHaveBeenNthCalledWith(2, 'messageReceived', { id: 'message-1' })
  })
})
