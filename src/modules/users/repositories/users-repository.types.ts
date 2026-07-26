import { Genre, Specialization, UserStatus } from '@prisma/client'
import { RoleNameType } from 'src/core/security/constants/role.constant'

export type AdminUserFilter = {
  excludeUserId?: string
  roleCode?: RoleNameType
  status?: UserStatus
  search?: string
  includeDeleted?: boolean
  onlyDeleted?: boolean
}

export type AssistantDirectoryFilter = {
  q?: string
  specialization?: Specialization
  level?: string
  availableFrom?: string
  availableTo?: string
}

export type MangakaDirectoryFilter = {
  q?: string
  genre?: Genre
  level?: string
}

export type UserRoleCountRow = {
  role: { code: RoleNameType }
  _count: { _all: number }
}
