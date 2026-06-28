import { Injectable } from '@nestjs/common'
import { $Enums } from '@prisma/client'
import { UserNotFoundException } from '../errors/users.errors'
import { ListUsersQueryType } from '../schemas/users-schemas'
import { AdminUserFilter, UsersRepository } from '../users.repo'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

type AdminUserRow = {
  id: string
  email: string
  name: string
  displayName: string | null
  phoneNumber: string
  avatar: string | null
  status: $Enums.UserStatus
  emailVerified: boolean
  registrationType: $Enums.RegistrationType
  mustChangePassword: boolean
  createdAt: Date
  role: { code: string }
}

function toAdminUserView(u: AdminUserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    displayName: u.displayName,
    phoneNumber: u.phoneNumber,
    avatar: u.avatar,
    role: u.role.code as $Enums.RoleCode,
    status: u.status,
    emailVerified: u.emailVerified,
    registrationType: u.registrationType,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt.toISOString()
  }
}

@Injectable()
export class AdminUserQueryService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async list(callerId: string, query: ListUsersQueryType) {
    const filter: AdminUserFilter = {
      excludeUserId: callerId,
      roleCode: query.roleCode,
      status: query.status,
      search: query.search,
      includeDeleted: query.includeDeleted
    }
    const [rows, total] = await Promise.all([
      this.usersRepository.findUsersForAdmin(filter, { limit: query.limit, offset: query.offset }),
      this.usersRepository.countUsersForAdmin(filter)
    ])
    return {
      items: rows.map((r) => toAdminUserView(r)),
      total,
      limit: query.limit,
      offset: query.offset
    }
  }

  async getById(id: string) {
    if (!OBJECT_ID_RE.test(id)) throw UserNotFoundException
    const row = await this.usersRepository.findUserByIdForAdmin(id)
    if (!row) throw UserNotFoundException
    return toAdminUserView(row)
  }
}
