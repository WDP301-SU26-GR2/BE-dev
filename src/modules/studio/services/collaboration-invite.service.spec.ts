import { CollaborationInviteService } from './collaboration-invite.service'

function make() {
  const studioRepository = {
    findUserWithRole: jest.fn(),
    findPendingInviteForPair: jest.fn().mockResolvedValue(null),
    createInvite: jest.fn(),
    findInviteById: jest.fn(),
    updateInviteStatus: jest.fn(),
    listInvites: jest.fn().mockResolvedValue([]),
    countInvites: jest.fn().mockResolvedValue(0),
    acceptInvite: jest.fn()
  }
  const studioAssignmentService = { findActiveForPair: jest.fn().mockResolvedValue(null) }
  const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const service = new CollaborationInviteService(
    studioRepository as never,
    studioAssignmentService as never,
    notificationService as never
  )
  return { service, studioRepository, studioAssignmentService, notificationService }
}

const ASSISTANT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const MANGAKA_ID = 'mmmmmmmmmmmmmmmmmmmmmmmm'
const INVITE_ID = 'cccccccccccccccccccccccc'
const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString()

const validBody = {
  assistantId: ASSISTANT_ID,
  seriesId: undefined,
  hireStart: future(1),
  hireEnd: future(30),
  taskTypes: ['BACKGROUND'] as const
}

const inviteRow = {
  id: INVITE_ID,
  mangakaId: MANGAKA_ID,
  assistantId: ASSISTANT_ID,
  seriesId: null,
  hireStart: new Date(validBody.hireStart),
  hireEnd: new Date(validBody.hireEnd),
  taskTypes: ['BACKGROUND'],
  status: 'PENDING',
  createdAt: new Date('2026-06-29T00:00:00.000Z')
}

describe('CollaborationInviteService.create', () => {
  it('creates a PENDING invite for an active assistant', async () => {
    const { service, studioRepository, notificationService } = make()
    studioRepository.findUserWithRole.mockResolvedValueOnce({
      id: ASSISTANT_ID,
      status: 'ACTIVE',
      role: { code: 'ASSISTANT' }
    })
    studioRepository.createInvite.mockResolvedValueOnce(inviteRow)
    const res = await service.create(MANGAKA_ID, validBody as never)
    expect(res.status).toBe('PENDING')
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: ASSISTANT_ID,
        referenceType: 'INVITE_RECEIVED',
        content: expect.any(String)
      })
    )
  })

  it('rejects when target is not an assistant', async () => {
    const { service, studioRepository } = make()
    studioRepository.findUserWithRole.mockResolvedValueOnce({
      id: ASSISTANT_ID,
      status: 'ACTIVE',
      role: { code: 'EDITOR' }
    })
    await expect(service.create(MANGAKA_ID, validBody as never)).rejects.toBeDefined()
  })

  it('rejects when assistant not found', async () => {
    const { service, studioRepository } = make()
    studioRepository.findUserWithRole.mockResolvedValueOnce(null)
    await expect(service.create(MANGAKA_ID, validBody as never)).rejects.toBeDefined()
  })

  it('rejects invalid hire period (end <= start)', async () => {
    const { service, studioRepository } = make()
    studioRepository.findUserWithRole.mockResolvedValueOnce({
      id: ASSISTANT_ID,
      status: 'ACTIVE',
      role: { code: 'ASSISTANT' }
    })
    await expect(
      service.create(MANGAKA_ID, { ...validBody, hireStart: future(30), hireEnd: future(1) } as never)
    ).rejects.toBeDefined()
  })

  it('rejects when a pending invite already exists', async () => {
    const { service, studioRepository } = make()
    studioRepository.findUserWithRole.mockResolvedValueOnce({
      id: ASSISTANT_ID,
      status: 'ACTIVE',
      role: { code: 'ASSISTANT' }
    })
    studioRepository.findPendingInviteForPair.mockResolvedValueOnce(inviteRow)
    await expect(service.create(MANGAKA_ID, validBody as never)).rejects.toBeDefined()
  })

  it('rejects when an active assignment already exists', async () => {
    const { service, studioRepository, studioAssignmentService } = make()
    studioRepository.findUserWithRole.mockResolvedValueOnce({
      id: ASSISTANT_ID,
      status: 'ACTIVE',
      role: { code: 'ASSISTANT' }
    })
    studioAssignmentService.findActiveForPair.mockResolvedValueOnce({ id: 'x' })
    await expect(service.create(MANGAKA_ID, validBody as never)).rejects.toBeDefined()
  })
})

