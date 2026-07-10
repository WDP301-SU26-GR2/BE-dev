import { BoardGateway } from './board.gateway'
import { RoleName } from 'src/core/security/constants/role.constant'

const SESSION_ID = '0123456789abcdef01234567'

function makeDeps() {
  return {
    redis: { getClient: jest.fn().mockReturnValue({ duplicate: jest.fn() }) } as any,
    tokenService: { verifyAccessToken: jest.fn() } as any,
    boardRepo: { findSessionById: jest.fn() } as any
  }
}
function makeGateway(d: ReturnType<typeof makeDeps>) {
  return new BoardGateway(d.redis, d.tokenService, d.boardRepo)
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
})
