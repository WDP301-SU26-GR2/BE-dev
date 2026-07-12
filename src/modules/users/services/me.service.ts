import { Injectable } from '@nestjs/common'
import { AuditEntityType, Prisma } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import { UserNotFoundException } from '../errors/users.errors'
import { UpdateMeBodyType } from '../schemas/users-schemas'
import { toMeRes } from '../users.mapper'
import { UsersRepository } from '../users.repo'

@Injectable()
export class MeService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly auditService: AuditService
  ) {}

  async getMe(userId: string) {
    const user = await this.usersRepository.findMeById(userId)
    if (!user) throw UserNotFoundException
    return toMeRes(user)
  }

  /**
   * Partial-update (AGENTS §10): omit hoặc null → GIỮ NGUYÊN.
   * Riêng displayName/avatar (nullable): chuỗi rỗng '' = sentinel XOÁ → ghi null.
   * name/phoneNumber là field bắt buộc trên User → schema đã chặn '' (min(2) / E.164).
   */
  async updateMe(userId: string, body: UpdateMeBodyType) {
    const existing = await this.usersRepository.findMeById(userId)
    if (!existing) throw UserNotFoundException

    const data: Prisma.UserUpdateInput = {}
    if (body.name != null) data.name = body.name
    if (body.phoneNumber != null) data.phoneNumber = body.phoneNumber
    if (body.displayName != null) data.displayName = body.displayName === '' ? null : body.displayName
    if (body.avatar != null) data.avatar = body.avatar === '' ? null : body.avatar

    const updated = await this.usersRepository.updateMe(userId, data)

    // Audit SAU commit, best-effort (AuditService tự nuốt lỗi).
    await this.auditService.record({
      actorId: userId,
      entityType: AuditEntityType.USER,
      entityId: userId,
      action: 'PROFILE_UPDATE'
    })

    return toMeRes(updated)
  }
}
