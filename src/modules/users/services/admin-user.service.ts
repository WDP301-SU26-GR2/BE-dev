import { Injectable, Logger } from '@nestjs/common'
import { HashingService } from 'src/infrastructure/crypto/hashing.service'
import { EmailQueue } from 'src/infrastructure/email/email.queue'
import { isUniqueConstrainError } from 'src/infrastructure/database/prisma-error.helper'
import { UserEmailExistsException } from '../errors/users.errors'
import { generateTemporaryPassword } from '../helpers/temp-password.helper'
import { AdminCreateUserBodyType } from '../schemas/users-schemas'
import { UsersRepository } from '../users.repo'

@Injectable()
export class AdminUserService {
  private readonly logger = new Logger(AdminUserService.name)

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly hashingService: HashingService,
    private readonly emailQueue: EmailQueue
  ) {}

  async createUser(body: AdminCreateUserBodyType) {
    const roleId = await this.usersRepository.getRoleIdByCode(body.roleCode)
    const temporaryPassword = generateTemporaryPassword()
    const passwordHash = await this.hashingService.hash(temporaryPassword)

    try {
      const user = await this.usersRepository.createAdminUser({
        email: body.email,
        name: body.name,
        phoneNumber: body.phoneNumber,
        password: passwordHash,
        roleId
      })

      // Best-effort: email failure must NOT fail the request (admin still has temporaryPassword in response).
      try {
        await this.emailQueue.enqueueAdminCred({
          email: body.email,
          name: body.name,
          temporaryPassword
        })
      } catch (mailError) {
        this.logger.warn(`Failed to send credential email to ${body.email}: ${String(mailError)}`)
      }

      return {
        id: user.id,
        email: user.email,
        roleCode: body.roleCode,
        temporaryPassword
      }
    } catch (error) {
      if (isUniqueConstrainError(error)) throw UserEmailExistsException
      throw error
    }
  }
}
