import { $Enums, AuditEntityType, NotificationType } from '@prisma/client'
import {
  CannotModifyAdminUserException,
  UserAlreadyDeletedException,
  UserNotDeletedException,
  UserNotFoundException
} from '../errors/users.errors'
import { AdminModerationService } from './admin-moderation.service'

function makeService() {
  const usersRepository = {
    findModerationTargetById: jest.fn(),
    updateUserStatus: jest.fn(),
    softDeleteUser: jest.fn(),
    restoreUser: jest.fn(),
    resetUserPassword: jest.fn(),
    revokeRefreshTokensByUserId: jest.fn()
  }
  const hashingService = { hash: jest.fn().mockResolvedValue('hashed-temp') }
  const emailQueue = { enqueueAdminCred: jest.fn().mockResolvedValue(undefined) }
  const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const audit = { record: jest.fn().mockResolvedValue(undefined) }
  const service = new AdminModerationService(
    usersRepository as never,
    hashingService as never,
    emailQueue as never,
    notificationService as never,
    audit as never
  )
  return { service, usersRepository, hashingService, emailQueue, notificationService, audit }
}

const UID = '507f1f77bcf86cd799439011'
const ADMIN_ID = '507f1f77bcf86cd799439012'

const activeTarget = {
  id: UID,
  email: 'user@example.com',
  name: 'User One',
  status: $Enums.UserStatus.ACTIVE,
  deletedAt: null,
  role: { code: $Enums.RoleCode.MANGAKA }
}

// Row shape trả từ repo (ADMIN_USER_SELECT) — đầu vào của toAdminUserView
const adminUserRow = (status: $Enums.UserStatus) => ({
  id: UID,
  email: 'user@example.com',
  name: 'User One',
  displayName: null,
  phoneNumber: '0900000000',
  avatar: null,
  status,
  emailVerified: true,
  registrationType: $Enums.RegistrationType.SELF_REGISTERED,
  mustChangePassword: false,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  role: { code: $Enums.RoleCode.MANGAKA }
})

describe('AdminModerationService.updateStatus', () => {
  it('throws UserNotFoundException for malformed id without hitting repo', async () => {
    const { service, usersRepository } = makeService()

    await expect(service.updateStatus('bad-id', { status: $Enums.UserStatus.BANNED }, ADMIN_ID)).rejects.toBe(
      UserNotFoundException
    )
    expect(usersRepository.findModerationTargetById).not.toHaveBeenCalled()
  })

  it('throws CannotModifyAdminUserException for SUPER_ADMIN target', async () => {
    const { service, usersRepository } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue({
      ...activeTarget,
      role: { code: $Enums.RoleCode.SUPER_ADMIN }
    })

    await expect(service.updateStatus(UID, { status: $Enums.UserStatus.BANNED }, ADMIN_ID)).rejects.toBe(
      CannotModifyAdminUserException
    )
  })

  it('throws UserNotFoundException when target is soft-deleted', async () => {
    const { service, usersRepository } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue({ ...activeTarget, deletedAt: new Date() })

    await expect(service.updateStatus(UID, { status: $Enums.UserStatus.BLOCKED }, ADMIN_ID)).rejects.toBe(
      UserNotFoundException
    )
  })

  it('bans with reason: updates, revokes refresh, notifies USER_BANNED, returns admin view', async () => {
    const { service, usersRepository, notificationService, audit } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue(activeTarget)
    usersRepository.updateUserStatus.mockResolvedValue(adminUserRow($Enums.UserStatus.BANNED))

    const res = await service.updateStatus(UID, { status: $Enums.UserStatus.BANNED, reason: 'spam' }, ADMIN_ID)

    expect(usersRepository.updateUserStatus).toHaveBeenCalledWith(UID, $Enums.UserStatus.BANNED)
    expect(usersRepository.revokeRefreshTokensByUserId).toHaveBeenCalledWith(UID)
    expect(notificationService.notifySafe).toHaveBeenCalledWith({
      recipientId: UID,
      type: NotificationType.SYSTEM,
      referenceId: UID,
      referenceType: 'USER_BANNED',
      content: 'Your account has been banned: spam'
    })
    expect(res.status).toBe($Enums.UserStatus.BANNED)
    expect(res.createdAt).toBe('2026-07-01T00:00:00.000Z')
    expect(res).not.toHaveProperty('password')
    expect(audit.record).toHaveBeenCalledWith({
      actorId: ADMIN_ID,
      entityType: AuditEntityType.USER,
      entityId: UID,
      action: 'BAN',
      fromState: $Enums.UserStatus.ACTIVE,
      toState: $Enums.UserStatus.BANNED,
      reason: 'spam'
    })
  })

  it('unban to ACTIVE: no revoke, notifies USER_REACTIVATED', async () => {
    const { service, usersRepository, notificationService, audit } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue({ ...activeTarget, status: $Enums.UserStatus.BANNED })
    usersRepository.updateUserStatus.mockResolvedValue(adminUserRow($Enums.UserStatus.ACTIVE))

    await service.updateStatus(UID, { status: $Enums.UserStatus.ACTIVE }, ADMIN_ID)

    expect(usersRepository.revokeRefreshTokensByUserId).not.toHaveBeenCalled()
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ referenceType: 'USER_REACTIVATED' })
    )
    expect(audit.record).toHaveBeenCalledWith({
      actorId: ADMIN_ID,
      entityType: AuditEntityType.USER,
      entityId: UID,
      action: 'REACTIVATE',
      fromState: $Enums.UserStatus.BANNED,
      toState: $Enums.UserStatus.ACTIVE,
      reason: undefined
    })
  })

  it('same status = no-op side effects (no revoke, no notify)', async () => {
    const { service, usersRepository, notificationService } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue(activeTarget)
    usersRepository.updateUserStatus.mockResolvedValue(adminUserRow($Enums.UserStatus.ACTIVE))

    await service.updateStatus(UID, { status: $Enums.UserStatus.ACTIVE }, ADMIN_ID)

    expect(usersRepository.revokeRefreshTokensByUserId).not.toHaveBeenCalled()
    expect(notificationService.notifySafe).not.toHaveBeenCalled()
  })
})

