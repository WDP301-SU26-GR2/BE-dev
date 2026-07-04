import { Injectable, Logger } from '@nestjs/common'
import { $Enums, NotificationType } from '@prisma/client'
import { HashingService } from 'src/infrastructure/crypto/hashing.service'
import { EmailQueue } from 'src/infrastructure/email/email.queue'
import { NotificationService } from 'src/modules/notification/notification.service'
import {
  CannotModifyAdminUserException,
  UserAlreadyDeletedException,
  UserNotDeletedException,
  UserNotFoundException
} from '../errors/users.errors'
import { generateTemporaryPassword } from '../helpers/temp-password.helper'
import { AdminUpdateUserStatusBodyType } from '../schemas/users-schemas'
import { UsersMessages } from '../users.messages'
import { UsersRepository } from '../users.repo'
import { toAdminUserView } from './admin-user-query.service'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

type ModerationTarget = Awaited<ReturnType<UsersRepository['findModerationTargetById']>>

@Injectable()
export class AdminModerationService {
  private readonly logger = new Logger(AdminModerationService.name)

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly hashingService: HashingService,
    private readonly emailQueue: EmailQueue,
    private readonly notificationService: NotificationService
  ) {}

  private async getTarget(id: string): Promise<NonNullable<ModerationTarget>> {
    if (!OBJECT_ID_RE.test(id)) throw UserNotFoundException
    const target = await this.usersRepository.findModerationTargetById(id)
    if (!target) throw UserNotFoundException
    if (target.role.code === $Enums.RoleCode.SUPER_ADMIN) throw CannotModifyAdminUserException
    return target
  }

  async updateStatus(id: string, body: AdminUpdateUserStatusBodyType) {
    const target = await this.getTarget(id)
    if (target.deletedAt) throw UserNotFoundException

    const updated = await this.usersRepository.updateUserStatus(id, body.status)
    if (target.status !== body.status) {
      if (body.status === $Enums.UserStatus.BANNED || body.status === $Enums.UserStatus.BLOCKED) {
        await this.usersRepository.revokeRefreshTokensByUserId(id)
      }
      const notice =
        body.status === $Enums.UserStatus.BANNED
          ? { referenceType: 'USER_BANNED', content: UsersMessages.notification.banned(body.reason) }
          : body.status === $Enums.UserStatus.BLOCKED
            ? { referenceType: 'USER_BLOCKED', content: UsersMessages.notification.blocked(body.reason) }
            : { referenceType: 'USER_REACTIVATED', content: UsersMessages.notification.reactivated }
      await this.notificationService.notifySafe({
        recipientId: id,
        type: NotificationType.SYSTEM,
        referenceId: id,
        ...notice
      })
    }

    return toAdminUserView(updated)
  }

  async deleteUser(id: string) {
    const target = await this.getTarget(id)
    if (target.deletedAt) throw UserAlreadyDeletedException

    await this.usersRepository.softDeleteUser(id, new Date())
    await this.usersRepository.revokeRefreshTokensByUserId(id)

    return { message: UsersMessages.response.userDeleted }
  }

  async restoreUser(id: string) {
    const target = await this.getTarget(id)
    if (!target.deletedAt) throw UserNotDeletedException

    const restored = await this.usersRepository.restoreUser(id)
    return toAdminUserView(restored)
  }

  async resetPassword(id: string) {
    const target = await this.getTarget(id)
    if (target.deletedAt) throw UserNotFoundException

    const temporaryPassword = generateTemporaryPassword()
    const password = await this.hashingService.hash(temporaryPassword)
    await this.usersRepository.resetUserPassword(id, password)
    await this.usersRepository.revokeRefreshTokensByUserId(id)

    try {
      await this.emailQueue.enqueueAdminCred({
        email: target.email,
        name: target.name,
        temporaryPassword
      })
    } catch (mailError) {
      this.logger.warn(`Failed to send reset credential email to ${target.email}: ${String(mailError)}`)
    }

    return { temporaryPassword }
  }
}
