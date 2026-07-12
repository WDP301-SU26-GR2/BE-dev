import { AuditEntityType } from '@prisma/client'
import { MeService } from './me.service'
import { UserNotFoundException } from '../errors/users.errors'

const USER_ID = '012345678901234567890123'

const row = {
  id: USER_ID,
  email: 'a@b.com',
  name: 'Kishi',
  displayName: 'K',
  avatar: 'uploads/x.png',
  phoneNumber: '+84912345678',
  status: 'ACTIVE',
  emailVerified: true,
  mustChangePassword: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  role: { code: 'MANGAKA' }
}

function makeDeps() {
  return {
    repo: { findMeById: jest.fn().mockResolvedValue(row), updateMe: jest.fn().mockResolvedValue(row) },
    audit: { record: jest.fn().mockResolvedValue(undefined) }
  }
}
const make = (d: any) => new MeService(d.repo, d.audit)

describe('MeService', () => {
  it('getMe maps createdAt to ISO and never leaks password', async () => {
    const d = makeDeps()
    const out = await make(d).getMe(USER_ID)
    expect(out.createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(out.role).toBe('MANGAKA')
    expect(out).not.toHaveProperty('password')
  })

  it('getMe throws 404 when the user does not exist / is soft-deleted', async () => {
    const d = makeDeps()
    d.repo.findMeById.mockResolvedValue(null)
    await expect(make(d).getMe(USER_ID)).rejects.toBe(UserNotFoundException)
  })

  it('updateMe: omit and null both KEEP the current value', async () => {
    const d = makeDeps()
    await make(d).updateMe(USER_ID, { displayName: null })
    expect(d.repo.updateMe).toHaveBeenCalledWith(USER_ID, {})
  })

  it("updateMe: '' CLEARS displayName/avatar to null", async () => {
    const d = makeDeps()
    await make(d).updateMe(USER_ID, { displayName: '', avatar: '' })
    expect(d.repo.updateMe).toHaveBeenCalledWith(USER_ID, { displayName: null, avatar: null })
  })

  it('updateMe writes name + phoneNumber when provided', async () => {
    const d = makeDeps()
    await make(d).updateMe(USER_ID, { name: 'Kishimoto', phoneNumber: '+84900000000' })
    expect(d.repo.updateMe).toHaveBeenCalledWith(USER_ID, { name: 'Kishimoto', phoneNumber: '+84900000000' })
  })

  it('updateMe records an audit entry AFTER the write', async () => {
    const d = makeDeps()
    await make(d).updateMe(USER_ID, { name: 'Kishimoto' })
    expect(d.audit.record).toHaveBeenCalledWith({
      actorId: USER_ID,
      entityType: AuditEntityType.USER,
      entityId: USER_ID,
      action: 'PROFILE_UPDATE'
    })
  })

  it('updateMe throws 404 when the user does not exist', async () => {
    const d = makeDeps()
    d.repo.findMeById.mockResolvedValue(null)
    await expect(make(d).updateMe(USER_ID, { name: 'X' } as any)).rejects.toBe(UserNotFoundException)
    expect(d.repo.updateMe).not.toHaveBeenCalled()
  })
})