describe('AdminModerationService.deleteUser', () => {
  it('throws UserAlreadyDeletedException when already soft-deleted', async () => {
    const { service, usersRepository } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue({ ...activeTarget, deletedAt: new Date() })

    await expect(service.deleteUser(UID, ADMIN_ID)).rejects.toBe(UserAlreadyDeletedException)
  })

  it('soft-deletes user and revokes refresh tokens', async () => {
    const { service, usersRepository, audit } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue(activeTarget)
    usersRepository.softDeleteUser.mockResolvedValue({ id: UID })

    const res = await service.deleteUser(UID, ADMIN_ID)

    expect(usersRepository.softDeleteUser).toHaveBeenCalledWith(UID, expect.any(Date))
    expect(usersRepository.revokeRefreshTokensByUserId).toHaveBeenCalledWith(UID)
    expect(res).toEqual({ message: 'User deleted successfully' })
    expect(audit.record).toHaveBeenCalledWith({
      actorId: ADMIN_ID,
      entityType: AuditEntityType.USER,
      entityId: UID,
      action: 'SOFT_DELETE'
    })
  })
})

describe('AdminModerationService.restoreUser', () => {
  it('throws UserNotDeletedException when target is not deleted', async () => {
    const { service, usersRepository } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue(activeTarget)

    await expect(service.restoreUser(UID, ADMIN_ID)).rejects.toBe(UserNotDeletedException)
  })

  it('restores a soft-deleted user and returns admin view', async () => {
    const { service, usersRepository, audit } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue({ ...activeTarget, deletedAt: new Date() })
    usersRepository.restoreUser.mockResolvedValue(adminUserRow($Enums.UserStatus.ACTIVE))

    const res = await service.restoreUser(UID, ADMIN_ID)

    expect(usersRepository.restoreUser).toHaveBeenCalledWith(UID)
    expect(res.id).toBe(UID)
    expect(res).not.toHaveProperty('password')
    expect(audit.record).toHaveBeenCalledWith({
      actorId: ADMIN_ID,
      entityType: AuditEntityType.USER,
      entityId: UID,
      action: 'RESTORE'
    })
  })
})

describe('AdminModerationService.resetPassword', () => {
  it('throws UserNotFoundException when target is soft-deleted', async () => {
    const { service, usersRepository } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue({ ...activeTarget, deletedAt: new Date() })

    await expect(service.resetPassword(UID, ADMIN_ID)).rejects.toBe(UserNotFoundException)
  })

  it('sets hashed temporary password, revokes refresh, sends email best-effort, and returns password once', async () => {
    const { service, usersRepository, hashingService, emailQueue, audit } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue(activeTarget)
    usersRepository.resetUserPassword.mockResolvedValue({ id: UID })

    const res = await service.resetPassword(UID, ADMIN_ID)

    expect(hashingService.hash).toHaveBeenCalledWith(res.temporaryPassword)
    expect(usersRepository.resetUserPassword).toHaveBeenCalledWith(UID, 'hashed-temp')
    expect(usersRepository.revokeRefreshTokensByUserId).toHaveBeenCalledWith(UID)
    expect(emailQueue.enqueueAdminCred).toHaveBeenCalledWith({
      email: 'user@example.com',
      name: 'User One',
      temporaryPassword: res.temporaryPassword
    })
    expect(res.temporaryPassword).toEqual(expect.any(String))
    expect(audit.record).toHaveBeenCalledWith({
      actorId: ADMIN_ID,
      entityType: AuditEntityType.USER,
      entityId: UID,
      action: 'RESET_PASSWORD'
    })
    expect(audit.record.mock.calls[0][0]).not.toHaveProperty('reason')
  })

  it('still returns temporary password when email enqueue fails', async () => {
    const { service, usersRepository, emailQueue } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue(activeTarget)
    emailQueue.enqueueAdminCred.mockRejectedValueOnce(new Error('redis down'))

    const res = await service.resetPassword(UID, ADMIN_ID)

    expect(res.temporaryPassword).toEqual(expect.any(String))
  })
})
