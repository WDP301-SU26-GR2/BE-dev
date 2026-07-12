import { Injectable } from '@nestjs/common'
import { RoleName, RoleNameType } from 'src/core/security/constants/role.constant'
import { ProfileNotFoundException } from '../errors/users.errors'
import { StaffProfileBodyType } from '../schemas/users-schemas'
import { UsersRepository } from '../users.repo'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/
const STAFF_ROLES: RoleNameType[] = [RoleName.EDITOR, RoleName.BOARD_MEMBER]

@Injectable()
export class StaffProfileService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async upsertMyProfile(userId: string, body: StaffProfileBodyType) {
    await this.usersRepository.upsertStaffProfile(userId, body)
    return this.getByUserId(userId)
  }

  async getByUserId(userId: string) {
    if (!OBJECT_ID_RE.test(userId)) throw ProfileNotFoundException

    const profile = await this.usersRepository.findStaffProfileByUserId(userId)
    if (profile) {
      const { user, ...rest } = profile
      return {
        ...rest,
        role: (user?.role.code ?? RoleName.EDITOR) as RoleNameType,
        displayName: user?.displayName ?? null,
        avatar: user?.avatar ?? null,
        hasProfile: true
      }
    }

    // Graceful (A-AUTH-09 pattern): đúng role nhưng chưa build hồ sơ → vẫn trả basics + default rỗng.
    const user = await this.usersRepository.findUserBasicsWithRole(userId)
    if (!user || !STAFF_ROLES.includes(user.role.code as RoleNameType)) throw ProfileNotFoundException

    return {
      userId,
      role: user.role.code as RoleNameType,
      specialtyGenres: [],
      demographics: [],
      bio: null,
      yearsOfExperience: null,
      displayName: user.displayName ?? null,
      avatar: user.avatar ?? null,
      hasProfile: false
    }
  }
}