describe('CollaborationInviteService.accept', () => {
  it('accepts a pending invite by the invitee and returns the assignment', async () => {
    const { service, studioRepository, notificationService } = make()
    studioRepository.findInviteById.mockResolvedValueOnce(inviteRow)
    studioRepository.acceptInvite.mockResolvedValueOnce({
      ok: true,
      assignment: {
        id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        mangakaId: MANGAKA_ID,
        assistantId: ASSISTANT_ID,
        seriesId: null,
        hireStart: inviteRow.hireStart,
        hireEnd: inviteRow.hireEnd,
        assignedTaskTypes: ['BACKGROUND'],
        status: 'ACTIVE',
        terminatedReason: null,
        createdAt: new Date('2026-06-29T00:00:00.000Z')
      }
    })
    const res = await service.accept(ASSISTANT_ID, INVITE_ID)
    expect(res.status).toBe('ACTIVE')
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: MANGAKA_ID,
        referenceType: 'INVITE_ACCEPTED',
        content: expect.any(String)
      })
    )
  })

  it('rejects when caller is not the invitee', async () => {
    const { service, studioRepository } = make()
    studioRepository.findInviteById.mockResolvedValueOnce(inviteRow)
    await expect(service.accept('someone-else', INVITE_ID)).rejects.toBeDefined()
  })

  it('rejects when repo reports DUPLICATE_ACTIVE', async () => {
    const { service, studioRepository } = make()
    studioRepository.findInviteById.mockResolvedValueOnce(inviteRow)
    studioRepository.acceptInvite.mockResolvedValueOnce({ ok: false, reason: 'DUPLICATE_ACTIVE' })
    await expect(service.accept(ASSISTANT_ID, INVITE_ID)).rejects.toBeDefined()
  })

  it('rejects when repo reports NOT_PENDING', async () => {
    const { service, studioRepository } = make()
    studioRepository.findInviteById.mockResolvedValueOnce(inviteRow)
    studioRepository.acceptInvite.mockResolvedValueOnce({ ok: false, reason: 'NOT_PENDING' })
    await expect(service.accept(ASSISTANT_ID, INVITE_ID)).rejects.toBeDefined()
  })

  it('rejects malformed id', async () => {
    const { service } = make()
    await expect(service.accept(ASSISTANT_ID, 'bad')).rejects.toBeDefined()
  })
})

describe('CollaborationInviteService.decline / cancel', () => {
  it('declines a pending invite by invitee', async () => {
    const { service, studioRepository, notificationService } = make()
    studioRepository.findInviteById.mockResolvedValueOnce(inviteRow)
    studioRepository.updateInviteStatus.mockResolvedValueOnce({ ...inviteRow, status: 'DECLINED' })
    const res = await service.decline(ASSISTANT_ID, INVITE_ID)
    expect(res.status).toBe('DECLINED')
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: MANGAKA_ID,
        referenceType: 'INVITE_DECLINED',
        content: expect.any(String)
      })
    )
  })

  it('cancels a pending invite by owner', async () => {
    const { service, studioRepository } = make()
    studioRepository.findInviteById.mockResolvedValueOnce(inviteRow)
    studioRepository.updateInviteStatus.mockResolvedValueOnce({ ...inviteRow, status: 'CANCELLED' })
    const res = await service.cancel(MANGAKA_ID, INVITE_ID)
    expect(res.status).toBe('CANCELLED')
  })

  it('cancel rejects when caller is not owner', async () => {
    const { service, studioRepository } = make()
    studioRepository.findInviteById.mockResolvedValueOnce(inviteRow)
    await expect(service.cancel('not-owner', INVITE_ID)).rejects.toBeDefined()
  })

  it('decline rejects when invite not pending', async () => {
    const { service, studioRepository } = make()
    studioRepository.findInviteById.mockResolvedValueOnce({ ...inviteRow, status: 'ACCEPTED' })
    await expect(service.decline(ASSISTANT_ID, INVITE_ID)).rejects.toBeDefined()
  })
})
