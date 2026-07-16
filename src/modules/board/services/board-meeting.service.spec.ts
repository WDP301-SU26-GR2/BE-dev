import { BoardMeetingService } from './board-meeting.service'

const SESSION_ID = 'a'.repeat(24)
const CREATOR = 'b'.repeat(24)
const MEMBER = 'c'.repeat(24)
const OUTSIDER = 'd'.repeat(24)

const baseSession = () => ({
  id: SESSION_ID,
  creatorId: CREATOR,
  allowedEditorIds: [MEMBER],
  status: 'ACTIVE',
  phase: 'PRESENTING'
})

const makeDeps = () => ({
  boardRepo: {
    findSessionById: jest.fn().mockResolvedValue(baseSession()),
    updateSessionPhase: jest
      .fn()
      .mockImplementation((id: string, phase: string) => Promise.resolve({ ...baseSession(), id, phase })),
    createBoardMessage: jest
      .fn()
      .mockImplementation((data: Record<string, unknown>) =>
        Promise.resolve({ id: 'e'.repeat(24), createdAt: new Date('2026-07-17T00:00:00Z'), ...data })
      ),
    findMessagesBySession: jest.fn().mockResolvedValue({
      items: [
        {
          id: 'e'.repeat(24),
          sessionId: SESSION_ID,
          senderId: MEMBER,
          content: 'hello',
          phase: 'QA',
          createdAt: new Date('2026-07-17T00:00:00Z')
        }
      ],
      total: 1
    }),
    findUsersMiniByIds: jest
      .fn()
      .mockResolvedValue([{ id: MEMBER, name: 'Member Name', displayName: 'MemberDN', avatar: null }])
  },
  auditService: { record: jest.fn().mockResolvedValue(undefined) }
})

const make = (deps = makeDeps()) => ({
  service: new BoardMeetingService(deps.boardRepo as never, deps.auditService as never),
  deps
})

describe('BoardMeetingService.advancePhase', () => {
  it('advances PRESENTING to QA, audits the transition, and returns a broadcast payload', async () => {
    const { service, deps } = make()

    const result = await service.advancePhase(SESSION_ID, CREATOR, 'EDITOR', 'QA')

    expect(deps.boardRepo.updateSessionPhase).toHaveBeenCalledWith(SESSION_ID, 'QA')
    expect(deps.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: CREATOR,
        entityType: 'BOARD_SESSION',
        entityId: SESSION_ID,
        action: 'PHASE_ADVANCED',
        fromState: 'PRESENTING',
        toState: 'QA'
      })
    )
    expect(result.broadcast).toEqual({ sessionId: SESSION_ID, phase: 'QA' })
  })

  it('allows a forward skip from PRESENTING to VOTING', async () => {
    const { service } = make()
    await expect(service.advancePhase(SESSION_ID, CREATOR, 'EDITOR', 'VOTING')).resolves.toMatchObject({
      session: { phase: 'VOTING' }
    })
  })

  it.each(['PRESENTING', 'QA'] as const)('rejects a backward or same transition from QA to %s', async (target) => {
    const deps = makeDeps()
    deps.boardRepo.findSessionById.mockResolvedValue({ ...baseSession(), phase: 'QA' })
    const { service } = make(deps)

    await expect(service.advancePhase(SESSION_ID, CREATOR, 'EDITOR', target)).rejects.toMatchObject({
      status: 409
    })
    expect(deps.boardRepo.updateSessionPhase).not.toHaveBeenCalled()
  })

  it('rejects a non-creator but allows SUPER_ADMIN', async () => {
    const { service } = make()
    await expect(service.advancePhase(SESSION_ID, OUTSIDER, 'EDITOR', 'QA')).rejects.toMatchObject({
      status: 403
    })
    await expect(service.advancePhase(SESSION_ID, OUTSIDER, 'SUPER_ADMIN', 'QA')).resolves.toMatchObject({
      session: { phase: 'QA' }
    })
  })

  it('preserves SessionNotOpen as 409 and maps malformed ids to 404', async () => {
    const deps = makeDeps()
    deps.boardRepo.findSessionById.mockResolvedValue({ ...baseSession(), status: 'UPCOMING' })
    const { service } = make(deps)

    await expect(service.advancePhase(SESSION_ID, CREATOR, 'EDITOR', 'QA')).rejects.toMatchObject({
      status: 409
    })
    await expect(service.advancePhase('trash', CREATOR, 'EDITOR', 'QA')).rejects.toMatchObject({ status: 404 })
  })

  it('keeps a committed phase update successful when best-effort audit rejects', async () => {
    const deps = makeDeps()
    deps.auditService.record.mockRejectedValue(new Error('audit unavailable'))
    const { service } = make(deps)

    await expect(service.advancePhase(SESSION_ID, CREATOR, 'EDITOR', 'QA')).resolves.toMatchObject({
      session: { phase: 'QA' }
    })
  })
})

