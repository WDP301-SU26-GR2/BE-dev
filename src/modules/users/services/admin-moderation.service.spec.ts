import { $Enums, NotificationType } from '@prisma/client'
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
  const service = new AdminModerationService(
    usersRepository as never,
    hashingService as never,
    emailQueue as never,
    notificationService as never
  )
  return { service, usersRepository, hashingService, emailQueue, notificationService }
}

const UID = '507f1f77bcf86cd799439011'

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

    await expect(service.updateStatus('bad-id', { status: $Enums.UserStatus.BANNED })).rejects.toBe(
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

    await expect(service.updateStatus(UID, { status: $Enums.UserStatus.BANNED })).rejects.toBe(
      CannotModifyAdminUserException
    )
  })

  it('throws UserNotFoundException when target is soft-deleted', async () => {
    const { service, usersRepository } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue({ ...activeTarget, deletedAt: new Date() })

    await expect(service.updateStatus(UID, { status: $Enums.UserStatus.BLOCKED })).rejects.toBe(UserNotFoundException)
  })

  it('bans with reason: updates, revokes refresh, notifies USER_BANNED, returns admin view', async () => {
    const { service, usersRepository, notificationService } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue(activeTarget)
    usersRepository.updateUserStatus.mockResolvedValue(adminUserRow($Enums.UserStatus.BANNED))

    const res = await service.updateStatus(UID, { status: $Enums.UserStatus.BANNED, reason: 'spam' })

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
  })

  it('unban to ACTIVE: no revoke, notifies USER_REACTIVATED', async () => {
    const { service, usersRepository, notificationService } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue({ ...activeTarget, status: $Enums.UserStatus.BANNED })
    usersRepository.updateUserStatus.mockResolvedValue(adminUserRow($Enums.UserStatus.ACTIVE))

    await service.updateStatus(UID, { status: $Enums.UserStatus.ACTIVE })

    expect(usersRepository.revokeRefreshTokensByUserId).not.toHaveBeenCalled()
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ referenceType: 'USER_REACTIVATED' })
    )
  })

  it('same status = no-op side effects (no revoke, no notify)', async () => {
    const { service, usersRepository, notificationService } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue(activeTarget)
    usersRepository.updateUserStatus.mockResolvedValue(adminUserRow($Enums.UserStatus.ACTIVE))

    await service.updateStatus(UID, { status: $Enums.UserStatus.ACTIVE })

    expect(usersRepository.revokeRefreshTokensByUserId).not.toHaveBeenCalled()
    expect(notificationService.notifySafe).not.toHaveBeenCalled()
  })
})

describe('AdminModerationService.deleteUser', () => {
  it('throws UserAlreadyDeletedException when already soft-deleted', async () => {
    const { service, usersRepository } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue({ ...activeTarget, deletedAt: new Date() })

    await expect(service.deleteUser(UID)).rejects.toBe(UserAlreadyDeletedException)
  })

  it('soft-deletes user and revokes refresh tokens', async () => {
    const { service, usersRepository } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue(activeTarget)
    usersRepository.softDeleteUser.mockResolvedValue({ id: UID })

    const res = await service.deleteUser(UID)

    expect(usersRepository.softDeleteUser).toHaveBeenCalledWith(UID, expect.any(Date))
    expect(usersRepository.revokeRefreshTokensByUserId).toHaveBeenCalledWith(UID)
    expect(res).toEqual({ message: 'User deleted successfully' })
  })
})

describe('AdminModerationService.restoreUser', () => {
  it('throws UserNotDeletedException when target is not deleted', async () => {
    const { service, usersRepository } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue(activeTarget)

    await expect(service.restoreUser(UID)).rejects.toBe(UserNotDeletedException)
  })

  it('restores a soft-deleted user and returns admin view', async () => {
    const { service, usersRepository } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue({ ...activeTarget, deletedAt: new Date() })
    usersRepository.restoreUser.mockResolvedValue(adminUserRow($Enums.UserStatus.ACTIVE))

    const res = await service.restoreUser(UID)

    expect(usersRepository.restoreUser).toHaveBeenCalledWith(UID)
    expect(res.id).toBe(UID)
    expect(res).not.toHaveProperty('password')
  })
})

describe('AdminModerationService.resetPassword', () => {
  it('throws UserNotFoundException when target is soft-deleted', async () => {
    const { service, usersRepository } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue({ ...activeTarget, deletedAt: new Date() })

    await expect(service.resetPassword(UID)).rejects.toBe(UserNotFoundException)
  })

  it('sets hashed temporary password, revokes refresh, sends email best-effort, and returns password once', async () => {
    const { service, usersRepository, hashingService, emailQueue } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue(activeTarget)
    usersRepository.resetUserPassword.mockResolvedValue({ id: UID })

    const res = await service.resetPassword(UID)

    expect(hashingService.hash).toHaveBeenCalledWith(res.temporaryPassword)
    expect(usersRepository.resetUserPassword).toHaveBeenCalledWith(UID, 'hashed-temp')
    expect(usersRepository.revokeRefreshTokensByUserId).toHaveBeenCalledWith(UID)
    expect(emailQueue.enqueueAdminCred).toHaveBeenCalledWith({
      email: 'user@example.com',
      name: 'User One',
      temporaryPassword: res.temporaryPassword
    })
    expect(res.temporaryPassword).toEqual(expect.any(String))
  })

  it('still returns temporary password when email enqueue fails', async () => {
    const { service, usersRepository, emailQueue } = makeService()
    usersRepository.findModerationTargetById.mockResolvedValue(activeTarget)
    emailQueue.enqueueAdminCred.mockRejectedValueOnce(new Error('redis down'))

    const res = await service.resetPassword(UID)

    expect(res.temporaryPassword).toEqual(expect.any(String))
  })
})