describe('BoardMeetingService.sendMessage', () => {
  it('persists a trimmed QA message with a phase snapshot and resolves its sender', async () => {
    const deps = makeDeps()
    deps.boardRepo.findSessionById.mockResolvedValue({ ...baseSession(), phase: 'QA' })
    const { service } = make(deps)

    const result = await service.sendMessage(MEMBER, 'BOARD_MEMBER', SESSION_ID, ' hello ')

    expect(result).toMatchObject({
      status: 'SUCCESS',
      message: { content: 'hello', phase: 'QA', sender: { id: MEMBER, displayName: 'MemberDN', avatar: null } }
    })
    expect(deps.boardRepo.createBoardMessage).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      senderId: MEMBER,
      content: 'hello',
      phase: 'QA'
    })
  })

  it('enforces participant, active-session, voting-phase, input, and malformed-id denial reasons', async () => {
    const deps = makeDeps()
    const { service } = make(deps)

    await expect(service.sendMessage(OUTSIDER, 'BOARD_MEMBER', SESSION_ID, 'x')).resolves.toEqual({
      status: 'DENIED',
      reason: 'NOT_PARTICIPANT'
    })
    await expect(service.sendMessage(OUTSIDER, 'BOARD_MEMBER', SESSION_ID, '   ')).resolves.toEqual({
      status: 'DENIED',
      reason: 'NOT_PARTICIPANT'
    })
    deps.boardRepo.findSessionById.mockResolvedValue({ ...baseSession(), status: 'UPCOMING' })
    await expect(service.sendMessage(MEMBER, 'BOARD_MEMBER', SESSION_ID, 'x')).resolves.toEqual({
      status: 'DENIED',
      reason: 'SESSION_NOT_ACTIVE'
    })
    deps.boardRepo.findSessionById.mockResolvedValue({ ...baseSession(), phase: 'VOTING' })
    await expect(service.sendMessage(MEMBER, 'BOARD_MEMBER', SESSION_ID, 'x')).resolves.toEqual({
      status: 'DENIED',
      reason: 'VOTING_PHASE'
    })
    deps.boardRepo.findSessionById.mockResolvedValue(baseSession())
    await expect(service.sendMessage(MEMBER, 'BOARD_MEMBER', SESSION_ID, '   ')).resolves.toEqual({
      status: 'DENIED',
      reason: 'INVALID_INPUT'
    })
    await expect(service.sendMessage(MEMBER, 'BOARD_MEMBER', SESSION_ID, 'a'.repeat(1001))).resolves.toEqual({
      status: 'DENIED',
      reason: 'INVALID_INPUT'
    })
    await expect(service.sendMessage(MEMBER, 'BOARD_MEMBER', 'trash', 'x')).resolves.toEqual({
      status: 'DENIED',
      reason: 'NOT_PARTICIPANT'
    })
    expect(deps.boardRepo.createBoardMessage).not.toHaveBeenCalled()
  })

  it('allows the creator and SUPER_ADMIN, falling back from displayName to name', async () => {
    const { service } = make()
    await expect(service.sendMessage(CREATOR, 'EDITOR', SESSION_ID, 'hi')).resolves.toMatchObject({ status: 'SUCCESS' })

    const deps = makeDeps()
    deps.boardRepo.findUsersMiniByIds.mockResolvedValue([
      { id: OUTSIDER, name: 'Super Admin', displayName: null, avatar: null }
    ])
    const result = await make(deps).service.sendMessage(OUTSIDER, 'SUPER_ADMIN', SESSION_ID, 'hi')
    expect(result).toMatchObject({ status: 'SUCCESS', message: { sender: { displayName: 'Super Admin' } } })
  })
})

describe('BoardMeetingService.listMessages', () => {
  it('returns participant history with batch-resolved senders and forwards pagination', async () => {
    const { service, deps } = make()

    const result = await service.listMessages(MEMBER, 'BOARD_MEMBER', SESSION_ID, { limit: 50, offset: 0 })

    expect(deps.boardRepo.findMessagesBySession).toHaveBeenCalledWith(SESSION_ID, { limit: 50, offset: 0 })
    expect(deps.boardRepo.findUsersMiniByIds).toHaveBeenCalledWith([MEMBER])
    expect(result).toMatchObject({ total: 1, items: [{ sender: { displayName: 'MemberDN' } }] })
  })

  it('allows creator and SUPER_ADMIN to read history', async () => {
    const { service } = make()
    await expect(service.listMessages(CREATOR, 'EDITOR', SESSION_ID, { limit: 10, offset: 2 })).resolves.toMatchObject({
      total: 1
    })
    await expect(
      service.listMessages(OUTSIDER, 'SUPER_ADMIN', SESSION_ID, { limit: 10, offset: 2 })
    ).resolves.toMatchObject({ total: 1 })
  })

  it('rejects outsiders with 403 and malformed ids with 404 before reading messages', async () => {
    const { service, deps } = make()
    await expect(service.listMessages(OUTSIDER, 'MANGAKA', SESSION_ID, { limit: 50, offset: 0 })).rejects.toMatchObject(
      { status: 403 }
    )
    await expect(service.listMessages(MEMBER, 'BOARD_MEMBER', 'trash', { limit: 50, offset: 0 })).rejects.toMatchObject(
      {
        status: 404
      }
    )
    expect(deps.boardRepo.findMessagesBySession).not.toHaveBeenCalled()
  })
})
